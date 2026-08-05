# Tip Tracker API

This package is the authenticated cloud boundary from D22. It does not replace
the Expo app's SQLite database and does not contain sync endpoints yet.

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
| `HOST` | Listen address; defaults to `0.0.0.0` |
| `PORT` | Listen port; defaults to `3000` |

Apply migrations with owner credentials before starting the runtime process:

```sh
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f migrations/001_initial.sql
npm start
```

Migration-owner credentials and the database password are server secrets. They
must never use Expo's `EXPO_PUBLIC_` prefix or enter the mobile application.
The runtime role should receive only the private `app` schema privileges its
implemented queries need; role grants wait for the actual managed project roles
instead of guessing provider-owned names locally.

## External gates

No Supabase or Render resource is created by this repository. Deployment waits
for the owner to choose and fund the plans, database and API regions, backup and
deletion retention, availability expectations, and SMTP provider. Supabase,
Render, GitHub, billing, database, and SMTP credentials remain manual inputs.
