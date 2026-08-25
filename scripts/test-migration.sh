#!/usr/bin/env bash
#
# Proves the version-1-to-version-2 duration migration preserves every stored
# fact other than the unit it deliberately changes. It also forces the UPDATE
# to fail and checks that the surrounding transaction restores version 1.
#
# It also applies every SQL file independently of the app runner. The shared
# runner itself is exercised by databaseMigration.test.ts, so wiring and SQL
# behavior can disagree and fail instead of mirroring each other.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

if ! command -v sqlite3 >/dev/null; then
  echo "FAIL  sqlite3 is required for migration tests"
  exit 1
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

# --- the full SQL-file chain -----------------------------------------------
#
# Each hop stamps its own version rather than jumping straight to the newest,
# so the marker never describes a shape the database has not reached.
apply_chain() {
  sqlite3 "$1" <<SQL
.bail on
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
.read $migration_dir/1-to-2.sql
PRAGMA user_version = 2;
.read $migration_dir/2-to-3.sql
PRAGMA user_version = 3;
.read $migration_dir/3-to-4.sql
PRAGMA user_version = 4;
.read $migration_dir/4-to-5.sql
PRAGMA user_version = 5;
.read $migration_dir/5-to-6.sql
PRAGMA user_version = 6;
COMMIT;
SQL
}

apply_to_v4() {
  sqlite3 "$1" <<SQL
.bail on
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
.read $migration_dir/1-to-2.sql
PRAGMA user_version = 2;
.read $migration_dir/2-to-3.sql
PRAGMA user_version = 3;
.read $migration_dir/3-to-4.sql
PRAGMA user_version = 4;
COMMIT;
SQL
}

apply_v5() {
  sqlite3 "$1" <<SQL
.bail on
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
.read $migration_dir/4-to-5.sql
PRAGMA user_version = 5;
COMMIT;
SQL
}

apply_v6() {
  sqlite3 "$1" <<SQL
.bail on
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
.read $migration_dir/5-to-6.sql
PRAGMA user_version = 6;
COMMIT;
SQL
}

chain_db="$tmpdir/chain.db"
create_v1_fixture "$chain_db" || fail "could not create the chain fixture"
chain_before_jobs=$(jobs_snapshot "$chain_db")
chain_expected_durations=$(sqlite3 "$chain_db" "SELECT id || '|' || (minutes * 60) FROM shifts ORDER BY id;")

apply_chain "$chain_db" || fail "the 1-to-2-to-3-to-4-to-5-to-6 chain did not complete"

[ "$(sqlite3 "$chain_db" 'PRAGMA user_version;')" = "6" ] || fail "the chain did not end at version 6"
[ "$(jobs_snapshot "$chain_db")" = "$chain_before_jobs" ] || fail "the chain changed an existing job field"
[ "$(sqlite3 "$chain_db" "SELECT id || '|' || duration_seconds FROM shifts ORDER BY id;")" = "$chain_expected_durations" ] || fail "the chain lost the version-2 duration conversion"
[ "$(sqlite3 "$chain_db" 'PRAGMA integrity_check;')" = "ok" ] || fail "chain integrity_check failed"
[ -z "$(sqlite3 "$chain_db" 'PRAGMA foreign_key_check;')" ] || fail "chain foreign_key_check found a broken relationship"

# Existing rows have to come through with times absent and overtime off. A
# default that silently switched overtime on would rewrite every number the
# user already trusts.
[ "$(sqlite3 "$chain_db" "SELECT count(*) FROM shifts WHERE start_time IS NOT NULL OR end_time IS NOT NULL;")" = "0" ] || fail "the chain invented a shift time"
[ "$(sqlite3 "$chain_db" "SELECT count(*) FROM jobs WHERE overtime_enabled != 0;")" = "0" ] || fail "the chain enabled overtime on an existing job"
[ "$(sqlite3 "$chain_db" "SELECT count(*) FROM jobs WHERE workweek_start_weekday != 0 OR workweek_start_time != '00:00';")" = "0" ] || fail "an existing job did not default to Sunday midnight"
[ "$(sqlite3 "$chain_db" 'SELECT count(*) FROM federal_withholding_settings;')" = "0" ] || fail "the chain invented withholding settings"
[ "$(sqlite3 "$chain_db" 'SELECT count(*) FROM sync_outbox;')" = "6" ] || fail "the chain did not enqueue every existing row"
[ "$(sqlite3 "$chain_db" "SELECT count(*) FROM sync_outbox WHERE entity_id IN ('job-archived', 'shift-tombstone');")" = "2" ] || fail "the chain skipped archived or tombstoned history"
chain_device_id=$(sqlite3 "$chain_db" 'SELECT device_id FROM sync_state WHERE singleton = 1;')
[[ "$chain_device_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || fail "the chain did not create a canonical device id"

# The version-3 constraints have to actually reject, on a migrated database and
# not just a freshly created one.
chain_job=$(sqlite3 "$chain_db" "SELECT id FROM jobs LIMIT 1;")
chain_shift=$(sqlite3 "$chain_db" "SELECT id FROM shifts LIMIT 1;")
reject() {
  if sqlite3 "$chain_db" "$2" >/dev/null 2>&1; then
    fail "$1"
  fi
}
reject "overtime_enabled accepted 2"        "UPDATE jobs SET overtime_enabled = 2 WHERE id = '$chain_job';"
reject "workweek_start_weekday accepted 7"  "UPDATE jobs SET workweek_start_weekday = 7 WHERE id = '$chain_job';"
reject "workweek_start_time accepted 25:00" "UPDATE jobs SET workweek_start_time = '25:00' WHERE id = '$chain_job';"
reject "a start_time without an end_time"   "UPDATE shifts SET start_time = '18:00' WHERE id = '$chain_shift';"
reject "an end_time without a start_time"   "UPDATE shifts SET end_time = '02:00' WHERE id = '$chain_shift';"
reject "hour 24"                            "UPDATE shifts SET start_time = '24:00', end_time = '02:00' WHERE id = '$chain_shift';"
reject "minute 60"                          "UPDATE shifts SET start_time = '18:60', end_time = '02:00' WHERE id = '$chain_shift';"
reject "a non-time string"                  "UPDATE shifts SET start_time = 'evening', end_time = '02:00' WHERE id = '$chain_shift';"

sqlite3 "$chain_db" "UPDATE shifts SET start_time = '18:00', end_time = '02:00' WHERE id = '$chain_shift';" || fail "a valid overnight pair was rejected"
[ "$(sqlite3 "$chain_db" "SELECT start_time || '-' || end_time FROM shifts WHERE id = '$chain_shift';")" = "18:00-02:00" ] || fail "a valid time pair did not store"

sqlite3 "$chain_db" "INSERT INTO federal_withholding_settings (id,job_id,effective_from,filing_status,pay_periods_per_year,step2_checked,step3_credits_cents,step4a_other_income_cents,step4b_deductions_cents,step4c_extra_withholding_cents,exempt,created_at,updated_at) VALUES ('tax-chain','$chain_job','2026-08-15','single-or-married-filing-separately',26,0,0,0,0,2500,0,'2026-08-05T12:00:00.000Z','2026-08-05T12:00:00.000Z');" || fail "valid withholding settings were rejected after migration"
reject "duplicate job/effective date settings" "INSERT INTO federal_withholding_settings SELECT 'tax-duplicate',job_id,effective_from,filing_status,pay_periods_per_year,step2_checked,step3_credits_cents,step4a_other_income_cents,step4b_deductions_cents,step4c_extra_withholding_cents,exempt,created_at,updated_at FROM federal_withholding_settings WHERE id = 'tax-chain';"

# Force the last hop to fail and prove the runner's one outer transaction rolls
# the earlier duration and overtime hops back too.
chain_rollback_db="$tmpdir/chain-rollback.db"
create_v1_fixture "$chain_rollback_db" || fail "could not create the chain rollback fixture"
chain_rollback_before=$(shifts_snapshot "$chain_rollback_db")
sqlite3 "$chain_rollback_db" 'CREATE TABLE federal_withholding_settings (id TEXT);' || fail "could not install the forced chain failure"
if apply_chain "$chain_rollback_db" >/dev/null 2>&1; then
  fail "the forced final-hop failure unexpectedly committed"
fi
[ "$(sqlite3 "$chain_rollback_db" 'PRAGMA user_version;')" = "1" ] || fail "failed chain changed user_version"
[ "$(sqlite3 "$chain_rollback_db" "SELECT count(*) FROM pragma_table_info('shifts') WHERE name = 'minutes';")" = "1" ] || fail "failed chain did not restore the version-1 shift shape"
[ "$(shifts_snapshot "$chain_rollback_db")" = "$chain_rollback_before" ] || fail "failed chain changed a shift field"

# A setting can exist before version 5 even though the version-1 fixture cannot
# create one. Stop at version 4, add it, then prove the bootstrap includes that
# child along with archived and tombstoned history.
bootstrap_db="$tmpdir/bootstrap.db"
create_v1_fixture "$bootstrap_db" || fail "could not create the bootstrap fixture"
apply_to_v4 "$bootstrap_db" || fail "could not prepare the version-4 bootstrap fixture"
bootstrap_job=$(sqlite3 "$bootstrap_db" 'SELECT id FROM jobs LIMIT 1;')
sqlite3 "$bootstrap_db" "PRAGMA foreign_keys = ON; INSERT INTO federal_withholding_settings (id,job_id,effective_from,filing_status,pay_periods_per_year,step2_checked,step3_credits_cents,step4a_other_income_cents,step4b_deductions_cents,step4c_extra_withholding_cents,exempt,created_at,updated_at) VALUES ('tax-bootstrap','$bootstrap_job','2026-01-01','single-or-married-filing-separately',26,0,0,0,0,0,0,'2026-08-05T12:00:00.000Z','2026-08-05T12:00:00.000Z');" || fail "could not add the version-4 setting"
apply_v5 "$bootstrap_db" || fail "the version-5 bootstrap did not complete"
[ "$(sqlite3 "$bootstrap_db" 'SELECT count(*) FROM sync_outbox;')" = "7" ] || fail "version 5 did not enqueue every existing domain row"
[ "$(sqlite3 "$bootstrap_db" "SELECT operation FROM sync_outbox WHERE entity_type = 'federal_withholding_setting' AND entity_id = 'tax-bootstrap';")" = "upsert" ] || fail "version 5 skipped an existing withholding setting"

sqlite3 "$bootstrap_db" "UPDATE sync_state SET account_id = '00000000-0000-4000-8000-000000000001', last_server_change_sequence = 41 WHERE singleton = 1;" || fail "could not prepare version-5 sync state"
v5_outbox=$(sqlite3 "$bootstrap_db" 'SELECT local_sequence || "|" || entity_type || "|" || entity_id || "|" || operation FROM sync_outbox ORDER BY local_sequence;')
v5_max_sequence=$(sqlite3 "$bootstrap_db" 'SELECT max(local_sequence) FROM sync_outbox;')
apply_v6 "$bootstrap_db" || fail "the version-6 migration did not complete"
[ "$(sqlite3 "$bootstrap_db" 'PRAGMA user_version;')" = "6" ] || fail "the version-6 migration did not stamp version 6"
[ "$(sqlite3 "$bootstrap_db" 'SELECT account_id || "|" || last_server_change_sequence || "|" || applying_remote FROM sync_state;')" = "00000000-0000-4000-8000-000000000001|41|0" ] || fail "version 6 changed existing sync state"
[ "$(sqlite3 "$bootstrap_db" 'SELECT local_sequence || "|" || entity_type || "|" || entity_id || "|" || operation FROM sync_outbox ORDER BY local_sequence;')" = "$v5_outbox" ] || fail "version 6 changed existing outbox rows"
bootstrap_device_id=$(sqlite3 "$bootstrap_db" 'SELECT device_id FROM sync_state;')
[[ "$bootstrap_device_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || fail "version 6 did not create a canonical device id"
sqlite3 "$bootstrap_db" "UPDATE jobs SET name = name || ' changed' WHERE id = '$bootstrap_job';" || fail "a post-version-6 mutation failed"
post_v6_sequence=$(sqlite3 "$bootstrap_db" "SELECT local_sequence FROM sync_outbox WHERE entity_type = 'job' AND entity_id = '$bootstrap_job';")
[ "$post_v6_sequence" -gt "$v5_max_sequence" ] || fail "version 6 reused an old outbox sequence"

# Force only the last hop to fail after its ALTER, then prove the surrounding
# transaction restores the exact version-4 shape and marker.
v5_rollback_db="$tmpdir/v5-rollback.db"
create_v1_fixture "$v5_rollback_db" || fail "could not create the version-5 rollback fixture"
apply_to_v4 "$v5_rollback_db" || fail "could not prepare the version-5 rollback fixture"
sqlite3 "$v5_rollback_db" 'CREATE TABLE sync_state (sentinel INTEGER);' || fail "could not install the version-5 failure"
if apply_v5 "$v5_rollback_db" >/dev/null 2>&1; then
  fail "the forced version-5 failure unexpectedly committed"
fi
[ "$(sqlite3 "$v5_rollback_db" 'PRAGMA user_version;')" = "4" ] || fail "failed version-5 migration changed user_version"
[ "$(sqlite3 "$v5_rollback_db" "SELECT count(*) FROM pragma_table_info('federal_withholding_settings') WHERE name = 'deleted_at';")" = "0" ] || fail "failed version-5 migration left the tombstone column"
[ "$(sqlite3 "$v5_rollback_db" "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox';")" = "0" ] || fail "failed version-5 migration left an outbox table"

# A failed 5-to-6 hop must restore the v5 tables and their triggers. Creating
# the migration's temporary table forces failure after the trigger drops begin.
v6_rollback_db="$tmpdir/v6-rollback.db"
create_v1_fixture "$v6_rollback_db" || fail "could not create the version-6 rollback fixture"
apply_to_v4 "$v6_rollback_db" || fail "could not prepare the version-6 rollback fixture"
apply_v5 "$v6_rollback_db" || fail "could not reach version 5 for rollback"
v6_rollback_outbox=$(sqlite3 "$v6_rollback_db" 'SELECT local_sequence || "|" || entity_type || "|" || entity_id || "|" || operation FROM sync_outbox ORDER BY local_sequence;')
sqlite3 "$v6_rollback_db" 'CREATE TABLE sync_state_v6 (sentinel INTEGER);' || fail "could not install the version-6 failure"
if apply_v6 "$v6_rollback_db" >/dev/null 2>&1; then
  fail "the forced version-6 failure unexpectedly committed"
fi
[ "$(sqlite3 "$v6_rollback_db" 'PRAGMA user_version;')" = "5" ] || fail "failed version-6 migration changed user_version"
[ "$(sqlite3 "$v6_rollback_db" 'SELECT count(*) FROM pragma_table_info("sync_state") WHERE name = "device_id";')" = "0" ] || fail "failed version-6 migration changed sync_state"
[ "$(sqlite3 "$v6_rollback_db" 'SELECT local_sequence || "|" || entity_type || "|" || entity_id || "|" || operation FROM sync_outbox ORDER BY local_sequence;')" = "$v6_rollback_outbox" ] || fail "failed version-6 migration changed outbox rows"
[ "$(sqlite3 "$v6_rollback_db" "SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_sync_%';")" = "9" ] || fail "failed version-6 migration did not restore sync triggers"

# --- a fresh database and a migrated one have to be the same shape ---------
#
# schema.sql builds version 3 in one statement; the migrations arrive at it in
# hops. If those two drift, test-schema.sh is testing a shape no real device
# has. Column order counts: ALTER can only append, so schema.sql declares the
# version-3 columns last on purpose, and this is what keeps that honest.
#
# Comparing the stored DDL text would not work -- SQLite keeps CREATE TABLE
# verbatim including comments, while ALTER-added columns arrive without them.
# What matters is the resolved structure.
fresh_db="$tmpdir/fresh.db"
sqlite3 "$fresh_db" < src/data/schema.sql || fail "schema.sql did not load"

for table in jobs shifts federal_withholding_settings sync_state sync_metadata sync_outbox; do
  fresh_cols=$(sqlite3 "$fresh_db" "PRAGMA table_info($table);")
  chain_cols=$(sqlite3 "$chain_db" "PRAGMA table_info($table);")
  if [ "$fresh_cols" != "$chain_cols" ]; then
    printf 'FAIL  a fresh %s differs from a migrated one\n' "$table"
    diff <(printf '%s\n' "$fresh_cols") <(printf '%s\n' "$chain_cols")
    exit 1
  fi
done

fresh_indexes=$(sqlite3 "$fresh_db" "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name;")
chain_indexes=$(sqlite3 "$chain_db" "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name;")
[ "$fresh_indexes" = "$chain_indexes" ] || fail "a fresh database and a migrated one have different indexes"

fresh_triggers=$(sqlite3 "$fresh_db" "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name;")
chain_triggers=$(sqlite3 "$chain_db" "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name;")
[ "$fresh_triggers" = "$chain_triggers" ] || fail "a fresh database and a migrated one have different triggers"

[ "$(sqlite3 "$fresh_db" 'SELECT count(*) FROM sync_outbox;')" = "0" ] || fail "a fresh database started with pending sync rows"

echo "migration OK (preservation + rollback + 1-to-6 chain + bootstrap + fresh/migrated parity)"
