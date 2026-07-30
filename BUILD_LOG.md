# Build Log

Chronological, commit by commit. The test for this file: if the repo vanished
and only this doc survived, could you recreate it, in order, without guessing?
That's a different job from the other docs, so it stays separate:

- `DECISIONS.md` — *why* a choice was made, indexed by number, not in order.
- `BRAINSTORM.md` — the running Q&A and what's next.
- `BUILD_LOG.md` (this file) — *what happened, in what order, with enough
  command-level detail to redo it.*

Where a commit made a real technical decision, this file names it and points
at the `DECISIONS.md` entry (`see D1`) instead of restating the reasoning.

Every real commit gets an entry here, in the same session it's made, per
`CLAUDE.md`'s cold-agent handoff steps. `check-docs.sh` warns if this file's
`Last updated` date goes stale while other tracked files are committed, the
same way it already does for `BRAINSTORM.md`.

Last updated: 2026-07-30

---

## `dcbe5ca` — initial commit (2026-07-29)

`git init`, then a single-line placeholder `README.md`. Nothing else yet —
deliberate: the plan was to write the product thinking down before any code,
not fill in docs after the fact.

## `d3f668a` — docs: add brainstorm log with product definition and MVP scope (2026-07-29)

Wrote `BRAINSTORM.md` from a blank file. Established the shape every doc in
this repo still follows: an Order of Operations section (append-only, what
happened and what's next), a product definition, an explicit MVP-vs-later
split, a Pushback/Risks section, Open Questions, and a Q&A log.

Product definition settled here: net take-home income for tipped workers, not
gross, for both W2 and 1099. MVP scope: log a shift, see it. Trends, net
income math, and tax projection are named as later layers and deliberately
not started.

## `4f9f5163` — docs: record local-first decision and evaluate Expo vs bare RN (2026-07-29)

First real technical decisions, written into `BRAINSTORM.md` before
`DECISIONS.md` existed as its own file (that split comes two commits later).

- Local-first storage, no backend or accounts in MVP, sync to a Postgres
  backend added later, sign-in optional — see D1.
- Evaluated Expo against bare React Native and native Swift/Kotlin, chose
  Expo — see D2.

## `12d3efa3` — docs: decide on Expo and clarify how it relates to React Native (2026-07-29)

Follow-up to the previous commit: clarified that React Native isn't a
competitor to React (it's a different renderer for the same component model),
and that Expo isn't a competitor to React Native (it's a toolchain on top of
it that owns the native build config). That distinction is why D2 reads the
way it does — the real question was narrower than "which framework," it was
"do I own `ios/`/`android/` myself or let a toolchain generate them."

## `97a7d877` — docs: add SQLite schema for jobs and shifts (2026-07-29)

Wrote `schema.sql`: two tables, `jobs` and `shifts`. This is where the data
conventions that show up everywhere else in the repo were set:

- Money as integer cents (`hourly_rate_cents`, `tips_cents`), never floats.
- Durations as integer minutes.
- Text UUIDs for primary keys, not autoincrement integers, so two devices
  can't collide once sync exists.
- ISO 8601 date-only strings for calendar days.
- `created_at`/`updated_at` on every row.
- A shift copies the job's hourly rate at the time it was worked instead of
  looking it up live, so a later raise can't rewrite last year's pay.
- Jobs get `archived_at` instead of being hard-deleted — see D3.

To recreate: write the file, then sanity-check it loads with
`sqlite3 tip-tracker.db < schema.sql` (a throwaway file, gitignored — see the
`d167190` entry below). At this point there was no automated test yet; that
came in `f4cbc164`.

## `f6e90142` — docs: split decision log into DECISIONS.md (2026-07-29)

`BRAINSTORM.md` had accumulated three real decisions inline and was getting
hard to scan for just the decisions. Pulled them into a new `DECISIONS.md`
with the numbered format (`D1`, `D2`, `D3`, each with Decision / Alternatives
/ Why / Revisit when) that every decision in the repo still uses. Left a
pointer behind in `BRAINSTORM.md` rather than deleting the context. Also
added the first `.gitignore` entries (`CLAUDE.md`, since it's local guidance
not meant to be tracked, and `.DS_Store`).

## `dee54965` — chore: add doc staleness checks with pre-commit hook (2026-07-29)

Two real bugs had already happened by this point — a duplicate `## Decision
Log` heading left over from the split above, and a `D2` subsection stranded
in the wrong place after `D3` was added. Both came from appending to a long
file without rereading it, which a script catches reliably and a person
doesn't.

Added:
- `scripts/check-docs.sh` — checks for duplicate headings, `D<n>` references
  that don't resolve to a real entry in `DECISIONS.md`, and broken markdown
  links.
- `.githooks/pre-commit` — runs it automatically on every commit.
- A repo-tracked hooks directory needs one manual step per clone/machine,
  since git doesn't look in `.githooks/` by default:
  `git config core.hooksPath .githooks`.

To recreate this step: write the script, `chmod +x` it and the hook, run
`git config core.hooksPath .githooks`, then verify the hook actually fires by
deliberately breaking a doc and confirming the commit gets blocked — this
project's own rule is "a check that's never been shown to fail is not a
check."

## `17bba79c` — fix: make failing doc checks actually block the commit (2026-07-30)

Found by testing the check on purpose (per the rule above): the duplicate-
heading check piped `grep` into `while read`, which runs the loop in a bash
subshell. Setting `fail=1` inside that subshell didn't survive back to the
parent shell, so the script printed `FAIL` and still exited 0. Fixed by
reading from a process substitution (`done < <(...)`) instead of a pipe, which
keeps the loop in the same shell. This bug and fix are also documented inline
in `check-docs.sh` itself, since it's exactly the kind of thing worth
explaining at the point it matters.

## `58176440` — fix: scope doc checks to tracked files and resolve links per directory (2026-07-30)

Two more bugs found the same way:
- The script globbed `*.md`, which only matches the repo root — anything
  under `docs/` was invisible to it.
- Markdown links were resolved against the repo root instead of the file's
  own directory, so a correct relative link from a nested file could get
  flagged as broken.

Fixed by switching to `git ls-files '*.md'` (also picks up files staged in
the current commit, not just what's already committed) and resolving each
link against `dirname` of the file it was written in.

## `de682ccf` — fix: correct stale decision reference and check citation targets (2026-07-30)

`schema.sql` still cited a decision as living in `BRAINSTORM.md` after the
`f6e90142` split had already moved it to `DECISIONS.md`. Fixed the stale
citation, and added a check to `check-docs.sh` that catches this specific
shape of bug going forward: a `D<n>` reference that names an existing decision
number but points at the wrong file.

## `f4cbc164` — test: verify schema constraints reject bad data (2026-07-30)

Until this commit, "the schema works" only meant "the schema parses." Added
`scripts/test-schema.sh`: loads `schema.sql` into a throwaway SQLite database
in `mktemp -d`, then runs one `INSERT`/`DELETE` per constraint to prove it
actually rejects what it should and accepts what it should. Nineteen checks,
covering both directions — including one that deliberately runs *without*
`PRAGMA foreign_keys = ON` first, to prove the foreign key is really
decoration without it. Wired into `.githooks/pre-commit` alongside
`check-docs.sh`, both running even if the first one fails, so a broken commit
reports everything wrong at once instead of one failure at a time.

Recreate by writing the script against the current `schema.sql`, then run
`./scripts/test-schema.sh` directly — needs `sqlite3` on PATH.

## `15fa3928` — feat: give shifts a deleted_at tombstone (2026-07-30)

A review caught `DECISIONS.md` and `schema.sql` disagreeing: D3 argues a hard
delete is invisible to a device that never saw the row (that's why jobs get
`archived_at`), and yet `shifts` was still hard-deleting. Added
`shifts.deleted_at` — see D4 for the full reasoning, including why this isn't
the same YAGNI violation it looks like at first glance. Updated
`test-schema.sh` with cases for a soft-deleted shift.

## `00e431b1` — docs: replace the placeholder README with a real one (2026-07-30)

The `README.md` from the initial commit was still one line. Wrote the real
one: what the app does and why, current status, the stack table (each row
pointing at its `DECISIONS.md` entry), the data conventions summary, repo
layout, and how to run the checks. Also tightened `.gitignore` at the same
time.

## `bf25af83` — docs: archive the Q&A log by month (2026-07-30)

`BRAINSTORM.md` hit 592 lines, past the ~500-line split threshold the repo's
own convention calls for. Its ever-growing Q&A section was the part with no
natural size limit, so it moved out to `docs/brainstorm/2026-07.md`, leaving
a short pointer behind in `BRAINSTORM.md`. Established the archiving rule:
split by calendar month, not by an arbitrary line count, and never as a
numbered sequel file.

## `d1671906` — chore: ignore local scratch SQLite database file (2026-07-30)

Added `*.db` to `.gitignore`. `tip-tracker.db` — the throwaway database you
get by running `sqlite3 tip-tracker.db < schema.sql` to manually check the
schema — isn't source and was never meant to be tracked.

## `74b58122` — docs: split July Q&A archive by topic, log this session (2026-07-30)

The same splitting rule applied recursively: `docs/brainstorm/2026-07.md`
itself passed ~500 lines the same day it was created. Split it by topic into
`2026-07-architecture.md`, `2026-07-docs-and-process.md`,
`2026-07-product-and-data-model.md`, and `2026-07-tooling.md`, with
`2026-07.md` left behind as a short index rather than deleted.

## `0bfb7a61` — feat: add cold-agent handoff system with staleness checks (2026-07-30)

This project gets worked in short sessions, often by a fresh agent with no
memory of the last one. Built the explicit handoff protocol that's now in
`CLAUDE.md`'s "Cold agent handoff" section: check `core.hooksPath` first,
read the `NEXT:` line in `BRAINSTORM.md`'s Order of Operations, do that one
task, update the log before ending the session. Added two matching checks to
`check-docs.sh`:

- `core.hooksPath` not actually set to `.githooks` (this had silently gone
  unset on this machine for a while, with nothing catching it).
- `BRAINSTORM.md`'s `Last updated` date being stale while other tracked
  changes are being committed.

Both are warnings, not hard failures — a warning was the right call here
because most commits in a session are smaller than a full handoff and
shouldn't be blocked on updating the log every time.

## `477c0e5b` — feat: scaffold Expo app with TypeScript template (2026-07-30)

First app code. To recreate:

1. `npx create-expo-app@latest . --template blank-typescript` refuses to run
   in a non-empty directory, and this repo already has `BRAINSTORM.md`,
   `schema.sql`, etc. in it. Workaround: scaffold into a throwaway
   subdirectory instead (`npx create-expo-app@latest .expo-scaffold-tmp
   --template blank-typescript`), then move every generated file up into the
   project root and delete the empty subdirectory.
2. The scaffold generates its own `CLAUDE.md` (a one-line stub) and its own
   `.gitignore`. Do not let either overwrite what's already here: keep the
   project's real `CLAUDE.md`, and merge the scaffold's `.gitignore` rules
   (`node_modules/`, `.expo/`, native build folders, etc.) into the existing
   file instead of replacing it — this exact trap was already flagged in a
   comment left in `.gitignore` by the `00e431b1` commit.
3. Because the app was generated inside a directory literally named
   `.expo-scaffold-tmp`, `app.json`'s `name`/`slug` and `package.json`'s
   `name` all came out as `.expo-scaffold-tmp` / `expo-scaffold-tmp`. Caught
   by running `npx expo-doctor`, which flagged the slug as invalid (slugs
   can't contain dots). Fixed both files to `tip-tracker`.
4. Verified before committing: `npx tsc --noEmit` (clean), `npx expo-doctor`
   (20/20 checks), and `CI=1 npx expo start` to confirm Metro actually
   bundles and serves on `localhost:8081` rather than just trusting the
   generated files looked right.

`node_modules/` is not committed — regenerate it with `npm install`.

## `38c8579` — docs: add BUILD_LOG.md, a commit-by-commit recreation log (2026-07-30)

This file. Backfilled entries for all 18 commits up to and including
`477c0e5b` by reading each commit's actual diff, not just its message. Added
check 8 to `check-docs.sh`, a copy of the existing `BRAINSTORM.md` staleness
check (warns if other files are staged while this file's `Last updated` date
isn't today), and tested it the same way every check in this repo gets
tested: set the date back on purpose, confirmed the warning fired, then set
it back before committing. Added a one-line pointer to this file in
`README.md`'s repo layout section.

## `ca02120` — docs: mark Expo scaffold and BUILD_LOG.md done, point NEXT at expo-sqlite (2026-07-30)

Caught immediately after the previous two commits: `BRAINSTORM.md`'s Order of
Operations still listed the Expo scaffold as `NEXT` even though it had
already shipped in `477c0e5b`, and the `BUILD_LOG.md` work itself hadn't been
logged there either. Marked both done and moved `NEXT` to wiring `schema.sql`
into `expo-sqlite` — the cold-agent handoff protocol in `CLAUDE.md` exists
specifically so this doesn't get missed at the end of a session.

## `8a13147` — feat: wire schema.sql into expo-sqlite (2026-07-30)

To recreate:

1. `npx expo install expo-sqlite expo-asset expo-file-system` — installs the
   SDK-compatible versions and registers the config plugins in `app.json`
   automatically.
2. Add `metro.config.js` with `config.resolver.assetExts.push('sql')`, so
   Metro treats `schema.sql` as a bundled asset instead of trying to parse it
   as JavaScript when it's `require`'d.
3. Write `db.ts`: `SQLite.openDatabaseAsync('tip-tracker.db')`, then
   `db.execAsync('PRAGMA foreign_keys = ON;')` — SQLite ignores foreign keys
   by default, per connection, not something saved in the database file
   itself; `schema.sql`'s own header comment already flags this.
4. Read `PRAGMA user_version` (defaults to `0`) to decide whether
   `schema.sql` has already been run against this database file. If not:
   load it via `Asset.fromModule(require('./schema.sql')).downloadAsync()`
   then `new File(asset.localUri).text()`, run it with `db.execAsync`, and
   set `PRAGMA user_version = 1`. The version guard exists because
   `schema.sql` has no `IF NOT EXISTS` on purpose, to keep it byte-identical
   to what `scripts/test-schema.sh` loads — so running it twice against the
   same file would throw on the second app launch without this guard.
5. `db.ts` caches the open connection in a module-level promise (`getDb()`),
   so every caller awaits the same connection instead of racing to open a
   second one — a second connection would need its own `PRAGMA foreign_keys`
   call, since that setting doesn't carry over.
6. Temporarily wired `App.tsx` to call `getDb()` on mount and render
   "database ready" or the error message, purely to prove the chain works
   end to end. Intended to be replaced once a real screen exists.

Verified with `tsc --noEmit` and `CI=1 npx expo start` followed by fetching
`http://localhost:8081/index.bundle?platform=android&dev=true` directly —
confirms Metro resolves every import and bundles cleanly (789 modules).

That bundling check doesn't prove the native SQLite calls actually run, and no
Android/iOS tooling was available in the agent's environment to check further.
Confirmed for real afterward on a physical iPhone: `App.tsx` rendered
"database ready", meaning `openDatabaseAsync`, both `PRAGMA` calls, the
`schema.sql` asset load, and `execAsync` against it all ran successfully on
device.

Getting Expo Go onto the phone needed its own detour, worth knowing about if
this happens again: the App Store's Expo Go build lags Expo's SDK releases by
Apple's review time, and was still stuck on SDK 54 while this project is on
SDK 57 — a real, current gap, not a local misconfiguration (Expo's own
changelogs confirm newer builds sit in App Store review for weeks). Fixed with
`npx eas-cli@latest go`, which builds a custom Expo Go matched to this
project's SDK and ships it to a personal TestFlight team under the Apple
Developer account being used. Requires an Apple Developer Program membership;
the App Store Connect API key EAS generates for this needs the **Admin**
role specifically, not the more restricted App Manager role — Apple only
exposes certificate/provisioning-profile management (which EAS needs to sign
the build) to Admin over the API.

## `1235eaf` — feat: add jobs data-access functions (2026-07-30)

First piece of the data-access layer sitting on top of `db.ts`. No server
backend exists for MVP (D1), so this file — plain functions wrapping SQL —
is the closest thing to a "backend" this app has, and it's what a screen
actually calls, not `db.ts` directly.

To recreate:

1. `npx expo install expo-crypto` — first-party module for
   `Crypto.randomUUID()`, needed because `schema.sql` uses text UUIDs as
   primary keys (D1: two devices independently picking row ids would
   collide once sync exists) and React Native doesn't reliably have
   `crypto.randomUUID()` built into its JS environment.
2. `createJob(name, hourlyRateCents)`: generates a UUID, stamps
   `created_at`/`updated_at` with the same `new Date().toISOString()` value,
   and inserts with `db.runAsync` using `?` placeholders — never string-
   splice values into the SQL, that's the direct path to SQL injection.
   `archived_at` is explicitly `NULL` on insert.
3. `listActiveJobs()`: reads with `db.getAllAsync<Job>(...)` instead of
   `runAsync` — the read/write split in `expo-sqlite`'s API is real,
   `runAsync` returns a write summary, not rows. Filters
   `WHERE archived_at IS NULL`, the D3 rule for excluding archived jobs from
   anything a user picks from.
4. Rows come back typed via a `Job` type matching `schema.sql`'s columns
   verbatim, snake_case included — no camelCase mapping layer added, since
   nothing needs one yet.

Verified with `tsc --noEmit`. Not yet wired into any screen, so nothing to
bundle-check or run on device for this commit specifically.

## `bec551a` — feat: add shifts data-access functions (2026-07-30)

Second and last piece of the data-access layer before any screen gets built.
Same pattern as `jobs.ts`, adapted for `shifts`' extra columns and its
foreign key.

To recreate:

1. `createShift(jobId, shiftDate, minutes, tipsCents, hourlyRateCents, note)`:
   same UUID/timestamp/`runAsync`-with-placeholders shape as `createJob`.
   `hourlyRateCents` is a required argument, not looked up from the job
   inside the function — `schema.sql`'s own comment is explicit that this
   column is a copy of the job's rate at the moment of the shift, not a live
   reference, so a raise later can't rewrite what a past shift actually
   paid. The caller (the log-a-shift screen) decides the value: default it
   to the job's current rate, let the user override it for a special shift.
   `deleted_at` is explicitly `NULL` on insert.
2. `listShifts()`: `db.getAllAsync<Shift>(...)`, filtered
   `WHERE deleted_at IS NULL` (the D4 tombstone rule), ordered by
   `shift_date DESC` — most recent first, the natural order for a scrolling
   list. Takes no filter arguments and returns every shift; the dataset is a
   few thousand rows at most for MVP, so there's no performance reason to
   push filtering into SQL before a screen actually needs a narrower query.

Verified with `tsc --noEmit`. Not yet wired into any screen.

## `828dc0a` — feat: add CreateJobForm component (2026-07-30)

First React Native UI written in this project. To recreate:

1. `useState('')` for each field (`name`, `hourlyRate`) — a controlled
   `TextInput`, where `value` comes from state and `onChangeText` writes
   back to it, rather than letting the input hold its own text.
2. On submit: `parseFloat` the rate (not `Number()` — `Number('')` is `0`,
   which looks like a valid rate; `parseFloat('')` is `NaN`, easier to catch
   as "nothing typed yet"), bail out on empty name or a negative/NaN rate,
   convert dollars to cents with `Math.round(rate * 100)` — not a bare
   multiply, `19.9 * 100` in JS is `1989.9999999999998`, not `1990`.
3. Call `createJob(name, hourlyRateCents)`, clear the form, call the
   `onJobCreated` callback prop so the parent knows a job now exists.
4. Styled with `StyleSheet.create` — plain JS objects, no CSS, flexbox by
   default on every `View`.

Not wired into `App.tsx` yet at this point.

## `45f7ead` — feat: add LogShiftForm component (2026-07-30)

Same shape as `CreateJobForm`, more fields. To recreate:

1. Six pieces of state: `selectedJobId`, `shiftDate` (defaults to
   `new Date().toISOString().slice(0, 10)` — date-only, matching
   `schema.sql`'s convention), `hours`, `tips`, `hourlyRate` (defaults to the
   first job's rate), `note`.
2. Job selection as a row of tappable `Pressable` "chips," one per job, not
   a native `Picker` — avoids adding `@react-native-picker/picker` for a
   handful of options. Selecting a job also resets `hourlyRate` to that
   job's rate, still editable after — the "inherited but overridable" rate
   behavior from `BRAINSTORM.md`'s MVP scope.
3. On submit: same validation/rounding shape as `CreateJobForm`, plus
   `Math.round(hoursValue * 60)` for minutes. Calls
   `createShift(jobId, shiftDate, minutes, tipsCents, hourlyRateCents, note)`,
   resets the per-shift fields but leaves the job selected, calls
   `onShiftLogged`.

Known gap, left in on purpose: `selectedJobId` and the default `hourlyRate`
are seeded from the `jobs` prop inside `useState(...)` initializers, which
only run once at mount — if the `jobs` array changed while this component
stayed mounted, they wouldn't update. Currently harmless because `App.tsx`
only renders this form once at least one job exists.

## `659488f` — feat: wire up the log-a-shift screen (2026-07-30)

Ties `CreateJobForm`, `LogShiftForm`, and a new `ShiftList` component
together in `App.tsx`. To recreate:

1. `App.tsx` holds `jobs` and `shifts` in state, plus a `loading` flag.
   `refresh()` — wrapped in `useCallback` — awaits `getDb()` (makes sure
   `schema.sql` has run), then `Promise.all([listActiveJobs(), listShifts()])`,
   and sets both. Called once via `useEffect(() => { refresh(); }, [refresh])`
   on mount, and passed down as the `onJobCreated`/`onShiftLogged` callback
   to both forms — SQLite doesn't push updates to the app, so re-querying
   after every write is how the UI notices anything changed.
2. Renders `CreateJobForm` when `jobs.length === 0` (a shift's `job_id` is
   `NOT NULL` with a foreign key, so logging one is impossible without a
   job first), otherwise `LogShiftForm` plus `ShiftList`.
3. `ShiftList`: a `FlatList` over `shifts` (only renders rows currently on
   screen, not the whole array — matters once there are years of shift
   history), looks up each shift's job name via a `Map` built from `jobs`
   (shifts only store `job_id`), and shows an empty state for zero shifts.
4. Removes the temporary "database ready" text from `App.tsx` — the real
   screen supersedes that proof-of-wiring code from the `expo-sqlite`
   commit.

Verified with `tsc --noEmit` and `CI=1 npx expo start` followed by fetching
`http://localhost:8081/index.bundle?platform=android&dev=true` against a
freshly started Metro instance (killed a leftover process squatting on the
port first) — 750 modules, no resolution errors.

Confirmed for real afterward on a physical device: created a job, logged
several shifts, all appeared correctly in the list. First time this app has
been used the way an actual user would, not just bundled or typechecked.

Layer 0 still isn't complete against `BRAINSTORM.md`'s own MVP scope, even
though the core loop works — "edit and delete" shifts and gross totals are
both still missing. `shifts.ts` has no `updateShift`/`deleteShift` yet; the
`deleted_at` tombstone column has existed since D4 but nothing writes to it.
