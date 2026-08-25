# Tip Tracker

Tip Tracker is a local-only iOS app for tipped, hourly, and gig workers. It
records shifts and shows gross income without requiring an account or network
connection.

## What ships

- multiple jobs with historical hourly rates
- guided shift logging with optional clock times and notes
- shift history with edit and delete confirmation
- gross income trends by job and date range
- CSV import and export
- lossless JSON backup and restore
- optional overtime and federal withholding estimates

SQLite on the device is the source of truth. The iOS app does not use the
retained server experiment, cloud sync, analytics, advertising, or payments.

## Data rules

- Money uses integer cents.
- Duration uses integer seconds.
- Dates use `YYYY-MM-DD`.
- Each shift keeps the rate that applied when it was worked.
- Deleted jobs and shifts keep tombstones so backup and migration history stay
  lossless.
- Overtime and withholding outputs are estimates, not recorded earnings.

## Code map

```text
app/            Expo Router routes
src/screens/    screen implementations
src/data/       SQLite schema, migrations, and queries
src/lib/        calculations, CSV handling, and tests
server/         retained backend experiment, not part of the iOS release
```

## Working here

- [Current status and next work](docs/roadmap.md)
- [Current technical decisions](docs/decisions.md)
- [iOS acceptance checklist](docs/acceptance.md)

Run the repository checks through the tracked hook:

```sh
git config core.hooksPath .githooks
.githooks/pre-commit
```
