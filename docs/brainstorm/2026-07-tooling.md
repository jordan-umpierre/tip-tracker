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

### 2026-07-30 — "How can I wire schema.sql into expo-sqlite? I have no idea how to do so."

Three unfamiliar pieces at once, worth naming separately: getting
`schema.sql`'s actual text into the running app (without copying it into a JS
string, which would give two copies of the schema that can drift apart),
opening a SQLite connection with `expo-sqlite`'s async API, and turning on
foreign keys before running the schema — `schema.sql`'s own header comment
already flags that SQLite ignores foreign keys by default, per connection.

`schema.sql` ships as a bundled asset instead of an inlined string:
`metro.config.js` gets `config.resolver.assetExts.push('sql')` so Metro
treats it as a data file, then `Asset.fromModule(require('./schema.sql')).
downloadAsync()` plus `new File(asset.localUri).text()` reads its contents
at runtime. That keeps `db.ts` and `scripts/test-schema.sh` always running
the exact same source of truth.

The part that would've broken on the second app launch: `schema.sql` has no
`IF NOT EXISTS` on its `CREATE TABLE` statements (on purpose, to keep it
byte-identical to what `test-schema.sh` loads), so running it twice throws.
Fixed with `PRAGMA user_version`, an integer SQLite stores in the database
file for exactly this — skip re-running the schema if a previous launch
already set it.

### 2026-07-30 — "Should I install expo-crypto, or did you already? What is it exactly?"

Already installed, at that point, via `npx expo install expo-crypto`.

It's Expo's first-party wrapper around native crypto functions — the same
role the Web Crypto API plays in a browser, backed by real OS-level crypto.
The one function needed here is `Crypto.randomUUID()`. Needed at all because
`schema.sql` uses text UUIDs as primary keys, not auto-incrementing numbers
(D1: two devices independently minting "row 5" would collide once sync
exists), and React Native doesn't reliably have `crypto.randomUUID()` built
into its JS environment the way browsers do. `expo-crypto` fills that gap as
a maintained Expo module rather than a random npm package — same reasoning
as D2's general preference for first-party modules.

### 2026-07-30 — Expo Go rejected the project: "requires a newer version of Expo Go"

Not a bug in this project's code. The Apple App Store's Expo Go build lags
behind Expo's own SDK releases by however long Apple's review takes — it was
still on SDK 54 while this project scaffolded on SDK 57, and Expo's own
changelogs confirm newer Expo Go builds routinely sit in App Store review for
weeks with no committed timeline. The App Store showing no available update
was correct; there genuinely wasn't a newer one published yet.

Fixed with `npx eas-cli@latest go`, which builds a custom Expo Go matched to
the project's actual SDK version on Expo's cloud build servers, then ships it
to a personal TestFlight team under the Apple Developer account running the
command. Requires an Apple Developer Program membership. The App Store
Connect API key EAS generates along the way needs the **Admin** role, not
the more restricted App Manager role — Apple only exposes
certificate/provisioning-profile management (which EAS needs to sign the
build) to Admin over the API, confirmed in Expo's own docs on required
Apple Developer Program roles.

One more wrinkle: the TestFlight app showed "Ready to Test" with a manual
"Redeem my invitation code" prompt instead of the build just appearing.
The code was in an email from Apple to the same Apple ID used for the
Developer Program account — worth checking spam, and worth double-checking
it's the same Apple ID as the one signed into TestFlight on the phone, since
a mismatched Apple ID is the most common reason an invite silently fails to
redeem.

### 2026-07-30 — "I genuinely have never handwritten any of this so I'm going to need a lot of guidance."

Said at the start of `CreateJobForm.tsx` — the first hand-written React or
React Native code in this project. Same shape as the earlier "I don't know
SQL syntax at all" moment: the fix is one fully worked, heavily annotated
example, then writing the next instance off that pattern, not nudging
someone toward syntax they've never seen.

The concepts that example had to cover, since none of them existed anywhere
else in the codebase yet:

- **`useState`** — how a component remembers a value across re-renders and
  triggers a re-render when it changes, versus a plain variable that would
  reset on every render.
- **Controlled inputs** — a `TextInput`'s `value` comes *from* state,
  `onChangeText` writes *back to* state. The round trip through state is
  the entire mechanism; the input itself doesn't remember what was typed.
- **Props with a callback** — the only direction a child component can tell
  a parent "something happened." Data flows down as props, events flow up
  as calling a function the parent passed down.
- **`View`/`Text`/`TextInput`/`Pressable`** — React Native's own primitives,
  not HTML. Each renders a real native view on the device, not a DOM
  element.
- **`StyleSheet.create`** — React Native's CSS equivalent: plain JS objects,
  flexbox by default on every `View`, no class names or stylesheet files.

`LogShiftForm` came right after as "the same pattern, more fields," proving
the worked-example approach actually transferred rather than needing to be
re-taught from scratch.

### 2026-07-30 — "i'd like to see some real examples as i've never really handwritten any of this before"

Said about `Array.prototype.reduce`, while building the gross totals row. The
first response had been a nudge — the concept, a skeleton with the body left
blank, and "post what you write." Wrong call, and the same wrong call the
`CreateJobForm` entry above already documents: nudging assumes the syntax is
known and the thinking is the gap. Here neither was.

What actually worked was building up from something already known. `reduce`
is a `for` loop with the bookkeeping deleted, so the explanation started as
the loop anyone would write without knowing `reduce` exists, then mapped the
pieces across one at a time:

- `let total = 0` above the loop becomes the **starting value**, the second
  argument, the one that's easy to read as optional decoration and isn't.
- `for (const n of nums)` disappears — `reduce` does the walking.
- `total = total + n` becomes the arrow function.

The part that actually trips people: **whatever the function returns becomes
the running value for the next item.** Nothing is being assigned to a
variable. Tracing three items by hand on paper is what makes it click, and it
was worth writing that trace out explicitly rather than describing it:

```
start:    runningTotal = 0
sees 5:   returns 0 + 5   = 5
sees 10:  returns 5 + 10  = 15
sees 20:  returns 15 + 20 = 35
```

Two things fell out of that starting value that are worth keeping. An empty
array returns the starting value unchanged, which is why `calculateTotals([])`
needs no special case for "no shifts logged yet" — the zeros are already the
right answer. And when the accumulator is an object rather than a number,
every field has to exist in that starting object with a zero in it; miss one
and the first pass does `undefined + 5`, which is `NaN`, which then poisons
every pass after it without throwing.

Also asked in the same breath: what a real engineer would do about the
decisions left open, and to hold every choice to "could I defend this in an
interview." That's what pushed three things that could have been skipped —
`totals.ts` as a pure module rather than more functions in `shifts.ts`, a real
test for the money math, and pulling `format.ts` out at the third copy rather
than the fifth. See D5 for the rounding decision itself.
