# Tip Tracker

Tip Tracker is a local-first income tracker for tipped, hourly, and gig
workers. Create jobs, log shifts, and review gross income without an internet
connection.

## iOS launch scope

The first App Store release is deliberately small:

- multiple jobs with historical hourly rates
- shift logging with date, hours, tips, and an optional note
- optional start and end times for overtime estimates
- shift history with edit and delete confirmation
- gross income trends
- CSV import/export
- lossless JSON device backup and restore
- optional federal withholding estimates, clearly labeled as estimates

The main path is:

`Open → Log a shift → enter the shift → save → see what was recorded`

The app is local-only. SQLite is the source of truth and no account, API,
cloud sync, analytics, or AWS service is required to use it.

## Deferred

- Android production release and Android-specific acceptance
- Node API, accounts, Postgres, cloud backup, and cross-device sync
- AWS/Lambda deployment
- premium billing or entitlement enforcement
- 1099 mileage, expenses, quarterly taxes, state/local tax calculations,
  payroll, bank connections, or tax filing

These are separate products, not hidden launch requirements.

## Architecture

```text
Expo / React Native
├── Log, history, settings, and trends screens
├── pure TypeScript calculations and parsers
└── SQLite on the device
    ├── jobs, shifts, and optional withholding settings
    └── backup and CSV import/export boundaries
```

Money is stored as integer cents, duration as integer seconds, dates as
`YYYY-MM-DD`, and each shift keeps the rate that applied when it was worked.

## Stack

- TypeScript, React Native, and Expo SDK 57
- Expo Router
- SQLite via `expo-sqlite`
- Node.js remains available for a future backend, but is not part of the iOS
  launch path

## Checks

```sh
npx tsc --noEmit
npx expo-doctor
npx expo install --check
./scripts/check-docs.sh
```

The repository hook runs the schema, migration, backup, and pure-library
checks before a commit.
