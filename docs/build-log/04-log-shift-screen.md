# Build log — the log-a-shift screen

Part of the [build log](README.md). Numbered by phase because this is the
one place chronology is the content.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, [../product.md](../product.md)
for product scope.

Covers: `CreateJobForm`, `LogShiftForm`, `ShiftList`, and the `App.tsx`
wiring that ties them together — the first hand-written React Native UI in
this project, plus delete (soft-delete tombstone, confirmation dialog) and
edit (form reuse, the `key`-based remount fix for stale `useState`
initializers).

---

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

## `66f3edb` — feat: add deleteShift function (2026-07-30)

`deleteShift(id: string): Promise<void>` in `shifts.ts`. An `UPDATE`, not a
`DELETE` — sets `deleted_at` and `updated_at` to `now`, `WHERE id = ?`. Soft
delete per D4: the row has to stay so a second device, once sync exists,
has something to receive saying "this one's gone" — a row that's truly
removed is invisible to a device that never saw it, so it would just
reappear on the next sync. Verified with `tsc --noEmit`.

## `5f1aa13` — feat: add delete action to ShiftList, with confirmation (2026-07-30)

To recreate:

1. `ShiftList.tsx` gets a `Pressable` "Delete" per row, next to the
   existing job/date/detail text (row layout switched to
   `flexDirection: 'row'` with the text wrapped in a `flex: 1` view so the
   button sits at the end).
2. Tapping it calls `Alert.alert(...)` — React Native's built-in native
   confirmation dialog, no extra dependency — with a Cancel and a
   destructive-styled Delete option. Only the Delete option's `onPress`
   actually calls `deleteShift(shift.id)` and then a new `onShiftDeleted`
   callback prop. Confirmation matters here because delete reads as
   permanent from the user's side even though it's a soft delete under the
   hood — they don't know or care that the row technically still exists,
   so a stray tap shouldn't be able to lose a shift with nothing to undo it.
3. `App.tsx` passes `onShiftDeleted={refresh}` into `ShiftList`, same
   pattern as the other two callbacks.

Shipped as one commit rather than split further: `ShiftList` was already
wired into `App.tsx` from the previous milestone, so making
`onShiftDeleted` a required prop broke that call site immediately.
`CreateJobForm` and `LogShiftForm` earlier could be committed standalone
because they were dead code (unimported) until wired in on purpose — this
change had no such working intermediate state, so splitting it would have
meant a commit that doesn't typecheck.

Verified with `tsc --noEmit` and `CI=1 npx expo start` against a freshly
started Metro instance — 801 modules, no resolution errors.

Confirmed for real afterward on a physical device: logged a shift, tapped
Delete, confirmation prompt showed, shift disappeared from the list after
confirming.

## `87d34f4` — feat: add updateShift function (2026-07-30)

`updateShift(id, jobId, shiftDate, minutes, tipsCents, hourlyRateCents, note)`
in `shifts.ts`. Same columns as `createShift`'s `INSERT`, minus
`id`/`deleted_at`/`created_at` — an `UPDATE ... WHERE id = ?` instead.
`created_at` stays untouched on purpose (records when the row was first
made, not last edited); `updated_at` moves to `now`, same reasoning as
`deleteShift`. Verified with `tsc --noEmit`.

## `4fb58d1` — feat: add edit mode to the log-a-shift screen (2026-07-30)

To recreate:

1. `LogShiftForm` gets an optional `editingShift?: Shift | null` prop.
   Every `useState` initializer reads from it when present (job, date,
   hours, tips, rate, note) instead of the create-mode defaults. Submitting
   branches: `updateShift(editingShift.id, ...)` if editing,
   `createShift(...)` otherwise. The onScreen callback got renamed from
   `onShiftLogged` to `onShiftSaved` since it now covers both paths. Added
   `onCancelEdit` and a Cancel button, rendered only while editing.
2. `ShiftList`'s text/detail column became its own `Pressable`
   (`onShiftPress`), kept as a sibling of the Delete button rather than
   wrapping it — avoids any ambiguity about which handler fires on a
   Delete tap.
3. `App.tsx` holds `editingShift: Shift | null` state. `ShiftList`'s new
   `onShiftPress` sets it; `LogShiftForm`'s `onShiftSaved`/`onCancelEdit`
   both clear it back to `null`.
4. The fix for a gap flagged when `LogShiftForm` was first built:
   `useState` initializers only run once at mount, so if this component
   just took `editingShift` as a normal prop, switching from editing shift
   A to shift B without submitting wouldn't update the fields — the second
   shift's prop would arrive, but nothing would re-run the initializers
   against it. Fixed with `key={editingShift?.id ?? 'new'}` on
   `<LogShiftForm>` in `App.tsx`: giving it a different `key` for each
   shift (or "new") makes React tear down and remount the component fresh
   instead of reusing the same instance with a prop that silently changed
   underneath it — React's own recommended fix for "reset state when a
   prop changes," ahead of the alternative of syncing state with a
   `useEffect`.

Shipped as one commit: `LogShiftForm`'s renamed callback and `ShiftList`'s
new required prop both break `App.tsx`'s existing call sites immediately,
so there was no working intermediate state to split further — same
reasoning as the earlier delete commit.

Verified with `tsc --noEmit` and `CI=1 npx expo start` against a freshly
started Metro instance — 801 modules, no resolution errors.

Confirmed for real afterward on a physical device: tapped a shift, it opened
pre-filled, changed a value, saved, the list updated correctly; Cancel also
confirmed working. Create, list, edit, and delete are all now verified
working for real — the full CRUD loop for shifts is done and proven on
device, closing out Layer 0's functional scope short of gross totals.

## `eddea26` / `75b64d7` — docs: log edit-shift work and split BUILD_LOG.md by month, then by phase (2026-07-30)

Logging `updateShift` and the edit-mode/`key`-remount work pushed
`BUILD_LOG.md` to 549 lines, past the ~500 line split threshold
`check-docs.sh` warns about. Archived the entries into
`docs/build-log/2026-07.md`, same rule as the `docs/brainstorm/` Q&A
archive. That file immediately passed ~500 lines itself, the same day it
was created — same thing that happened to the Q&A archive on its creation
day too — so it split again, this time by phase, into the four files this
entry lives in one of.

## `5d9d403` — fix: correct stale comments in app code (2026-07-30)

Found during an end-of-session staleness audit (re-reading every doc and
every code comment end to end, not just the files touched that session):
`schema.sql`'s header still claimed it wasn't wired into an app, `shifts.ts`
called the log-a-shift screen "eventually" after it had existed for two
sessions, and `App.tsx`'s `refresh()` comment only mentioned being called
"after every create" when it's also called after edit and delete.

## `f40dcf9` — docs: end-of-session staleness audit (2026-07-30)

The rest of that same audit pass. Confirmed edit verified on device (see
above) and moved `NEXT` to gross totals. Added two Q&A entries that had
only ever existed as Order of Operations narrative, not in the dedicated
archive the project's own rules say they belong in: "what would a real
engineer do about component files" and "I've never handwritten any of
this." Fixed real staleness: README's Status section still described a
pre-UI state; `BRAINSTORM.md`'s Round 3 (data model) was labeled
"(current)" despite every question in it being answered and implemented
for a while; the Apple Developer Program housekeeping item was still
listed outstanding after actually getting set up for `eas go` this session;
`BRAINSTORM.md`'s companion-docs list never mentioned `BUILD_LOG.md`.

Also split `BRAINSTORM.md`'s Order of Operations section out to
`docs/brainstorm/order-of-operations-2026-07.md`, once logging this
session's work pushed *that* file past 500 lines too — the same growth
pattern the Q&A archive and `BUILD_LOG.md` both already hit, now hitting a
third file for the same underlying reason (append-only sections in active
use grow without limit). Adapted the pattern slightly: unlike the other
archives, the most recent entries and the `NEXT:` line stay inline in
`BRAINSTORM.md` rather than moving out entirely, since the cold-agent
handoff protocol needs `NEXT:` visible without a click-through.

Also updated `CLAUDE.md` (gitignored, not shown in `git log`, so noted
here for anyone reading this file to recreate the project's *process*, not
just its code): added `BUILD_LOG.md` to the full read order and the
per-commit documentation rules, since it existed for several sessions
without either. Fixed a scope-discipline line that still said "shift
logging and viewing only," undercounting the edit/delete work already
built.
