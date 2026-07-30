#!/usr/bin/env bash
#
# Proves the constraints in schema.sql actually reject bad data.
#
# Run by hand:        ./scripts/test-schema.sh
# Runs automatically: .githooks/pre-commit
#
# Loading the schema without an error only proves it parses. A schema can parse
# perfectly and still accept a negative wage, and for an app whose whole point
# is reporting income correctly, that is the failure that matters. So every
# NOT NULL, CHECK, PRIMARY KEY and FOREIGN KEY in the file gets one statement
# aimed at it here, plus statements for the things the schema deliberately
# allows, so a constraint that is too strict fails too.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# No sqlite3 means no test. Say so out loud rather than passing silently, since
# a check that quietly does nothing is worse than no check.
if ! command -v sqlite3 >/dev/null; then
  echo "WARN  sqlite3 not installed, schema tests skipped"
  exit 0
fi

# A throwaway directory rather than a bare temp file, so the trap can delete the
# database and the -wal/-shm files SQLite may leave beside it in one go.
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
db="$tmpdir/test.db"

if ! sqlite3 "$db" < schema.sql; then
  echo "FAIL  schema.sql did not load"
  exit 1
fi

# Every sqlite3 call below opens a brand new connection, and foreign keys are
# OFF by default on each one. So the pragma has to be prepended every time.
# This is the same gotcha the app will hit when it opens its connection, and
# skipping it here would mean "testing" a foreign key that was never on.
sql() { sqlite3 "$db" "PRAGMA foreign_keys = ON; $1"; }

# Writing the column lists once means a rename breaks in one place, not fifteen.
job_cols="id, name, hourly_rate_cents, archived_at, created_at, updated_at"
shift_cols="id, job_id, shift_date, minutes, tips_cents, hourly_rate_cents, note, deleted_at, created_at, updated_at"
now="2026-07-30T09:00:00Z"

passed=0
failed=0

# The statement is supposed to be refused. If it succeeds, the constraint that
# was meant to stop it is missing or wrong.
rejects() {
  if sql "$2" >/dev/null 2>&1; then
    printf 'FAIL  accepted what it should reject: %s\n' "$1"
    failed=$((failed + 1))
  else
    passed=$((passed + 1))
  fi
}

# The mirror image: things the schema is supposed to allow. Without these, a
# schema that rejected everything would look like it was passing.
accepts() {
  local out
  if out=$(sql "$2" 2>&1); then
    passed=$((passed + 1))
  else
    printf 'FAIL  rejected what it should accept: %s\n        %s\n' "$1" "$out"
    failed=$((failed + 1))
  fi
}

# --- Things that must be allowed ------------------------------------------
# These run first because the rows they create are what the foreign key and
# delete tests below need to point at.

accepts "a normal job" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-1', 'Diner', 1200, NULL, '$now', '$now');"

# Zero is deliberate, not an oversight: some tipped roles have no hourly
# component at all. The CHECK is >= 0, not > 0, and this pins that down.
accepts "a job paying zero hourly, which some tipped roles do" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-2', 'Banquet', 0, NULL, '$now', '$now');"

accepts "an archived job" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-3', 'Old Cafe', 1500, '$now', '$now', '$now');"

accepts "a normal shift" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-1', 'job-1', '2026-07-29', 450, 8000, 1200, 'busy', NULL, '$now', '$now');"

# schema.sql says there is no UNIQUE on (job_id, shift_date) on purpose, because
# a double is a normal week. This is that comment turned into something that
# would actually break if someone added the constraint later.
accepts "a second shift at the same job on the same day" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-2', 'job-1', '2026-07-29', 240, 3000, 1200, NULL, NULL, '$now', '$now');"

# Zero tips is a slow night, not bad data.
accepts "a shift with zero tips" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-3', 'job-1', '2026-07-28', 300, 0, 1200, NULL, NULL, '$now', '$now');"

# The tombstone from D4. A deleted shift keeps its row so a second device has
# something to receive. Nothing in the schema blocks the write, which is exactly
# what this pins down.
accepts "a soft-deleted shift" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-4', 'job-1', '2026-07-27', 300, 2000, 1200, NULL, '$now', '$now', '$now');"

# --- Things that must be refused ------------------------------------------

rejects "a job with no name" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-bad', NULL, 1200, NULL, '$now', '$now');"

rejects "a job paying a negative wage" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-bad', 'Bad', -1, NULL, '$now', '$now');"

rejects "a job with no created_at" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-bad', 'Bad', 1200, NULL, NULL, '$now');"

rejects "a second job reusing an existing id" \
  "INSERT INTO jobs ($job_cols) VALUES ('job-1', 'Duplicate', 1200, NULL, '$now', '$now');"

rejects "a shift with no date" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-bad', 'job-1', NULL, 450, 8000, 1200, NULL, NULL, '$now', '$now');"

# A shift of no length is not a shift. The CHECK here is > 0, unlike the money
# columns, which is the distinction worth keeping straight.
rejects "a shift lasting zero minutes" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-bad', 'job-1', '2026-07-29', 0, 8000, 1200, NULL, NULL, '$now', '$now');"

rejects "a shift lasting negative minutes" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-bad', 'job-1', '2026-07-29', -60, 8000, 1200, NULL, NULL, '$now', '$now');"

rejects "a shift with negative tips" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-bad', 'job-1', '2026-07-29', 450, -1, 1200, NULL, NULL, '$now', '$now');"

rejects "a shift with a negative hourly rate" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-bad', 'job-1', '2026-07-29', 450, 8000, -1, NULL, NULL, '$now', '$now');"

rejects "a shift pointing at a job that does not exist" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-bad', 'job-nope', '2026-07-29', 450, 8000, 1200, NULL, NULL, '$now', '$now');"

# The D3 backstop. Jobs are meant to be archived rather than deleted, and this
# is what stops a bug in that code from taking someone's tax year with it.
rejects "deleting a job that still has shifts" \
  "DELETE FROM jobs WHERE id = 'job-1';"

# --- The pragma itself ------------------------------------------------------
# Everything above ran with foreign keys switched on. This runs the same bad
# insert with SQLite's default settings to show what the default actually costs:
# the row goes in, pointing at a job that was never there. The FOREIGN KEY line
# in schema.sql is decoration until the app turns this on per connection.
#
# Runs last because it deliberately leaves an orphan row behind.
if sqlite3 "$db" \
  "INSERT INTO shifts ($shift_cols) VALUES ('shift-orphan', 'job-nope', '2026-07-29', 450, 8000, 1200, NULL, NULL, '$now', '$now');" \
  >/dev/null 2>&1; then
  passed=$((passed + 1))
else
  printf 'FAIL  expected the foreign key to be unenforced without the pragma,\n'
  printf '      but the orphan insert was refused. SQLite defaults may have changed,\n'
  printf '      which would be good news worth reading up on.\n'
  failed=$((failed + 1))
fi

if [ "$failed" -eq 0 ]; then
  echo "schema OK ($passed checks)"
  exit 0
fi

echo
echo "$failed schema check(s) failed above."
exit 1
