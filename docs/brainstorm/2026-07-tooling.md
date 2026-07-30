# Q&A log — July 2026 — SQL, tooling, running things

Part of the July 2026 Q&A archive, split by purpose once the single-file
archive passed ~500 lines. See `2026-07.md` for the split index.

Companion docs: `../../BRAINSTORM.md` for product thinking and open questions,
`../../DECISIONS.md` for the numbered decisions.

### 2026-07-29 — "I don't know SQL syntax at all, and I don't know what files or directories to make. It's overwhelming."

The overwhelm has a cause: trying to hold the whole app in your head at once.
That isn't possible for anyone. The fix is shrinking the unit of work until it's
boring.

Three things that make this smaller than it feels:

**1. You don't design the directory structure.** `npx create-expo-app` generates
it. Not a decision to agonize over — the tool has a reasonable opinion. And
we're not at that step yet.

**2. SQLite has five data types.** `TEXT`, `INTEGER`, `REAL`, `BLOB`, `NULL`.
That's the whole type system. Compare to memorizing all of CSS.

**3. The next file is one file.** `schema.sql`. Not a project.

#### SQL syntax, the 5% that covers this schema

Creating a table is a list of columns. Each column is three things: a name, a
type, and optional constraints.

```sql
CREATE TABLE table_name (
  column_name TYPE CONSTRAINTS,
  another_column TYPE CONSTRAINTS
);
```

Types used here:

- `TEXT` — strings. Also dates, since SQLite has no date type. ISO 8601
  (`2026-07-29`) is used because it sorts correctly as plain text.
- `INTEGER` — whole numbers. All money and all durations, to avoid floats.
- `REAL` — floating point. Deliberately avoided in this schema.

Constraints used here:

- `PRIMARY KEY` — this column uniquely identifies the row.
- `NOT NULL` — the database rejects a row missing this value. Validation that
  lives in the database can't be forgotten by application code.
- `FOREIGN KEY` — this column must point at a real row in another table. Stops
  a shift from referencing a job that doesn't exist.

Naming convention for this project: `snake_case` for tables and columns, plural
table names (`jobs`, `shifts`), and units in the column name
(`hourly_rate_cents`, not `hourly_rate`) so nobody has to guess.

### 2026-07-30 — "How do I actually run and test what we've built so far?"

There was no app yet, so the honest answer: `test-schema.sh` and the `sqlite3`
CLI, nothing else exists to run. First run showed the script had been silently
skipping — `sqlite3` wasn't installed on this machine, and the script says so
out loud (`WARN sqlite3 not installed, schema tests skipped`) instead of passing
quietly. Installed via `winget` (native to Windows 11), and the suite ran for
real: `schema OK (19 checks)`.

That surfaced a harder question: how do you trust a check you didn't write and
haven't seen fail? Same rule this file already lives by ("a check that has never
been shown to fail is not a check," see `2026-07-docs-and-process.md`) — you
break it on purpose. Loosened the negative-wage `CHECK` in `schema.sql` from
`>= 0` to `>= -999999`, reran the suite, watched it print `FAIL accepted what it
should reject: a job paying a negative wage`, then put the constraint back and
confirmed `schema OK` returned. That's the actual proof the test does something,
not just that it's present.

### 2026-07-30 — "Is there a GUI, or is that frowned upon?"

Not frowned upon — plenty of senior engineers use DB Browser, TablePlus,
DataGrip day to day. What's actually looked down on is *only* knowing the GUI:
clicking around without being able to write the SQL underneath, so you're stuck
the moment the tool isn't installed on whatever box you're on. Landed on both:
`sqlite3` for actually typing and understanding the SQL, DB Browser for SQLite
to *see* the row land after an `INSERT` — closing the loop visually reinforces
what the SQL just did. Installed DB Browser via `winget`, opened a real
`tip-tracker.db` file built from `schema.sql` (`sqlite3 tip-tracker.db <
schema.sql`), and added `*.db` to `.gitignore` since it's throwaway test data,
not source.

### 2026-07-30 — Getting lost in the sqlite3 shell (terminal/tool boundary)

Repeated confusion: typing `cd` while already inside the `sqlite>` prompt (`cd`
is bash, not SQL, so the shell just sits there waiting for a `;`), and typing
`sqlite3 tip-tracker.db` a second time after already being inside the shell —
same mistake in reverse. The rule: `cd` always happens in bash, before launching
`sqlite3`. Once you see `sqlite>`, everything typed from then on is either SQL
ending in `;` or a dot-command like `.tables`. `sqlite>` also isn't something to
type — it's SQLite's own prompt, the same role `$` plays in bash.

Also: pasting multi-line SQL into the plain Windows `sqlite3` binary replays it
character-by-character including the newlines, so each line half-executes
before it can be edited — no real line editor in that build. Fix: collapse a
paste to one line, or write SQL to a `.sql` file and load it with `.read
file.sql` (or `sqlite3 db < file.sql`) instead of pasting into a live prompt —
closer to how it's actually done anyway.
