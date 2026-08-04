-- Version 3 adds what overtime needs and nothing more: when a shift happened
-- within its day, and where a job's workweek starts.
--
-- Times are optional on purpose. Every shift logged before this migration --
-- 845 of them on the developer's device -- has no time and never will, so a
-- NOT NULL column would either be a lie or force a made-up value into real
-- history. Overtime falls back to counting a shift wholly against its logged
-- date when the times are absent, which is exactly the midnight-boundary
-- behaviour, and says so in the estimate.
--
-- Stored as local "HH:MM" text, matching the date-only convention already in
-- schema.sql: a wall-clock time the worker would recognise, with no timezone
-- to translate wrong. Seconds are not stored because nobody logs a shift to
-- the second, and duration_seconds already carries the exact length.
ALTER TABLE shifts ADD COLUMN start_time TEXT;
ALTER TABLE shifts ADD COLUMN end_time TEXT;

-- Deliberately not a source of duration. duration_seconds stays authoritative
-- for how long a shift was, and these two only say where it sat in the day.
-- Deriving one from the other would let a rounded clock time silently rewrite
-- a recorded length, and end_time before start_time is legitimate anyway --
-- that is an overnight shift, which is most of a bartender's week.
--
-- SQLite cannot add a CHECK constraint to an existing table with ALTER, so
-- these are enforced by triggers instead. The constraint is real either way,
-- which is what the "constraints belong in the database" rule is about.
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

-- Overtime is per job and off until the user turns it on (D14). A universal
-- toggle is exactly what that decision rules out: entitlement depends on the
-- employer, and one wrong global switch would rewrite every number on screen.
ALTER TABLE jobs ADD COLUMN overtime_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (overtime_enabled IN (0, 1));

-- The employer's fixed workweek, which federal rules define as a recurring
-- 168-hour period that can start on any day at any hour -- not a calendar
-- week. 0 is Sunday, matching WEEKDAY_NAMES and the week boundary D10 pins
-- for Trends and the Log.
--
-- Defaulting to Sunday at midnight keeps every existing job unchanged, since
-- that is what the app already assumed everywhere else.
ALTER TABLE jobs ADD COLUMN workweek_start_weekday INTEGER NOT NULL DEFAULT 0
  CHECK (workweek_start_weekday BETWEEN 0 AND 6);

ALTER TABLE jobs ADD COLUMN workweek_start_time TEXT NOT NULL DEFAULT '00:00'
  CHECK (
    workweek_start_time GLOB '[0-9][0-9]:[0-9][0-9]'
    AND CAST(substr(workweek_start_time, 1, 2) AS INTEGER) <= 23
    AND CAST(substr(workweek_start_time, 4, 2) AS INTEGER) <= 59
  );
