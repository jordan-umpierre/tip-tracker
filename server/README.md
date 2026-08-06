# Tip Tracker API

This package is the authenticated cloud boundary from D22 and D24. It does not
replace the Expo app's SQLite database. It exposes the provider-free,
authenticated server half of push/pull; the mobile client that calls it landed
with D26.

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

Apply migrations with owner credentials before starting the runtime process:

```sh
MIGRATION_DATABASE_URL="postgresql://..." npm run migrate
npm start
```

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

## External gates

No Supabase or Render resource is created by this repository. Deployment waits
for the owner to choose and fund the plans, database and API regions, backup and
deletion retention, availability expectations, and SMTP provider. Supabase,
Render, GitHub, billing, database, and SMTP credentials remain manual inputs.
