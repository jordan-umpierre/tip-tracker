# tip-tracker

A mobile app for service workers to log shifts, understand gross earnings and
tip patterns, and eventually estimate take-home pay.

Tipped income is irregular and mostly invisible until tax time. Cash tips make
it worse, because nothing withholds tax from cash. The product is being built
to answer three questions the existing options mostly ignore: what do I really
make per hour, which shifts are worth taking, and what will I owe in April.

The product roadmap targets both W2 and 1099 workers on iOS and Android.

## Status

**MVP Layer 0 is implemented.** Its original job and shift CRUD, keyboard,
layout, and gross-total flows were confirmed on a physical iPhone. The later
additional-job entry point and its validation/default-rate behavior have now
also passed their physical-iPhone recheck.

**Layer 1 Trends is implemented and bundles for iOS and Android.** Its first
physical-iPhone pass confirmed the calculations and exposed four bounded
corrections: headline-card contrast, the missing additional-job entry point, a
more useful gross-per-hour headline, and vertical weekday bars. All four are
built and passed their physical-iPhone recheck. Android still needs runtime
verification on a real device or emulator before release.

Done:

- Product definition and MVP scope
- Architecture decided: local-first, SQLite on device, sync added later
- Platform decided: Expo, with the escape hatch understood
- [`schema.sql`](src/data/schema.sql) — the `jobs` and `shifts` tables, with tests
  confirming every constraint rejects bad data
- Expo app scaffolded, confirmed running on a physical device
- `schema.sql` wired into `expo-sqlite` ([`db.ts`](src/data/db.ts)), including the
  `PRAGMA foreign_keys = ON` gotcha SQLite requires per connection
- Data-access layer ([`jobs.ts`](src/data/jobs.ts), [`shifts.ts`](src/data/shifts.ts)): create,
  list, update, and soft-delete
- The log-a-shift screen ([`src/components/`](src/components/)): create and
  switch among jobs, log a shift (rate inherited from the job but
  overridable), see the list, edit a shift, and delete one with confirmation
- Gross totals ([`src/lib/totals.ts`](src/lib/totals.ts)): hours, tips and
  gross pay over every logged shift, with the money rounding rule pinned by a
  test that runs on Node with no device
- Expo Router navigation with native Log and Trends tabs ([`app/`](app/))
- Trends ([`src/lib/trends.ts`](src/lib/trends.ts),
  [`TrendsScreen.tsx`](src/screens/TrendsScreen.tsx)): all jobs or one job,
  weighted gross per hour, vertical weekday comparison, and month/year
  summaries

Next:

- Verify Layer 1 on Android before choosing the next product layer. See
  [docs/roadmap.md](docs/roadmap.md).

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | |
| UI | React Native | One codebase, reuses React |
| Tooling | Expo | [D2](docs/decisions.md) — `expo prebuild` is a real escape hatch |
| Navigation | Expo Router native tabs | [D7 and D11](docs/decisions.md) — two peer screens, no custom tab bar or state store |
| Storage | SQLite via `expo-sqlite` | [D1](docs/decisions.md) — logging a shift has to work with no signal |
| Backend | None through Layer 1 | [D1](docs/decisions.md) — Node, Express and Postgres arrive with optional sign-in |

Every one of these is written up with its rejected alternatives in
[docs/decisions.md](docs/decisions.md). The alternatives stay in the file permanently; a
decision with no visible alternatives is an assumption.

## Data model

Full commentary lives in [`schema.sql`](src/data/schema.sql). The conventions worth
knowing before reading it:

- **Money is integer cents.** `$24.50` is `2450`. Never floats — the rounding
  error compounds across hundreds of shifts and a tax calculation.
- **Durations are integer minutes.** 7.5 hours is `450`.
- **Units go in the column name.** `hourly_rate_cents`, not `hourly_rate`.
- **IDs are text UUIDs**, so rows created on two devices cannot collide once
  sync exists.
- **Calendar days are date-only ISO 8601**, so a late shift never displays on
  the wrong day.
- **Anything describing a past event stores its own values.** A shift keeps the
  rate it was worked at, so a raise cannot rewrite last year's earnings.
- **Nothing is hard-deleted.** Jobs archive, shifts get a tombstone. A row that
  is truly gone is invisible to a device that never saw it.

## Repo layout

```
app/                  Expo Router entry, native tab layout, and thin routes
src/
  screens/            route-level SQLite reads and screen composition
  components/         focused pieces of screen UI
  data/               SQLite: db.ts, schema.sql, and one file per table
  lib/                pure calculation and formatting -- no I/O, so testable
                      on Node with no device and no database
docs/                 see docs/README.md for which file answers what
scripts/              the checks below
.githooks/            pre-commit hook that runs them
metro.config.js       bundler config (lets schema.sql ship as an asset)
```

These folders describe ownership, not arbitrary filing: `app/` routes,
`screens/` coordinates, `components/` renders focused UI, `data/` persists,
and `lib/` computes. The split is what lets the money math be tested without
rendering anything or opening a database.

## Checks

All run by the pre-commit hook:

```sh
./scripts/check-docs.sh                # duplicate headings, dead references, broken links
./scripts/test-schema.sh               # every constraint in schema.sql rejects bad data
for t in src/lib/*.test.ts; do          # dates, editable-value round trips, money arithmetic
  node "$t"
done
```

A fresh clone needs this once, because git does not look in `.githooks/` on its
own:

```sh
git config core.hooksPath .githooks
```

The doc checks exist because two stale-documentation bugs were committed on the
same day, both from appending to a long file without re-reading it. The rule
they enforce: a convention nobody checks is a convention that quietly stops
being true.

## Scope

Layer 0 is logging shifts, viewing them, editing them, deleting them, and gross
totals. Layer 1 adds Trends. Net-income projection and 1099 support remain
later layers in [docs/product.md](docs/product.md) and are deliberately not
built ahead of time.

Tax projections are the highest-risk part of this product, because real people
make real financial decisions on them. They will ship as estimates and never as
advice, with the inputs visible and the math conservative by default.
