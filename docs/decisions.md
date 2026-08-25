# Current decisions

This file contains only decisions the present code depends on. Git history
preserves superseded plans and their longer discussions.

For current release status, read [roadmap.md](roadmap.md). The SQLite contract
lives in [../src/data/schema.sql](../src/data/schema.sql).

### D1: Keep the shipping app local-only

SQLite on the device is the source of truth. Logging, history, import, export,
and backup must work without an account, server, or network.

### D2: Use Expo

Expo SDK 57 supplies the React Native runtime, native modules, Router, and build
tooling. Native projects remain generated rather than hand-maintained.

### D3: Archive jobs

Removing a job sets `archived_at`. Historical shifts keep their job and rate,
while active pickers omit archived jobs.

### D4: Tombstone shifts

Deleting a shift sets `deleted_at`. Normal reads hide it, while backups and
migrations retain the row.

### D5: Round wages per shift

Each shift calculates `round(hourly_rate_cents * duration_seconds / 3600)`.
Totals sum those rounded cents and then add tips.

### D6: Preserve edit precision

Hours shown for editing use four decimal places so converting the field back to
integer seconds does not quietly change a saved duration.

### D7: Use Expo Router

Routes own navigation and screen lifetime. File-based routes keep navigation
state visible in the filesystem.

### D8: Keep calculations in pure TypeScript

Gross totals, trends, overtime, and withholding calculations accept plain data
and return plain results. SQLite and React Native stay outside those modules.

### D9: Keep income charts focused

The main chart shows gross income over time. When all jobs are selected, each
job gets one line instead of separate wage and tip series.

### D10: Use calendar-based trend periods

Weeks begin Sunday. Trend buckets and drill-down dates come from the same pure
date calculations so charts and history select identical shifts.

### D11: Keep Log and Trends as native peer tabs

The app has two native tabs: Log and Trends. Each route reads SQLite when it
gains focus. Settings, history, and logging steps open as stack routes.

### D12: Store duration as integer seconds

Integer seconds preserve typed hours and clock times without floating-point or
hundredths-of-an-hour drift.

### D14: Make overtime and withholding opt-in estimates

Each job owns its optional workweek and withholding settings. The app labels
calculated results as estimates and never replaces recorded gross income with
them.

### D15: Browse history by year and month

History uses year choices and month cards. A selected month lists shifts in
chronological order with edit and delete actions.

### D16: Separate readable CSV from lossless backup

CSV is for spreadsheets and interoperability. Versioned JSON is the lossless
device backup and restore contract.

### D17: Keep the calendar inside the app

The current date-range calendar uses existing React Native and date modules.
This avoids another dependency for the app's fixed English, Sunday-first scope.

### D18: Store clock times and the employer workweek

Optional `start_time` and `end_time` place duration within a workweek for
overtime estimates. `duration_seconds` remains authoritative.

### D19: Restore only into an empty database

Backup restore validates the entire versioned JSON payload and commits it
atomically into an empty database. It does not guess how to merge histories.

### D20: Bound federal withholding

The estimator covers one regular 2026 W-2 paycheck. It excludes FICA,
self-employment, state, local, filing, and take-home-pay claims.

### D21: Effective-date withholding settings

Each job can keep dated withholding settings. A shift uses the latest settings
effective on its date.

### D29: Keep shift logging as a guided flow

Logging asks for the job and date, then shift details, then confirmation. Draft
state lives only for that navigation flow and SQLite is written at confirmation.

### D30: Detect CSV columns by name

Import recognizes the supported column aliases, previews its mapping, validates
every row, and writes the accepted file in one transaction.

### D33: Ship iOS without cloud features

The first App Store release contains only the local SQLite product. The retained
Node, Postgres, sync migration, and Android work do not block the iOS release.

### D34: Give each income gesture one result

Dragging inspects a chart point. Buttons page preset periods. The calendar sets
a custom range. Selecting a point or range opens the matching shifts.
