# Build log — Duration precision and CSV import

The first real history export used hundredths of an hour, while the app stored
whole minutes. Rounding 495 of its 845 shifts would have changed earnings before
the user saw them. This phase changed the neutral storage unit first, then built
the importer against the inspected file rather than an imagined universal CSV.

## `c91f998` — refactor: store shift durations as integer seconds (2026-08-03)

Schema version 2 renames `minutes` to `duration_seconds` and multiplies every
existing value by 60. The SQL and `PRAGMA user_version` marker run inside one
exclusive transaction. Fresh databases start directly on the version-2 schema;
newer unknown versions fail instead of being opened with older code.

The data layer, forms, formatters, totals, Trends, and their tests now use
seconds. Decimal-hour edits render at up to four places because the exhaustive
check proves that precision round-trips every whole second from 1 through
86,400. Imported hundredths convert with `hundredths * 36`, so both the old
minute data and the new source data remain exact.

`scripts/test-migration.sh` compares every non-duration field, tombstone, and
archived relationship before and after the upgrade, rechecks constraints and
foreign keys, and forces a failing transaction to prove rollback. A temporary
`* 6` mutation failed the preservation check before the real migration was
committed. The tracked hook, TypeScript, Fallow changed-file audit, and Android
export passed.

## `96cafd0` — feat: import exact-format shift CSVs (2026-08-03)

Added one collapsed importer below Log totals. It selects a destination job,
uses Expo FileSystem's native document picker, validates size plus the exact
nine headers and every field, and shows the row count, date range, totals,
first five rows, source warnings, existing dates, and possible exact matches.
Confirmation is explicit; `importShifts()` inserts every row inside one
exclusive transaction or rolls the entire file back.

The private parser handles BOMs, CRLF/LF, quoted commas, embedded newlines,
escaped quotes, malformed records, strict dates and integer money, at most two
hour decimals, row and size limits, same-date shifts, and unsupported real
start/end times. Cash and credit tips combine. `Daily Income` is checked but
not stored; the supplied file's one one-cent disagreement is shown as a warning
and the D5 calculation remains canonical. No CSV package or mapping framework
was added for one known format.

The first Android run exposed a real integration defect: a separate document
picker copied into an Expo Go cache path that Expo FileSystem could not read.
The final implementation uses FileSystem's own picker, which retains Android's
document permission. Android providers can omit the original filename, so the
importer validates content rather than trusting an extension.

The supplied file previewed 845 shifts, 3,977.0 hours, and $92,046.38 in tips.
All 845 rows committed to the emulator test database, Log totals refreshed to
3,981.0 hours and $92,056.38 including the two existing shifts, and Trends
rendered all 847 shifts. Selecting the file again warned about 844 overlapping
dates and all 845 exact matches without importing again.

The tracked hook, TypeScript, Expo dependency check, Fallow changed-file audit,
and fresh Android and iOS exports pass. The iOS bundle is static evidence only;
the new picker and transaction still need a physical-iPhone runtime check.
