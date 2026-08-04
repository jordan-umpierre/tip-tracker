-- Database schema for tip-tracker.
-- SQLite, running on the device (see D1 in docs/decisions.md).
--
-- Wired into the app via db.ts, which bundles this file as an asset (see
-- metro.config.js) and runs it against expo-sqlite on first launch, guarded
-- by PRAGMA user_version so it doesn't re-run on every launch. Also loaded
-- independently by scripts/test-schema.sh, which checks that every
-- constraint below actually rejects the data it is supposed to reject --
-- that script is what proves this file is correct in isolation, db.ts is
-- what proves it actually runs on a real device.
--
-- One SQLite gotcha that bites people: foreign keys are OFF by default and
-- have to be turned on per database connection with "PRAGMA foreign_keys = ON".
-- That belongs in the app code that opens the connection, not here -- see
-- db.ts. Without it the FOREIGN KEY below is decoration and silently
-- enforces nothing.

-- A job is a place you work, at a rate.
-- Someone can have several: a main serving job, a weekend bartending gig.
CREATE TABLE jobs (
  -- Text, not an auto-incrementing number, because two phones would both
  -- create "id 5" and there'd be no way to tell those rows apart when we
  -- add sync later. A UUID generated on the device is unique everywhere.
  id TEXT PRIMARY KEY,

  -- NOT NULL means the database rejects a row without this value.
  -- Validation that lives in the database can't be forgotten by the app.
  name TEXT NOT NULL,

  -- Money as whole cents, never a decimal. $24.50 is stored as 2450.
  -- Floating point can't represent most decimals exactly, and those tiny
  -- errors add up across hundreds of shifts and a tax calculation.
  -- The "_cents" suffix is in the name so nobody has to guess the unit.
  --
  -- CHECK rejects negative pay outright. Zero is allowed on purpose, since
  -- some tipped roles have no hourly component at all.
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),

  -- Jobs are archived, never deleted (D3). "Delete" in the UI sets this
  -- timestamp and the row stays put, so shift history is never destroyed
  -- along with the job. NULL means the job is still active.
  --
  -- The catch to remember: every query that lists jobs has to filter on
  -- "archived_at IS NULL". Miss it once and archived jobs show up in a picker.
  -- Worth writing that query in one place and reusing it.
  archived_at TEXT,

  -- SQLite has no date type. ISO 8601 strings sort correctly as text,
  -- which is the whole reason this format is worth sticking to.
  created_at TEXT NOT NULL,

  -- Needed for sync later: when two devices disagree, the later edit wins.
  updated_at TEXT NOT NULL,

  -- Overtime is per job and off until the user turns it on (D14). Federal
  -- entitlement depends on the employer and the role, so there is no sane
  -- global default -- a universal toggle would rewrite every number on screen
  -- based on a guess.
  --
  -- Declared last because migrations/2-to-3.sql adds these with ALTER, which
  -- can only append. Matching that order keeps a database created from this
  -- file byte-identical to one upgraded into version 3.
  overtime_enabled INTEGER NOT NULL DEFAULT 0 CHECK (overtime_enabled IN (0, 1)),

  -- The employer's fixed workweek. Federal rules define it as a recurring
  -- 168-hour period that may start on any day at any hour, which is not the
  -- same thing as a calendar week. 0 is Sunday, matching WEEKDAY_NAMES and the
  -- week boundary D10 pins for Trends and the Log.
  workweek_start_weekday INTEGER NOT NULL DEFAULT 0
    CHECK (workweek_start_weekday BETWEEN 0 AND 6),

  -- Local "HH:MM", zero-padded so it compares as text. Midnight is the default
  -- because that is what every other part of this app already assumes.
  workweek_start_time TEXT NOT NULL DEFAULT '00:00'
    CHECK (
      workweek_start_time GLOB '[0-9][0-9]:[0-9][0-9]'
      AND CAST(substr(workweek_start_time, 1, 2) AS INTEGER) <= 23
      AND CAST(substr(workweek_start_time, 4, 2) AS INTEGER) <= 59
    )
);

-- A shift is one instance of working: a date, some hours, some tips.
-- This is the table the whole app revolves around. Everything in the trends
-- and tax layers is a query over these rows, not new stored data.
CREATE TABLE shifts (
  -- Same UUID reasoning as jobs.id above.
  id TEXT PRIMARY KEY,

  -- TEXT, not INTEGER, because it has to match the type of jobs.id.
  -- A foreign key comparing TEXT to INTEGER would never match anything.
  job_id TEXT NOT NULL,

  -- Date only, no time, no timezone: "2026-07-29".
  -- A shift worked on the 29th is on the 29th no matter where the phone is.
  -- Storing a full UTC timestamp instead would let a late shift in a negative
  -- offset timezone display as the following day.
  shift_date TEXT NOT NULL,

  -- Duration as whole seconds, so 7.5 hours is 27000. Same reason as cents:
  -- fractional hours in REAL would reintroduce floating point drift. Seconds
  -- also preserve CSV exports measured in hundredths of an hour exactly (D12):
  -- one hundredth is 36 seconds.
  -- CHECK because a shift of zero or negative length isn't a shift.
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),

  -- Zero is a real answer here (slow night), negative is not.
  tips_cents INTEGER NOT NULL CHECK (tips_cents >= 0),

  -- The important one. This is a copy of the job's rate at the moment the
  -- shift was created, NOT a lookup into jobs. A shift is a record of what
  -- already happened, so a raise later must not change what last year paid.
  -- Same column name as jobs.hourly_rate_cents to make the copy obvious.
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),

  -- Most shifts won't have a note, so this one is allowed to be empty.
  note TEXT,

  -- Tombstone. Deleting a shift sets this timestamp instead of removing the
  -- row (D4). Same mechanism as jobs.archived_at (D3), different name on
  -- purpose: archiving a job means "I don't work there anymore", deleting a
  -- shift means "that was a mistake". Storing the user's actual intent beats
  -- reusing one word for both.
  --
  -- Why the row has to stay at all: once a second device exists, a row that
  -- was truly deleted is invisible to any device that never saw it, so the
  -- shift reappears on the other phone. There is nothing left to send saying
  -- "this is gone". A tombstone is that something.
  --
  -- Same catch as jobs, now on a second table: every query listing shifts has
  -- to filter "deleted_at IS NULL". Centralize it in one place.
  deleted_at TEXT,


  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- When the shift sat within its day, as local "HH:MM". Optional, because
  -- every shift logged before schema version 3 has no time and never will --
  -- a NOT NULL column would force a made-up value into real history.
  --
  -- These do not define how long the shift was. duration_seconds stays
  -- authoritative for that, so a rounded clock time can never silently rewrite
  -- a recorded length. An end_time earlier than start_time is legitimate and
  -- means the shift crossed midnight, which is most of a bartender's week.
  --
  -- Their job is placing a shift against an employer's workweek boundary,
  -- which federal rules allow to start at any hour. Without them, overtime
  -- counts a shift wholly against its logged date.
  --
  -- Validity is enforced by the triggers below rather than a CHECK, because
  -- ALTER TABLE cannot add a CHECK to an existing table and the migrated and
  -- freshly created databases have to end up identical.
  start_time TEXT,
  end_time TEXT,

  -- Stops a shift from pointing at a job that doesn't exist.
  -- RESTRICT means SQLite refuses to delete a job that still has shifts.
  -- The app should never try, since jobs are archived instead (D3) - this is
  -- the backstop so a bug in that code can't wipe out someone's tax year.
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT
);

-- Deliberately absent, so nobody adds them thinking they were forgotten:
--
-- No UNIQUE constraint on (job_id, shift_date). Working two shifts at the same
-- job on one day is normal and has to be allowed.
--
-- No indexes yet. Queries will filter shifts by date and by job, which sounds
-- like it wants an index, but a few thousand rows scan faster than the screen
-- can redraw. Add one when there's a slow query to point at, not before.

-- Shift times are all-or-nothing and have to be real times. Triggers rather
-- than CHECK constraints so that a database created from this file and one
-- upgraded by migrations/2-to-3.sql enforce the rule the same way -- SQLite
-- cannot ALTER a CHECK onto an existing table, so the migration has only this
-- option and this file matches it deliberately.
CREATE TRIGGER shifts_times_valid_insert
BEFORE INSERT ON shifts
FOR EACH ROW
WHEN NEW.start_time IS NOT NULL OR NEW.end_time IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'shift times must be set together')
  WHERE NEW.start_time IS NULL OR NEW.end_time IS NULL;

  SELECT RAISE(ABORT, 'shift times must be HH:MM')
  WHERE NEW.start_time NOT GLOB '[0-9][0-9]:[0-9][0-9]'
     OR NEW.end_time NOT GLOB '[0-9][0-9]:[0-9][0-9]'
     OR CAST(substr(NEW.start_time, 1, 2) AS INTEGER) > 23
     OR CAST(substr(NEW.end_time, 1, 2) AS INTEGER) > 23
     OR CAST(substr(NEW.start_time, 4, 2) AS INTEGER) > 59
     OR CAST(substr(NEW.end_time, 4, 2) AS INTEGER) > 59;
END;

CREATE TRIGGER shifts_times_valid_update
BEFORE UPDATE ON shifts
FOR EACH ROW
WHEN NEW.start_time IS NOT NULL OR NEW.end_time IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'shift times must be set together')
  WHERE NEW.start_time IS NULL OR NEW.end_time IS NULL;

  SELECT RAISE(ABORT, 'shift times must be HH:MM')
  WHERE NEW.start_time NOT GLOB '[0-9][0-9]:[0-9][0-9]'
     OR NEW.end_time NOT GLOB '[0-9][0-9]:[0-9][0-9]'
     OR CAST(substr(NEW.start_time, 1, 2) AS INTEGER) > 23
     OR CAST(substr(NEW.end_time, 1, 2) AS INTEGER) > 23
     OR CAST(substr(NEW.start_time, 4, 2) AS INTEGER) > 59
     OR CAST(substr(NEW.end_time, 4, 2) AS INTEGER) > 59;
END;
