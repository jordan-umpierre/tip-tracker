# Lossless backup and restore

## `db8ac8b` — docs: define lossless backup restore contract (2026-08-04)

D19 separates two jobs that CSV cannot safely combine. CSV remains a readable
spreadsheet export. The recovery file is versioned JSON containing every stored
job and shift column, including stable ids, timestamps, archived jobs, deleted
shift tombstones, overtime configuration, exact integer money and duration,
and optional times.

Restore is deliberately empty-database only. Merge needs source identity and a
conflict policy; replacement could destroy the only valid local copy. Version 1
accepts at most 10,000,000 UTF-8 bytes, 1,000 jobs, and 20,000 shifts.

## `741bccb` — feat: define lossless backup format (2026-08-04)

`src/lib/backup.ts` builds deterministic JSON and validates the complete trust
boundary without SQLite, React, or a filesystem. It rejects unsupported or
unknown structure, unsafe integers and wage products, duplicate ids, orphan
shifts, malformed timestamps, invalid calendar dates, and one-sided or invalid
times. The direct Node assertions cover those failures plus multiline and
Unicode notes, archived/deleted rows, overtime settings, zero amounts, stable
ordering, and the local timestamped filename.

A deliberate mutation removed the version rejection. `backup.test.ts` failed
at its unsupported-version assertion, proving that check detects the defect it
claims to cover; restoring the condition returned the suite to green.

## `7f5de6c` — feat: restore lossless backups atomically (2026-08-04)

Dedicated reads select every column from every job and shift. They do not reuse
the UI queries, because those omit tombstones by design. Snapshot export reads
both tables inside one exclusive transaction.

Restore validates before this layer, refuses any database containing a job or
shift, inserts parent jobs before shifts with bound ordinary `INSERT`s, runs
`PRAGMA foreign_key_check`, and compares every ordered restored row against the
backup before commit. It never deletes, replaces, or merges.

`scripts/test-backup-restore.sh` creates isolated source, restored, and rollback
databases from the tracked schema. Its fixture covers active and archived jobs,
default and configured workweeks, timed and untimed shifts, multiline notes,
zero amounts, and a shift tombstone. Complete rows match; integrity and foreign
keys pass; a bad final shift rolls the earlier job insert back to zero rows.
The pre-commit hook now runs this check.

## `67b1547` — feat: add backup and restore controls (2026-08-04)

Manage data now creates a JSON file in a user-chosen directory and previews a
selected backup's job and shift counts before restore. Picker cancellation is
quiet through the existing platform pattern. The UI states that the file is
unencrypted sensitive income data and that restore neither merges nor replaces.

Manage data remains reachable with no jobs. That is necessary rather than a
special empty state: an empty database is the only state D19 permits restore to
change. A successful restore refreshes the Log screen; if refresh alone fails,
the alert truthfully says restore succeeded and asks the user to reopen the tab.

## `a34d940` — chore: document backup safety branches (2026-08-04)

Fallow estimates branch risk without reading direct assertion coverage. Narrow
comments connect the pure validator and database restore boundary to their
runnable checks. They do not suppress the two native UI handler findings,
because the file picker and restore alerts have not run on a device yet.

## Verification boundary

The full pre-commit hook, TypeScript, Expo dependency check, Expo Doctor 20/20,
and fresh web, iOS, and Android exports pass. Fallow reports zero dead code and
zero duplication. Its feature-range audit retains two UI complexity estimates
until native interaction evidence exists.

No physical-device restore is claimed. The next acceptance pass must use an
isolated fresh install, restore the real 845-row export, and compare every
ordered job and shift column plus `user_version`, `integrity_check`, and
`foreign_key_check`. It must never target the only copy of the real database.
