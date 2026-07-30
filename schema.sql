-- Database schema for tip-tracker.
-- SQLite, running on the device (see D1 in BRAINSTORM.md).
--
-- This file is the plan, not yet wired into an app. Nothing runs it yet.
--
-- One SQLite gotcha that bites people: foreign keys are OFF by default and
-- have to be turned on per database connection with "PRAGMA foreign_keys = ON".
-- That belongs in the app code that opens the connection, not here. Without it
-- the FOREIGN KEY below is decoration and silently enforces nothing.

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
  updated_at TEXT NOT NULL
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

  -- Duration as whole minutes, so 7.5 hours is 450. Same reason as cents:
  -- fractional hours in REAL would reintroduce floating point drift.
  -- CHECK because a shift of zero or negative length isn't a shift.
  minutes INTEGER NOT NULL CHECK (minutes > 0),

  -- Zero is a real answer here (slow night), negative is not.
  tips_cents INTEGER NOT NULL CHECK (tips_cents >= 0),

  -- The important one. This is a copy of the job's rate at the moment the
  -- shift was created, NOT a lookup into jobs. A shift is a record of what
  -- already happened, so a raise later must not change what last year paid.
  -- Same column name as jobs.hourly_rate_cents to make the copy obvious.
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),

  -- The only nullable column in the table. Most shifts won't have a note.
  note TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

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
