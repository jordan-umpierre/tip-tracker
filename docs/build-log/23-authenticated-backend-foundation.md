# Authenticated backend foundation

This phase records D22 and builds only the part that can be verified locally:
an isolated Express process, private Postgres schema, token verification, and
the cloud account lifecycle. Mobile auth, sync routes, deployment files, and
external resources remain deliberately absent.

## `bc8e170` — docs: define authenticated backend boundary (2026-08-05)

Added D22. Supabase Auth and Postgres sit behind one Node/Express API; SQLite
remains the offline source. The decision fixes the recovery and deletion
boundary, private schema, composite ownership, server-version conflict policy,
tombstones, no guessed deduplication, SMTP requirement, and provider gates.

Verification:

```sh
./scripts/check-docs.sh
git diff --check
```

## `314537e` — feat: add bounded Express server (2026-08-05)

Created the isolated `server/` package with Express 5 and Node 24's built-in
TypeScript execution and test runner. `/health` returns one small JSON object.
Startup validates its listen configuration; request JSON stops at 32 KB;
public errors do not expose stacks or framework identity; SIGINT and SIGTERM
stop accepting connections, close keep-alives, and end cleanly.

The repository pre-commit hook now runs `npm --prefix server run verify`. No
HTTP client, environment parser, transpile runner, or test framework dependency
was added because Node, Express, and a few direct checks cover this boundary.

## `ee9891a` — feat: define account-owned Postgres schema (2026-08-05)

Added `migrations/001_initial.sql` under a private `app` schema. Accounts own
jobs; composite `(account_id, job_id)` foreign keys make cross-account shifts
and withholding settings impossible. Records carry server versions, a shared
server change sequence, server timestamps, and job/shift/settings tombstones.
No unique date-and-amount rule guesses that two shifts are duplicates.

The test creates a real temporary PostgreSQL database, proves migration
rollback leaves no schema, applies the migration, challenges both composite
foreign keys, inserts two equal-looking shifts, observes a server-assigned
version and sequence change, and proves account deletion cascades all cloud
children. The database is dropped in `finally`, including after failure.

## `8451e78` — feat: authenticate account lifecycle (2026-08-05)

Added `jose` verification against a remote JWKS with exact issuer and audience
checks. `GET /v1/me` provisions and returns only the verified `sub` account;
`DELETE /v1/me` deletes only that account and ignores attempted identity input
from the body. Database, issuer, audience, and HTTPS JWKS settings are required
at startup. The Postgres pool closes during graceful shutdown.

The integration test generates a local RSA signing key, serves its public JWKS,
and runs the real Express app against a migrated temporary PostgreSQL database.
It accepts the good token and rejects missing auth, a bad signature, wrong
issuer, wrong audience, and expiry. A body that names another user cannot delete
that user, while deletion of the authenticated account cascades its job, shift,
and withholding setting.

## `5d8cf93` and `dcd724d` — refactor server validation branches (2026-08-05)

The final Fallow health pass identified its static untested-complexity estimate
in the configuration and public-error branches even though their paths had
direct assertions. Split URL/text/port parsing into small single-purpose
helpers and replaced conditional error selection with a fixed parser-error
map. The second small commit isolated default selection after Fallow showed
that optional-value and range branches still crossed its threshold. Behavior
and test cases did not change; the final report has no server health finding.

Verification for all code commits:

```sh
npm --prefix server run verify
./.githooks/pre-commit
npx fallow dead-code --format json
npx fallow dupes --format json
```

The five server tests and the existing repository checks pass. Fallow finds no
dead code or duplication. Its whole-repository health command still reports the
same pre-existing mobile UI complexity findings led by `LogShiftForm`; this
backend phase does not suppress or rewrite them.

## Still external or manual

- Create and fund Supabase and Render accounts and projects.
- Choose database/API regions, availability target, budget, and backup,
  tombstone, log, and account-deletion retention.
- Configure a custom SMTP provider for dependable verification and reset mail.
- Create least-privilege migration/runtime database roles using the provider's
  real role model and store all secrets in server-side environment settings.
- Deploy, run migrations, configure health checks, and capture hosted evidence.
- Complete the already-open native withholding and restore acceptance passes.
