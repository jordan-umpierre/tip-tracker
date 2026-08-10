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

**Layer 1 Trends is implemented and runtime-verified on iOS and Android.** Its first
physical-iPhone pass confirmed the calculations and exposed four bounded
corrections: headline-card contrast, the missing additional-job entry point, a
more useful gross-per-hour headline, and vertical weekday bars. All four are
built and passed their physical-iPhone recheck. The same Log and Trends
acceptance checklist then passed in an Android emulator, closing the Layer 1
cross-platform gate.

**Exact-format CSV import is implemented and Android-verified.** The version-2
schema stores duration as integer seconds, preserving both existing whole
minutes and imported hundredths of an hour exactly. The supplied 845-row file
passed preview, confirmation, one-transaction import, totals refresh, and
duplicate-warning checks in the Android emulator, and the iOS picker flow
passed its physical-iPhone pass on 2026-08-04.

**The August product revision is implemented.** Log is the home tab, because
logging a shift is the recurring task. It opens to a fully collapsed
year/month history, two taps from any shift, with the Log a shift button and
data tools beneath it within reach of a thumb; a left swipe on a row reveals
Edit and Delete, with tap, long-press and screen-reader alternatives. Logging
is a pushed flow rather than an inline form — date, details, confirmation, plus
a job step when more than one job exists. Trends draws an interactive
wage/tips/total graph with exact touch-selected values and 1W/1M/3M/1Y/YTD/All
ranges, over a flat totals table and a weekday chart. The tab bar, remove-job
confirmation, and the pre-flow versions of those screens passed in Android;
preservation is schema-tested. The reworked Log and Trends screens are pending
their own device pass — see [`docs/acceptance.md`](docs/acceptance.md).

**The shared Log and Trends flows are verified on a physical iPhone and an
Android API 36 emulator as of 2026-08-04.** The iPhone pass produced the CSV
export, calendar picker, and haptic-feedback evidence. The later Android pass
covered the picker, calendar paging, chart and row gestures, overnight shift
times, editing, deletion, and SQLite survival across a developer reload.
VoiceOver and TalkBack remain separate unverified accessibility gates, and an
emulator cannot prove that haptics were felt.

**The automated overtime scope is complete.** Schema version 3 stores optional shift times and
per-job overtime/workweek settings, the data layer exposes them, native shift
time entry works on iOS and Android, and the pure configured-workweek
calculator is asserted. Manage data now has the per-job opt-in settings UI; the
same configured estimate now drives Log and Trends with explicit labeling while
CSV export keeps recorded gross. CSV import preserves paired 12-hour shift
times, and CSV export appends their stored `HH:MM` values without changing its
existing column order. Native verification of the new settings, estimate
labels, timed import/export, and screen-reader behavior remains open.

**Lossless local backup and empty-database restore are implemented.** Manage
data writes a versioned JSON snapshot containing every job and shift column,
including archived jobs and deleted-shift tombstones. Restore rejects malformed
or unsupported files before one exclusive transaction, then checks foreign keys
and complete ordered-row parity before commit ([D19](docs/decisions.md)). Pure
and SQLite fixture checks pass; the real 845-row fresh-install native restore
drill is still required before claiming device-verified recovery.

Done:

- Product definition and MVP scope
- Architecture decided: local-first, SQLite on device, sync added later
- Platform decided: Expo, with the escape hatch understood
- [`schema.sql`](src/data/schema.sql) — `jobs` and `shifts` first, now also
  `federal_withholding_settings` and the three sync tables, with tests
  confirming every constraint rejects bad data
- Expo app scaffolded, confirmed running on a physical device
- `schema.sql` wired into `expo-sqlite` ([`db.ts`](src/data/db.ts)), including the
  `PRAGMA foreign_keys = ON` gotcha SQLite requires per connection
- Data-access layer ([`jobs.ts`](src/data/jobs.ts), [`shifts.ts`](src/data/shifts.ts)): create,
  list, update, and soft-delete
- The log-a-shift screen ([`src/components/`](src/components/)): create and
  switch among jobs, safely remove a job, log a shift (rate inherited from the
  job but overridable), see the list, edit a shift, and delete one with
  confirmation
- Gross totals ([`src/lib/totals.ts`](src/lib/totals.ts)): hours, tips and
  gross pay over every logged shift, with the money rounding rule pinned by a
  test that runs on Node with no device
- Expo Router navigation with native Log and Trends tabs ([`app/`](app/))
- Trends ([`src/lib/trends.ts`](src/lib/trends.ts),
  [`TrendsScreen.tsx`](src/screens/TrendsScreen.tsx)): all jobs or one job,
  an interactive gross timeline with five ranges, weighted gross per hour,
  gross/hours per worked week, and one selectable year, month, or weekday
  breakdown
- CSV import on the Log screen: choose one job, validate and preview every row,
  review the detected columns and any overlaps, then append the whole file
  atomically ([D13](docs/decisions.md), [D30](docs/decisions.md)). Columns are
  matched by name rather than by an exact header line, hours and tips can be
  summed from several columns, dates may be `MM/DD/YYYY` or `YYYY-MM-DD`, and
  times may be `h:mm AM/PM` or 24-hour; both normalize to stored `HH:MM`
- CSV export of every logged shift to a folder the user picks, in the app's own
  spreadsheet format rather than the import contract, including exact duration
  seconds and optional shift times ([D16](docs/decisions.md))
- A calendar picker for the shift date ([`CalendarPicker.tsx`](src/components/CalendarPicker.tsx),
  [`monthGrid.ts`](src/lib/monthGrid.ts)), built rather than depended on
  ([D17](docs/decisions.md)): days that already have a shift are dotted,
  months page by animated swipe or arrows, and the header opens a month and
  year chooser. Typing a date still works and is still the primary path
- Overtime foundations: schema version 3, optional native shift times,
  per-job workweek fields and settings UI, chained migrations, and the pure
  overtime calculator plus adjusted Log/Trends estimates ([`overtime.ts`](src/lib/overtime.ts),
  [D14 and D18](docs/decisions.md))
- Versioned JSON backup and empty-only restore ([`backup.ts`](src/lib/backup.ts),
  [D19](docs/decisions.md)): strict bounded validation, all-row SQLite
  snapshots, one restore transaction, foreign-key checking, and exact row
  parity without merging or replacing existing data; version 3 includes
  withholding-setting tombstones and still restores strict version-1/schema-3
  and version-2/schema-4 files
- Pure 2026 federal withholding math
  ([`federalWithholding2026.ts`](src/lib/federalWithholding2026.ts),
  [D20](docs/decisions.md)) for one regular paycheck using user-entered federal
  taxable wages and actual 2020-or-later W-4 values; no paycheck record and no
  calculated result is stored
- Effective-dated per-job withholding-setting persistence ([D21](docs/decisions.md)):
  schema version 4 uses the first applicable paycheck pay date, and lossless
  backup covers every stored field
- Opt-in local federal-withholding UI inside Manage data: save new W-4 history,
  choose a 2026 paycheck pay date, enter federal taxable wages from the paystub,
  and see one fully disclosed estimate without storing the wages or result
- Local sync foundation ([D23](docs/decisions.md)): schema version 5 captures
  every job, shift, and withholding-setting mutation in a compact SQLite
  outbox, retains server metadata and one account binding, and applies remote
  rows transactionally without re-enqueueing them. Schema version 6, the
  current one, adds a stable per-installation device id and keeps a conflict or
  permanent failure beside the exact mutation it blocked
- The authenticated API ([`server/`](server/), [D22 and D24](docs/decisions.md)):
  account-owned Postgres schema, idempotent one-mutation push, paged pull,
  account deletion, a fixed per-address request limit, and one structured log
  line per request
- Optional cloud accounts on the device ([D25 and D26](docs/decisions.md)):
  encrypted session storage, deliberate one-account binding, serialized
  foreground push/pull, in-app account deletion, emailed-code password
  recovery, and named blocked records with a discard resolution

**The app is release-ready on paper, and only on paper.** The checks run in
GitHub Actions rather than on one laptop, both store targets can be built, a
user can delete their cloud account and recover a forgotten password from
inside the app, the API bounds request volume and logs every request, and the
privacy disclosures exist ([privacy-policy.md](docs/privacy-policy.md),
[store-disclosures.md](docs/store-disclosures.md)). Web was removed rather than
repaired ([D27](docs/decisions.md)). The backend is no longer hypothetical: a
real Supabase project holds the migrated schema and the API runs on AWS Lambda
behind an API Gateway HTTP API ([D28](docs/decisions.md)). None of it has been
seen on a device, and no build exists.

Next:

- Build a `preview` profile for each platform, then run the native acceptance
  pass: auth, push/pull, interruption, offline relaunch, cross-device
  convergence, and every screen added since. See
  [docs/roadmap.md](docs/roadmap.md) for the exact evidence boundary.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | |
| UI | React Native | One codebase, reuses React |
| Tooling | Expo | [D2](docs/decisions.md) — `expo prebuild` is a real escape hatch |
| Navigation | Expo Router native tabs | [D7 and D11](docs/decisions.md) — two peer screens, no custom tab bar or state store |
| Storage | SQLite via `expo-sqlite` | [D1](docs/decisions.md) — logging a shift has to work with no signal |
| Backend | Node, Express, Postgres, behind optional sign-in | [D1, D22 and D24](docs/decisions.md) — Layer 0 and 1 shipped with none; accounts and sync added it |
| Hosting | AWS Lambda behind an API Gateway HTTP API (`us-west-2`) | [D28](docs/decisions.md) — the API follows the database's region |

Every one of these is written up with its rejected alternatives in
[docs/decisions.md](docs/decisions.md). The alternatives stay in the file permanently; a
decision with no visible alternatives is an assumption.

## Data model

Full commentary lives in [`schema.sql`](src/data/schema.sql). The conventions worth
knowing before reading it:

- **Money is integer cents.** `$24.50` is `2450`. Never floats — the rounding
  error compounds across hundreds of shifts and a tax calculation.
- **Durations are integer seconds.** 7.5 hours is `27000`; one hundredth of an
  hour is exactly `36`.
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
    account/          the cloud account states: sign in, recovery, sync, delete
  auth/               optional Supabase account/session boundary
  data/               SQLite: db.ts, schema.sql, migrations, one file per table
  lib/                pure calculation and formatting -- no I/O, so testable
                      on Node with no device and no database
  sync/               the authenticated push/pull transport and its decoder
contracts/            the sync wire format, shared verbatim by app and server
server/               the Express API: routes, migrations, and its own tsconfig
docs/                 see docs/README.md for which file answers what
scripts/              the checks below
.githooks/            pre-commit hook that runs them
metro.config.js       bundler config (lets schema.sql ship as an asset)
```

`contracts/` sits outside both `src/` and `server/` deliberately: neither side
owns the format they speak to each other. It used to be two hand-written
copies, and they drifted while both test suites stayed green ([D26](docs/decisions.md)).

These folders describe ownership, not arbitrary filing: `app/` routes,
`screens/` coordinates, `components/` renders focused UI, `data/` persists,
and `lib/` computes. The split is what lets the money math be tested without
rendering anything or opening a database.

## Checks

All run by the pre-commit hook:

```sh
./scripts/check-docs.sh                 # duplicate headings, dead references, broken links
./scripts/test-schema.sh                # every constraint in schema.sql rejects bad data
./scripts/test-migration.sh             # upgrades, rollback, preservation, and schema parity
./scripts/test-backup-restore.sh        # backup row parity, foreign keys, integrity, rollback
npm --prefix server run verify          # server typecheck plus real temporary-PostgreSQL tests
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  src/data/sync.test.ts                 # the local SQLite outbox and remote-apply transaction
for t in src/auth/*.test.ts; do         # public config and encrypted session adapter
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$t"
done
for t in src/sync/*.test.ts; do         # the authenticated push/pull transport
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$t"
done
for t in src/lib/*.test.ts; do          # dates, editable-value round trips, money arithmetic
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$t"
done
```

A fresh clone needs this once, because git does not look in `.githooks/` on its
own:

```sh
git config core.hooksPath .githooks
```

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs that same hook on
every push and pull request, plus the full Expo typecheck the hook leaves out
to stay fast. It deliberately does not re-list the checks: the hook is the one
definition, and CI supplies the PostgreSQL server and the `sqlite3` binary a
laptop already has. "It passes on my machine" is not evidence anyone else can
verify.

## Release builds

[`eas.json`](eas.json) defines three profiles: `development` (a dev client),
`preview` (an internal install for real-device testing), and `production` (the
store build). Versioning is `remote`, so EAS owns `ios.buildNumber` and
`android.versionCode` and increments them per production build; the
human-facing `version` in [`app.json`](app.json) stays hand-edited.

There are no `channel` fields, because `expo-updates` is not installed and a
channel with no update client is decoration.

The three `EXPO_PUBLIC_*` values in [`.env.example`](.env.example) are not
tracked with their real values, because they differ per environment. They live
in EAS environment variables instead; the `preview` profile names the
environment to load them from (`"environment": "preview"`) rather than listing
an `env` block of literals.

`ios.bundleIdentifier` and `android.package` are both
`com.jordanumpierre.tiptracker`. Both are permanent once a build reaches
either store.

The app is linked to its EAS project: `extra.eas.projectId` and `owner` are in
[`app.json`](app.json), so `eas init` is done. An Apple Developer membership is
active. A Google Play account ($25, one time) is still outstanding, so Android
can be built for internal distribution but not submitted.

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
