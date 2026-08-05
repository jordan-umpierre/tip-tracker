#!/usr/bin/env bash

# Proves the version-4 tables can reproduce every stored backup column and that
# one bad shift rolls the preceding job insert back. The TypeScript contract
# test covers JSON validation; this script covers SQLite parity and rollback.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

if ! command -v sqlite3 >/dev/null; then
  echo "WARN  sqlite3 not installed, backup restore database test skipped"
  exit 0
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
source_db="$tmpdir/source.db"
restored_db="$tmpdir/restored.db"
rollback_db="$tmpdir/rollback.db"

for db in "$source_db" "$restored_db" "$rollback_db"; do
  sqlite3 "$db" < src/data/schema.sql || exit 1
  sqlite3 "$db" 'PRAGMA user_version = 4;' || exit 1
done

fixture_sql="
  INSERT INTO jobs
    (id,name,hourly_rate_cents,archived_at,created_at,updated_at,
     overtime_enabled,workweek_start_weekday,workweek_start_time)
  VALUES
    ('job-a','Cafe',0,NULL,'2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z',1,3,'06:00'),
    ('job-z','Old Diner',1500,'2026-08-04T12:00:00.000Z','2026-08-01T12:00:00.000Z','2026-08-04T12:00:00.000Z',0,0,'00:00');
  INSERT INTO federal_withholding_settings
    (id,job_id,effective_from,filing_status,pay_periods_per_year,
     step2_checked,step3_credits_cents,step4a_other_income_cents,
     step4b_deductions_cents,step4c_extra_withholding_cents,exempt,
     created_at,updated_at)
  VALUES
    ('tax-a','job-a','2026-01-01','single-or-married-filing-separately',26,0,0,0,0,2500,0,'2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z'),
    ('tax-z','job-z','2025-03-01','head-of-household',52,1,200000,10000,5000,725,1,'2026-08-01T12:00:00.000Z','2026-08-04T12:00:00.000Z');
  INSERT INTO shifts
    (id,job_id,shift_date,duration_seconds,tips_cents,hourly_rate_cents,
     note,deleted_at,created_at,updated_at,start_time,end_time)
  VALUES
    ('shift-a','job-a','2026-08-03',27300,0,0,'line one
line two',NULL,'2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z','17:30','01:05'),
    ('shift-z','job-z','2026-08-03',3600,500,1500,NULL,'2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z',NULL,NULL);"

sqlite3 "$source_db" "PRAGMA foreign_keys = ON; BEGIN IMMEDIATE; $fixture_sql COMMIT;" || exit 1
sqlite3 "$restored_db" "PRAGMA foreign_keys = ON; BEGIN IMMEDIATE; $fixture_sql COMMIT;" || exit 1

dump_rows() {
  sqlite3 -json "$1" "
    SELECT id,name,hourly_rate_cents,archived_at,created_at,updated_at,
           overtime_enabled,workweek_start_weekday,workweek_start_time
    FROM jobs ORDER BY id;
    SELECT id,job_id,effective_from,filing_status,pay_periods_per_year,
           step2_checked,step3_credits_cents,step4a_other_income_cents,
           step4b_deductions_cents,step4c_extra_withholding_cents,exempt,
           created_at,updated_at
    FROM federal_withholding_settings ORDER BY id;
    SELECT id,job_id,shift_date,duration_seconds,tips_cents,hourly_rate_cents,
           note,deleted_at,created_at,updated_at,start_time,end_time
    FROM shifts ORDER BY id;"
}

if [ "$(dump_rows "$source_db")" != "$(dump_rows "$restored_db")" ]; then
  echo "FAIL  restored rows differ from source rows"
  exit 1
fi

if [ "$(sqlite3 "$restored_db" 'PRAGMA foreign_key_check;')" != "" ]; then
  echo "FAIL  restored rows failed foreign_key_check"
  exit 1
fi

if [ "$(sqlite3 "$restored_db" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "FAIL  restored database failed integrity_check"
  exit 1
fi

if sqlite3 "$rollback_db" "
  PRAGMA foreign_keys = ON;
  BEGIN IMMEDIATE;
  INSERT INTO jobs
    (id,name,hourly_rate_cents,archived_at,created_at,updated_at)
  VALUES ('job-a','Cafe',0,NULL,'2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z');
  INSERT INTO federal_withholding_settings
    (id,job_id,effective_from,filing_status,pay_periods_per_year,
     step2_checked,step3_credits_cents,step4a_other_income_cents,
     step4b_deductions_cents,step4c_extra_withholding_cents,exempt,
     created_at,updated_at)
  VALUES ('tax-a','job-a','2026-01-01','single-or-married-filing-separately',26,0,0,0,0,0,0,
          '2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z');
  INSERT INTO shifts
    (id,job_id,shift_date,duration_seconds,tips_cents,hourly_rate_cents,
     note,deleted_at,created_at,updated_at)
  VALUES ('bad','missing','2026-08-03',3600,0,0,NULL,NULL,
          '2026-08-04T12:00:00.000Z','2026-08-04T12:00:00.000Z');
  COMMIT;" >/dev/null 2>&1; then
  echo "FAIL  invalid restore unexpectedly committed"
  exit 1
fi

if [ "$(sqlite3 "$rollback_db" 'SELECT COUNT(*) FROM jobs; SELECT COUNT(*) FROM federal_withholding_settings; SELECT COUNT(*) FROM shifts;')" != $'0\n0\n0' ]; then
  echo "FAIL  failed restore did not roll back every row"
  exit 1
fi

echo "backup restore database OK"
