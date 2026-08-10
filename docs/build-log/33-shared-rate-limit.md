# Build log — shared API rate limits

## `99bf671` — fix: share API rate limits across instances (2026-08-10)

The API was deployed on Lambda with a fixed-window limiter stored in a process
`Map`. That bounded one warm instance, but concurrent Lambda environments each
had a fresh budget. The product has a small authenticated surface, so adding a
second service would be more machinery than the problem needs.

The limiter now keeps its existing 600-per-minute client-address policy and
uses one Postgres `INSERT ... ON CONFLICT DO UPDATE` counter per client. The
runtime injects this store; app tests retain the small in-memory store. Migration
`003_rate_limit.sql` creates the table, and the deployment still requires the
owner migration command before the runtime is updated.

Verification:

- `npm --prefix server run verify`
- `npx fallow audit` on the changed files
- A real temporary PostgreSQL database proves shared counts and window reset
- The full repository hook passes before commit
