# Tip Tracker

Tip Tracker is a local-first income tracker for tipped, hourly, and gig
workers. Create jobs, log shifts, and see gross income and trends without an
internet connection.

## V1 boundary

The first public release is a small, trustworthy local app:

- multiple jobs with historical hourly rates
- fast shift logging with date, hours, tips, and an optional note
- optional start and end times for advanced overtime estimates
- shift history with edit and destructive-delete confirmation
- gross income trends by range, day, month, and year
- CSV import/export and a lossless JSON device backup

The main path is:

`Open → Log a shift → enter the shift → save → see what was recorded`

Settings contains the tools that are useful but not needed for every shift:
job management, overtime settings, federal withholding estimates, import,
export, backup, and the optional account panel.

## Deferred scope

These are not V1 promises:

- premium billing or entitlement enforcement
- production cloud backup and cross-device sync
- 1099 mileage, expense, or quarterly-tax calculations
- state and local tax calculations
- tax advice, tax filing, payroll, or bank integrations

The account and sync code is retained as a later product layer. It must not be
marketed as a production service until the production provider, SMTP, database
migration, device acceptance, privacy URL, and store evidence gates are closed.

## Architecture

```text
React Native / Expo
├── Log and Trends screens
├── pure calculation modules
└── SQLite on the device
    ├── jobs and shifts
    ├── optional overtime and withholding settings
    └── backup and import/export boundaries
```

SQLite is the local source of truth. The app stores money as integer cents,
duration as integer seconds, calendar days as `YYYY-MM-DD`, and each shift's
hourly rate at the time it was worked. Gross calculations are pure TypeScript
functions and are tested without a device or database.

## Current status

The code and static release checks pass. The iOS and Android bundles export,
the Expo dependency set is aligned, the server and sync tests pass, and the
pre-commit hook is wired to `.githooks`.

That is not the same as App Store readiness. The remaining gates are tracked in
[`docs/acceptance.md`](docs/acceptance.md) and [`docs/roadmap.md`](docs/roadmap.md),
including physical-device accessibility and sync checks, production provider
configuration, applying [`003_rate_limit.sql`](server/migrations/003_rate_limit.sql)
to the live database, a hosted privacy policy, listing metadata, and screenshots.

## Stack

- TypeScript, React Native, and Expo SDK 57
- Expo Router native tabs
- SQLite via `expo-sqlite`
- Optional Node/Express/Postgres API for the deferred account layer

## Repository map

- [`app/`](app/) — thin Expo Router routes
- [`src/screens/`](src/screens/) — screen composition
- [`src/components/`](src/components/) — focused UI pieces
- [`src/data/`](src/data/) — SQLite access, schema, and migrations
- [`src/lib/`](src/lib/) — pure calculations, parsing, and formatting
- [`server/`](server/) — optional account/sync API
- [`docs/product.md`](docs/product.md) — product boundary and decisions
- [`docs/roadmap.md`](docs/roadmap.md) — current status and next external gates

## Checks

```sh
npx tsc --noEmit
npx expo-doctor
npx expo install --check
npm --prefix server run verify
./scripts/check-docs.sh
```

The repository hook runs the schema, migration, backup, server, sync, auth,
and pure-library checks before a commit.
