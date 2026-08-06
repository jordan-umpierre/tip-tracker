# Tip Tracker API

This package is the authenticated cloud boundary from D22 and D24. It does not
replace the Expo app's SQLite database. It exposes the provider-free,
authenticated server half of push/pull; the mobile client that calls it landed
with D26.

Every finished request writes one JSON line to stdout with its method, path,
status, duration, and — once a token has actually verified — the account
subject. Request bodies, query strings, and `Authorization` headers are never
logged. A `/health` or `/ready` probe is logged only when it fails, so a
polling platform does not bury real traffic.

Every request except `/health` and `/ready` is rate limited by client address:
600 per minute, counted in this process's memory, answered with `429` and a
`Retry-After` header. That budget is sized for D26's serialized one-mutation
push, where a first upload of a long shift history is hundreds of legitimate
sequential requests. The counter is per process, so running more than one
instance multiplies the real budget by the instance count.

## Local verification

Requirements: Node 24 or newer and a local PostgreSQL server. The database user
must be allowed to create and drop temporary databases.

```sh
npm ci
npm run verify
```

Tests use `postgresql://localhost/postgres` by default. Set
`TEST_DATABASE_URL` to another administrative database URL when needed. Tests
create a uniquely named database, run the real migration and assertions, then
drop it. Never point this variable at a database whose name or contents matter.

## Runtime configuration

The server refuses to start unless all provider-dependent values are present:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Least-privilege runtime connection to Postgres |
| `SUPABASE_ISSUER` | Exact expected access-token issuer |
| `SUPABASE_AUDIENCE` | Exact expected access-token audience |
| `SUPABASE_JWKS_URL` | HTTPS endpoint containing public signing keys |
| `SUPABASE_URL` | HTTPS base URL used by the server-only Auth admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used to delete the authenticated identity |
| `HOST` | Listen address; defaults to `0.0.0.0` |
| `PORT` | Listen port; defaults to `3000` |
| `TRUST_PROXY_HOPS` | Proxies in front of this process; defaults to `0` |

`TRUST_PROXY_HOPS` is optional but effectively required once deployed. Every
request is rate limited by client address, and Express only reads that address
out of `X-Forwarded-For` when it is told how many trailing entries are
infrastructure. Leaving it at `0` behind a load balancer makes every request
look like it came from the balancer, so all traffic shares one bucket and the
limit throttles everyone at once. Setting it higher than the real number lets a
client forge the header and choose its own bucket.

Once a real project exists, check the variables against it before deploying:

```sh
npm run check-provider
```

It reads the same environment the server will get and proves the three things
`readConfig` cannot see from the strings alone: that the project publishes
asymmetric signing keys this server can verify with, that
`SUPABASE_SERVICE_ROLE_KEY` is accepted by the Auth admin API that account
deletion calls, and that `DATABASE_URL` reaches a database whose schema is
current. All three run even after one fails. It does not check the three Auth
settings below, which need a Management API personal access token.

Apply migrations with owner credentials before starting the runtime process:

```sh
MIGRATION_DATABASE_URL="postgresql://..." npm run migrate
npm start
```

## Deploying

This runs on AWS Lambda behind an API Gateway HTTP API, in `us-west-2` because
that is where the Supabase project is. Reasoning is in
[D28](../docs/decisions.md). One command, from the repository root:

```sh
./scripts/deploy-lambda.sh
```

It packages, then creates or updates everything, so re-running it is the normal
way to ship a change. It prints the endpoint when it finishes.

Nothing in `src/` knows it is on Lambda. The AWS Lambda Web Adapter layer
starts `run.sh`, waits for the port, and turns each invoke into an ordinary
HTTP request, which is what keeps this host swappable and keeps the local
`npm start` path identical to the deployed one.

Two prerequisites the script does not create: the AWS CLI configured for
`us-west-2`, and an execution role named `tip-tracker-api-lambda` holding
`AWSLambdaBasicExecutionRole`. It reads the same `.env` this document
describes, so verify with `npm run check-provider` first.

`DATABASE_URL` must be Supabase's **transaction pooler** on port 6543, not the
direct connection. The direct host publishes only an AAAA record and a Lambda
outside a VPC has no IPv6 egress, so the direct connection is unreachable from
there. Transaction pooling is safe only while no query is issued as a named
prepared statement.

Logs:

```sh
aws logs tail /aws/lambda/tip-tracker-api --since 10m --region us-west-2
```

Two limits worth knowing before anyone else installs a build. The rate limiter
counts in one process's memory, and Lambda runs concurrent environments that
share none, so it currently bounds each instance rather than each caller. A new
AWS account is also capped at 10 concurrent executions until AWS raises it.

Migration-owner credentials and the database password are server secrets. They
must never use Expo's `EXPO_PUBLIC_` prefix or enter the mobile application.
The service-role key has the same server-only boundary.
The runtime role should receive only the private `app` schema privileges its
implemented queries need; role grants wait for the actual managed project roles
instead of guessing provider-owned names locally.

The migration runner records each file name and SHA-256 checksum in
`app.schema_migrations`, runs each pending migration in its own transaction,
and refuses missing, reordered, or modified history. Startup applies nothing:
it refuses traffic until the tracked schema is current. `/health` proves only
that the process is alive; `/ready` also proves PostgreSQL is reachable and the
schema ledger exactly matches the server.

`001_initial.sql` was corrected before any hosted database existed. The first
managed database must therefore be created from the current migration set; no
live migration or data conversion is claimed. If an earlier local scratch
database used the old draft, drop and recreate that disposable database.

## Sync API

Both routes require `Authorization: Bearer <Supabase access token>`. The
verified token subject is the account; requests cannot select an account id.

### Push one mutation

`POST /v1/sync/mutations` accepts exactly one JSON mutation, with a maximum
UTF-8 body size of 10,500,000 bytes:

```json
{
  "deviceId": "10000000-0000-4000-8000-000000000001",
  "operationId": 12,
  "entityType": "job",
  "entityId": "local-job-id",
  "operation": "upsert",
  "baseServerVersion": null,
  "record": {
    "name": "Bar",
    "hourlyRateCents": 1500,
    "archivedAt": null,
    "overtimeEnabled": false,
    "workweekStartWeekday": 0,
    "workweekStartTime": "00:00",
    "createdAt": "2026-08-05T12:34:56.000Z",
    "updatedAt": "2026-08-05T12:34:56.000Z"
  }
}
```

`deviceId` is one stable canonical installation UUID. `operationId` is that
device's positive local outbox sequence. `baseServerVersion` is `null` only for
an unacknowledged create; updates and deletes name the positive version read.
An identical `(account, deviceId, operationId)` retry returns the exact stored
success or conflict response. Different content under that key returns
`409 idempotency_key_reused`.

Job records use the fields shown above. Shift records use `jobId`, `shiftDate`,
`startTime`, `endTime`, `durationSeconds`, `tipsCents`, `hourlyRateCents`,
`note`, `deletedAt`, `createdAt`, and `updatedAt`. Federal-setting records use
`jobId`, `effectiveFrom`, `filingStatus`, `payPeriodsPerYear`, `step2Checked`,
the four Step 3/4 cent fields, `exempt`, `deletedAt`, `createdAt`, and
`updatedAt`. Fields are exact: missing and unknown keys fail with
`422 invalid_request`.

Success returns the full remote change with server version, change sequence,
server timestamps, and preserved client timestamps. Existing-create, stale,
missing-parent, and duplicate job/effective-date facts return explicit `409`
conflicts. Similar-looking shifts are never deduplicated. A synced shift or
setting may use `operation: "delete"`, `record: null`, and its base version to
retain a server tombstone; jobs use archive, not physical delete.

### Pull changes

`GET /v1/sync/changes?after=0&limit=100` returns account-owned jobs, shifts,
and federal settings in ascending server change-sequence order. `after` is a
required nonnegative safe integer. `limit` defaults to 100 and must be from 1
through 200. Unknown, repeated, noncanonical, or out-of-range query values
return `400 invalid_query`.

```json
{
  "changes": [],
  "hasMore": false,
  "nextCursor": 0
}
```

Each nonempty change contains `entityType`, `entityId`, `record`,
`serverVersion`, `changeSequence`, `serverCreatedAt`, and `serverUpdatedAt`.
The next request uses the returned cursor. Gaps are normal because the server
sequence is shared across accounts.

## Account deletion

`DELETE /v1/me` trusts only the verified token subject and requires a password
authentication event from the preceding five minutes. It writes a durable
server tombstone and removes the account-owned cloud rows before asking
Supabase Auth to remove the identity. A provider outage returns
`503 identity_deletion_pending`; repeating the authenticated request retries
the provider deletion without recreating the account. The local SQLite database
is intentionally unchanged.

## Provider settings the app depends on

Three Supabase Auth settings are not optional, because app code assumes them:

- The **Reset Password** email template must include `{{ .Token }}`. Recovery
  in the app is a six-digit code the user types, not a link that reopens the
  app, so a template offering only a link leaves the flow with nothing to
  enter. Deep links were skipped deliberately: they would add a redirect
  allowlist plus universal-link and app-link setup on both platforms.
- The minimum password length must be at most 8. The app rejects a shorter new
  password before sending it, and a project configured to require more would
  reject a password the app just called acceptable.
- The email OTP length must be exactly 6. `parseRecoveryForm` in
  `src/auth/form.ts` matches `^[0-9]{6}$` and refuses anything else before a
  request is ever made, so a project sending any other length breaks recovery
  for every user with an error that blames the code the app itself just
  rejected. The provider default is not reliably 6; read the field, do not
  assume it.

Editing the recovery template requires custom SMTP to be enabled first. The
provider will not let the built-in sender use a modified template, so SMTP is a
prerequisite for the `{{ .Token }}` change rather than a later hardening step.

## External gates

No Supabase or Render resource is created by this repository. Deployment waits
for the owner to choose and fund the plans, database and API regions, backup and
deletion retention, availability expectations, and SMTP provider. Supabase,
Render, GitHub, billing, database, and SMTP credentials remain manual inputs.
