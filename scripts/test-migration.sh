#!/usr/bin/env bash
#
# Proves the version-1-to-version-2 duration migration preserves every stored
# fact other than the unit it deliberately changes. It also forces the UPDATE
# to fail and checks that the surrounding transaction restores version 1.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

if ! command -v sqlite3 >/dev/null; then
  echo "WARN  sqlite3 not installed, migration tests skipped"
  exit 0
fi

migration_path=${1:-src/data/migrations/1-to-2.sql}
if [ ! -f "$migration_path" ]; then
  echo "FAIL  migration file not found: $migration_path"
  exit 1
fi
migration_dir=$(cd "$(dirname "$migration_path")" && pwd)
migration_path="$migration_dir/$(basename "$migration_path")"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

create_v1_fixture() {
  sqlite3 "$1" <<'SQL'
.bail on
PRAGMA foreign_keys = ON;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE shifts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  shift_date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  tips_cents INTEGER NOT NULL CHECK (tips_cents >= 0),
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
  note TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT
);
INSERT INTO jobs VALUES
  ('job-active', 'Diner', 1501, NULL, '2026-01-01T00:00:00Z', '2026-07-30T09:00:00Z'),
  ('job-archived', 'Old Cafe', 750, '2026-06-01T00:00:00Z', '2025-01-01T00:00:00Z', '2026-06-01T00:00:00Z');
INSERT INTO shifts VALUES
  ('shift-one-minute', 'job-active', '2026-07-29', 1, 0, 1501, NULL, NULL, '2026-07-29T12:00:00Z', '2026-07-29T12:00:00Z'),
  ('shift-double', 'job-active', '2026-07-29', 240, 3000, 1501, 'second shift', NULL, '2026-07-29T23:00:00Z', '2026-07-29T23:00:00Z'),
  ('shift-archived-job', 'job-archived', '2025-04-10', 1440, 100, 750, NULL, NULL, '2025-04-10T23:59:59Z', '2025-04-10T23:59:59Z'),
  ('shift-tombstone', 'job-active', '2026-07-27', 455, 2000, 1501, 'deleted once', '2026-07-30T09:00:00Z', '2026-07-27T22:00:00Z', '2026-07-30T09:00:00Z');
PRAGMA user_version = 1;
SQL
}

jobs_snapshot() {
  sqlite3 "$1" "SELECT hex(id) || '|' || hex(name) || '|' || hourly_rate_cents || '|' || ifnull(hex(archived_at), 'NULL') || '|' || hex(created_at) || '|' || hex(updated_at) FROM jobs ORDER BY id;"
}

shifts_snapshot() {
  sqlite3 "$1" "SELECT hex(id) || '|' || hex(job_id) || '|' || hex(shift_date) || '|' || tips_cents || '|' || hourly_rate_cents || '|' || ifnull(hex(note), 'NULL') || '|' || ifnull(hex(deleted_at), 'NULL') || '|' || hex(created_at) || '|' || hex(updated_at) FROM shifts ORDER BY id;"
}

apply_migration() {
  sqlite3 "$1" <<SQL
.bail on
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
.read $migration_path
PRAGMA user_version = 2;
COMMIT;
SQL
}

fail() {
  echo "FAIL  $1"
  exit 1
}

db="$tmpdir/migrated.db"
create_v1_fixture "$db" || fail "could not create the version-1 fixture"
before_jobs=$(jobs_snapshot "$db")
before_shifts=$(shifts_snapshot "$db")
expected_durations=$(sqlite3 "$db" "SELECT id || '|' || (minutes * 60) FROM shifts ORDER BY id;")

apply_migration "$db" || fail "version-1-to-version-2 migration did not complete"

[ "$(sqlite3 "$db" 'PRAGMA user_version;')" = "2" ] || fail "user_version is not 2"
[ "$(jobs_snapshot "$db")" = "$before_jobs" ] || fail "a job field changed"
[ "$(shifts_snapshot "$db")" = "$before_shifts" ] || fail "a non-duration shift field changed"
[ "$(sqlite3 "$db" "SELECT id || '|' || duration_seconds FROM shifts ORDER BY id;")" = "$expected_durations" ] || fail "a duration was not multiplied by 60"
[ "$(sqlite3 "$db" "SELECT count(*) FROM pragma_table_info('shifts') WHERE name = 'minutes';")" = "0" ] || fail "the legacy minutes column remains"
[ "$(sqlite3 "$db" "SELECT count(*) FROM pragma_table_info('shifts') WHERE name = 'duration_seconds';")" = "1" ] || fail "duration_seconds is missing"
[ "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = "ok" ] || fail "integrity_check failed"
[ -z "$(sqlite3 "$db" 'PRAGMA foreign_key_check;')" ] || fail "foreign_key_check found a broken relationship"

if sqlite3 "$db" "UPDATE shifts SET duration_seconds = 0 WHERE id = 'shift-one-minute';" >/dev/null 2>&1; then
  fail "the migrated duration constraint accepted zero"
fi
if sqlite3 "$db" "UPDATE shifts SET duration_seconds = -1 WHERE id = 'shift-one-minute';" >/dev/null 2>&1; then
  fail "the migrated duration constraint accepted a negative value"
fi

rollback_db="$tmpdir/rollback.db"
create_v1_fixture "$rollback_db" || fail "could not create the rollback fixture"
rollback_before=$(shifts_snapshot "$rollback_db")
sqlite3 "$rollback_db" "CREATE TRIGGER force_failure BEFORE UPDATE OF minutes ON shifts BEGIN SELECT RAISE(ABORT, 'forced migration failure'); END;"

if apply_migration "$rollback_db" >/dev/null 2>&1; then
  fail "the forced migration failure unexpectedly committed"
fi

[ "$(sqlite3 "$rollback_db" 'PRAGMA user_version;')" = "1" ] || fail "rollback changed user_version"
[ "$(sqlite3 "$rollback_db" "SELECT count(*) FROM pragma_table_info('shifts') WHERE name = 'minutes';")" = "1" ] || fail "rollback did not restore the minutes column"
[ "$(sqlite3 "$rollback_db" "SELECT count(*) FROM pragma_table_info('shifts') WHERE name = 'duration_seconds';")" = "0" ] || fail "rollback left the renamed column behind"
[ "$(shifts_snapshot "$rollback_db")" = "$rollback_before" ] || fail "rollback changed a shift field"
[ "$(sqlite3 "$rollback_db" 'PRAGMA integrity_check;')" = "ok" ] || fail "rollback integrity_check failed"

echo "migration OK (preservation + rollback)"
