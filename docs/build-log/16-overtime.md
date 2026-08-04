# Build log — Overtime

## `330876a` — feat: store overtime timing inputs (2026-08-04)

Schema version 3 adds optional local `start_time` and `end_time` values to
shifts, plus opt-in overtime and workweek boundary settings to jobs. D18 records
why duration remains authoritative and why existing shifts keep null times.

The migration runner previously applied one migration file and then stamped the
newest schema version. That stopped being safe once version 3 created a second
hop: a version-1 database would receive only `1-to-2.sql` and still be marked
version 3. It now applies each pending migration in order inside one transaction.

The schema suite passes 36 checks. The migration suite covers preservation,
rollback, a complete version-1-to-3 chain, and resolved column-order and trigger
parity between fresh and migrated databases. Comparing stored DDL text was
rejected because SQLite preserves source text differently for a fresh table and
columns added with `ALTER TABLE`.

The final gate ran on a physical iPhone with the real version-2 database. All
845 shifts migrated, the app opened, and its five year totals remained
133 / 227 / 162 / 223 / 100.
