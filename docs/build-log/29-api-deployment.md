# API deployment

## What this session was for (2026-08-06)

One question: where does the API actually run? Everything before this had a
server that worked on a laptop and a `NEXT` section that said no provider
resource existed. Picking a host is not a coding problem, so most of this
session was elimination, and two of the three eliminations came from the
provider rather than from a preference.

## What was already done before the first commit

The Supabase project existed, `002_sync_contract.sql` was applied, and
`npm run check-provider` passed all three checks against it. That covered the
first half of the old `NEXT`. What it did not cover, and what nothing in the
repo could tell you, was that `DATABASE_URL` still pointed at the direct
connection.

The project is in `us-west-2`. Nothing says so directly — the direct database
host resolves to `2600:1f14:359d:9302:626f:fdaf:9fb0:324a`, and matching that
against `ip-ranges.json` puts the prefix `2600:1f14::/34` in `us-west-2`. The
API region follows the database, since every request it serves talks to that
Postgres.

That same lookup found the first real constraint. The direct host publishes an
AAAA record and no A record, and a Lambda outside a VPC has no IPv6 egress, so
the direct connection is not slow from Lambda, it is unreachable. Switching
`DATABASE_URL` to the transaction pooler on port 6543 was a prerequisite, not a
tuning step. It is safe only because no query in `src/` is issued as a named
prepared statement, which transaction pooling would break.

## Choosing the host

App Runner was the original answer and is not available. It closed to new
customers on 2026-04-30, and the account gets `SubscriptionRequiredException`
on any call. Its managed Node runtime also stops at 22, and this server needs
24 or later because it runs TypeScript with no build step.

That left Lambda. See [D28](../decisions.md) for the alternatives and the
reasoning; the rest of this file is what happened.

## Packaging

`d0a501a` added [`run.sh`](../../server/run.sh) and a
`package-lambda.sh` deployment helper. That helper was removed when the AWS
path was sidelined for the local-only iOS release.

The AWS Lambda Web Adapter is what makes this work without touching `src/`. It
is a layer that starts an ordinary HTTP server, waits for its port, and turns
each invoke into a request against it. The alternative was a serverless adapter
library, which needs a JavaScript handler file — and this project has no build
step, so there is no JavaScript to point at. The adapter runs `npm start`
instead and the question disappears.

The zip mirrors the repo rather than flattening `server/` to the root, because
`src/syncContract.ts` imports `../../contracts/syncFormat.ts`. Flattened, that
path climbs out of `/var/task` and fails on the first sync request. A root
`package.json` declaring `{"type":"module"}` is written in for a smaller
reason: `contracts/` sits above `server/package.json`, so without it Node
reparses the file and pays that cost on every cold start.

`319b738` fixed the packaging bug this shook out. Startup calls
`assertSchemaCurrent`, which reads `server/migrations/` and compares it against
what the database reports as applied. That directory was not copied, so the
process died on boot with `ENOENT` and every request returned 500. It looked
like a deployment failure and was a packaging failure.

## The Function URL that never worked

A Lambda Function URL was built first and returned 403 on every request. The
resource policy was correct — `Principal: "*"`, `lambda:InvokeFunctionUrl`,
auth type `NONE` — and it was not a propagation delay.

The evidence that settled it: no log group existed. The function had never been
invoked, so nothing in `src/` was involved. Accounts created recently block
public access to Lambda by default, and that setting overrides the function's
own resource policy, which is why the policy reads as correct and grants
nothing.

The documented workaround is to also grant `lambda:InvokeFunction` to `*`. It
works by being wider than a Function URL needs — any AWS account could then
invoke the function directly — and by stepping around a control that was turned
on deliberately. It was rejected on those grounds.

## What replaced it

`b673a67` added a `deploy-lambda.sh` helper, which packaged, created or updated
the function, and printed the endpoint. That helper was removed when the AWS
path was sidelined for the local-only iOS release.

API Gateway invokes as a service principal, so there is no public resource
policy for the block to override, and the grant names one API's ARN rather than
a wildcard. Quick create (`create-api --target`) builds the proxy integration,
a `$default` route catching every path and method, and an auto-deploying
`$default` stage. A catch-all is right here because Express already does the
routing; per-route configuration would be a second copy of it to keep in sync.

The one thing quick create does not do from the CLI is add the Lambda
permission, and without it every request is a 500.

Secrets are read from `server/.env` with `node --env-file` — the same parser
the local server uses, so the two cannot disagree about quoting — into a
`chmod 600` temp file removed on exit. Nothing sensitive reaches a command
line, where `ps` would show it.

The script also deletes the Function URL and its public permission, so no
second permanently broken entry point is left pointing at the function.

## What this proves, and what it does not

`/health` answers 200, `/v1/me` answers 401 unauthenticated, cold start 1.16s
and warm 0.22s. All of that is one laptop hitting one endpoint.

`TRUST_PROXY_HOPS=1` is a reading of how the adapter forwards the caller
address, not a measurement. The structured request log records method, path,
status, and duration, but no client address, so there is nothing to check it
against. A second address would settle it.

The rate limiter is the real regression. `rateLimit.ts` counts in one process's
memory and Lambda runs concurrent environments that share none, so it now
bounds each instance rather than each caller. The file already named the fix
before this session started: a shared store behind the same interface, not a
bigger `Map`. It is deliberately not bundled with this work, because changing
the runtime and the limiter together would leave no way to tell which half
broke.

`d3310ea` fixed an unrelated staleness noticed on the way past: the email OTP
gate was added in `0bc76e3` and the two places pointing at that section still
said there were two Auth settings.
