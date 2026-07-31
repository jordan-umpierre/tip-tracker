# Build log — data-access layer

Part of the [build log](README.md). Numbered by phase because this is the
one place chronology is the content.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, [../product.md](../product.md)
for product scope.

Covers: `jobs.ts` and `shifts.ts` — the plain functions wrapping SQL that a
screen actually calls, since this project has no server backend to put that
logic in.

---

## `1235eaf` — feat: add jobs data-access functions (2026-07-30)

First piece of the data-access layer sitting on top of `db.ts`. No server
backend exists for MVP (D1), so this file — plain functions wrapping SQL —
is the closest thing to a "backend" this app has, and it's what a screen
actually calls, not `db.ts` directly.

To recreate:

1. `npx expo install expo-crypto` — first-party module for
   `Crypto.randomUUID()`, needed because `schema.sql` uses text UUIDs as
   primary keys (D1: two devices independently picking row ids would
   collide once sync exists) and React Native doesn't reliably have
   `crypto.randomUUID()` built into its JS environment.
2. `createJob(name, hourlyRateCents)`: generates a UUID, stamps
   `created_at`/`updated_at` with the same `new Date().toISOString()` value,
   and inserts with `db.runAsync` using `?` placeholders — never string-
   splice values into the SQL, that's the direct path to SQL injection.
   `archived_at` is explicitly `NULL` on insert.
3. `listActiveJobs()`: reads with `db.getAllAsync<Job>(...)` instead of
   `runAsync` — the read/write split in `expo-sqlite`'s API is real,
   `runAsync` returns a write summary, not rows. Filters
   `WHERE archived_at IS NULL`, the D3 rule for excluding archived jobs from
   anything a user picks from.
4. Rows come back typed via a `Job` type matching `schema.sql`'s columns
   verbatim, snake_case included — no camelCase mapping layer added, since
   nothing needs one yet.

Verified with `tsc --noEmit`. Not yet wired into any screen, so nothing to
bundle-check or run on device for this commit specifically.

## `bec551a` — feat: add shifts data-access functions (2026-07-30)

Second and last piece of the data-access layer before any screen gets built.
Same pattern as `jobs.ts`, adapted for `shifts`' extra columns and its
foreign key.

To recreate:

1. `createShift(jobId, shiftDate, minutes, tipsCents, hourlyRateCents, note)`:
   same UUID/timestamp/`runAsync`-with-placeholders shape as `createJob`.
   `hourlyRateCents` is a required argument, not looked up from the job
   inside the function — `schema.sql`'s own comment is explicit that this
   column is a copy of the job's rate at the moment of the shift, not a live
   reference, so a raise later can't rewrite what a past shift actually
   paid. The caller (the log-a-shift screen) decides the value: default it
   to the job's current rate, let the user override it for a special shift.
   `deleted_at` is explicitly `NULL` on insert.
2. `listShifts()`: `db.getAllAsync<Shift>(...)`, filtered
   `WHERE deleted_at IS NULL` (the D4 tombstone rule), ordered by
   `shift_date DESC` — most recent first, the natural order for a scrolling
   list. Takes no filter arguments and returns every shift; the dataset is a
   few thousand rows at most for MVP, so there's no performance reason to
   push filtering into SQL before a screen actually needs a narrower query.

Verified with `tsc --noEmit`. Not yet wired into any screen.

