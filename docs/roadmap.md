# Roadmap

Where this project is, what's next, and everything done so far in order.
This is the file to open first, every session.

Last updated: 2026-07-31

---

## NEXT

**Define what every Trends number means.** Navigation is Expo Router (D7),
aggregation is pure TypeScript (D8), and exact values plus native weekday bars
need no chart dependency (D9). One semantic decision remains before building:

1. Does Trends default to all jobs or one job, and can the user switch?
2. Is tips per hour `total tips / total hours` rather than an average of each
   shift's individual rate?
3. Does the weekday comparison show tips per hour, gross per hour, or both?
4. Which sample context appears beside a result—shift count, total hours, or
   both—so one unusual shift does not look like a reliable trend?
5. Are month and year summaries calendar periods, and which totals do they
   show?

Write the formulas and scope as the next decision before installing Expo Router
or building the screen. A polished visualization cannot rescue an undefined
metric.

One smaller thing already logged under Open Questions below and worth folding
into this pass: whether each shift row should show its own gross.

---

## How this file works

The history below is append-only. Each entry is one session's worth of work,
summarized — not the command-level detail, which is
[build-log/](build-log/)'s job, and not the reasoning behind a choice, which is
[decisions.md](decisions.md)'s.

Before ending a session: add an entry, rewrite the `NEXT` section above, update
the `Last updated` date. That update is what the next cold agent reads.

---

## Settled stack

Reasons live in [decisions.md](decisions.md). Don't re-litigate without a new
reason.

- **Language:** TypeScript
- **UI:** React via React Native
- **Framework/tooling:** Expo (D2)
- **Storage:** SQLite on device via `expo-sqlite` (D1)
- **Backend:** none for MVP. Node + Express + Postgres later, sign-in
  optional (D1)

---

## Open questions

**Where does the tax logic live?** With no backend, it runs on-device. That
means tax rules ship inside app versions, and updating rates for a new tax year
requires an app store release. Needs an answer before Layer 2.

**Should each shift row show its own gross?** Raised 2026-07-30 while writing
D5. The totals row claims a number the list underneath can't currently be used
to verify, because rows show hours, tips, and rate but not their own gross.
D5's correctness argument doesn't depend on this, but the feature would make
the total checkable at a glance. Deliberately not built as part of Layer 0.

**Exactly when does cloud backup and sync ship?** D1 settles the architecture:
optional accounts, an API, and Postgres while every device keeps SQLite.
The remaining product decision is placement. Current direction is after
Trends and before strangers are asked to trust the app with years of income
history; decide whether that becomes Layer 1.5 or part of Layer 2 after the
Trends scope is complete.

---

## Housekeeping before submission

- Apple Developer Program: $99/year — **done**, membership already active (used
  2026-07-30 to build a custom Expo Go via `eas go` for device testing, see
  [learning/tooling.md](learning/tooling.md)). Google Play: $25 one-time, still
  outstanding. Apple review takes days and can reject.
- A public app needs a privacy policy URL even if it stores nothing remotely.
- App name availability on both stores. "Tip Tracker" is likely taken.

---

## History

1. Created directory `tip-tracker`
2. Created `README.md`
3. `git init`, first commit, pushed to GitHub
4. Created the brainstorm log — the ancestor of this file
5. Defined the problem, the differentiators, and what's out of scope
6. Split the feature set into MVP + three later layers
7. Decided architecture: local-first, SQLite on device, sync added later (D1)
8. Decided platform: Expo (React Native, TypeScript) (D2)
9. Data model written as `schema.sql` — `jobs` and `shifts`, checked by hand
   against sqlite3
10. Split the decision log out into its own file once the brainstorm passed 750
    lines, and added `scripts/check-docs.sh` plus a git pre-commit hook to stop
    docs rotting
11. First code review of the repo. `check-docs.sh` turned out to print FAIL and
    exit 0, so nothing it found had ever blocked a commit; `schema.sql` still
    cited D1 in the wrong file; and the claim that constraints were tested had
    no tests behind it. Fixed all three, added `scripts/test-schema.sh`, gave
    shifts a tombstone (D4), rewrote `README.md`, archived the Q&A log
12. Installed `sqlite3` and DB Browser for SQLite (both via `winget`), since
    `test-schema.sh` had been silently skipping on that machine the whole time
    (`WARN sqlite3 not installed`). Verified the suite actually catches a broken
    constraint by loosening a `CHECK` and watching it fail, not just trusting
    the 19-checks-passed output. Found `core.hooksPath` wasn't actually set
    despite being documented as done, and re-ran it. Split the Q&A archive
    again, this time by purpose
13. Built a cold-agent handoff system, since `CLAUDE.md`'s old "Start here"
    section (status + next task, restated) had already drifted from the real
    Order of Operations once. Thinned `CLAUDE.md` down to a pointer instead of
    a second copy, added an explicit handoff protocol, and taught
    `check-docs.sh` two new warnings: `core.hooksPath` not set to `.githooks`,
    and a status log's `Last updated` date going stale while other work is
    committed. Both verified by triggering them on purpose before trusting them
14. Scaffolded the Expo app. `create-expo-app` refuses a non-empty directory,
    so it ran into a throwaway subdirectory and the result got moved up by hand
    instead. That meant `app.json`'s `name`/`slug` and `package.json`'s `name`
    came out as the throwaway directory's name — caught by `expo-doctor`, fixed
    to `tip-tracker`. Kept the project's real `CLAUDE.md` over Expo's generated
    stub, and merged Expo's `.gitignore` rules into the existing file rather
    than overwriting it. Verified with `tsc --noEmit`, `expo-doctor` (20/20),
    and an actual `CI=1 expo start` bundling and serving before committing
15. Added the build log: commit-by-commit, detailed enough to recreate the repo
    from scratch, separate from the decision log (why) and this file (what's
    next). Backfilled all 18 commits so far. Gave it the same staleness check
    `check-docs.sh` already ran against this file's `Last updated` date,
    verified by breaking it on purpose first
16. Wired `schema.sql` into `expo-sqlite` (`db.ts`). Opens the connection,
    turns on `PRAGMA foreign_keys = ON`, then runs `schema.sql` — shipped as a
    bundled asset via `metro.config.js` rather than duplicated as a JS string,
    so `db.ts` and `test-schema.sh` always run the same source of truth.
    Guarded against re-running the `CREATE TABLE` statements on every launch
    with `PRAGMA user_version`, since `schema.sql` deliberately has no
    `IF NOT EXISTS`. Confirmed working on a physical iPhone. Getting there
    needed a detour: the App Store's Expo Go build was still on SDK 54 while
    this project is on SDK 57 (Apple's review lag on Expo Go itself, a real and
    current gap, not a local issue). Fixed with `npx eas-cli@latest go`, which
    builds a custom Expo Go matched to our SDK and ships it via a personal
    TestFlight team — needs an Apple Developer Program membership, and the App
    Store Connect API key it generates needs the **Admin** role, not App
    Manager, since only Admin can manage the certificates EAS needs to sign
17. Revisited "screen sketches next" before starting it: this app has no server
    backend at all in MVP (D1), so "build the backend first" doesn't apply the
    normal way. What a screen actually needs first is a small data-access layer
    — plain functions wrapping SQL. Reordered to: data-access functions per
    table, then the screen that calls them, one vertical slice at a time
18. Wrote `jobs.ts`: `createJob` and `listActiveJobs`, using `expo-crypto`'s
    `Crypto.randomUUID()` for ids. First pass at `listActiveJobs` copied
    `createJob` almost verbatim instead of adapting it — still an `INSERT`,
    still generating a new id and timestamp. Rewritten to actually read:
    `db.getAllAsync<Job>(...)` instead of `db.runAsync(...)`, filtering
    `archived_at IS NULL` per D3. Verified with `tsc --noEmit`
19. Wrote `shifts.ts`: `createShift` and `listShifts`, same pattern.
    `hourlyRateCents` is a required argument rather than looked up from the job
    inside the function — `schema.sql` is explicit that the column copies the
    job's rate at the moment of the shift, not a live reference. `listShifts`
    takes no filter arguments for now and leaves grouping to the caller
20. Built the log-a-shift screen — first real UI in the app, and the first time
    writing React/React Native by hand this project. `CreateJobForm` built as a
    fully worked example (never done this before, so nudging would've wasted
    time — a full annotated example was the right call, same reasoning as the
    earlier `db.ts` moment). `LogShiftForm` and the `App.tsx` wiring built the
    same way after that. `ShiftList` added alongside, since MVP Layer 0 needs
    "see a list of past shifts," not just log one. Concepts worth revisiting:
    `useState` initializers only run once at mount, and controlled inputs /
    callback props as the two-way data flow between a form and its parent
21. Confirmed the log-a-shift screen for real on a physical device: created a
    job, logged several shifts, all showed up correctly in the list. First time
    anything in this app has been exercised as an actual user would
22. Added delete: `deleteShift(id)` as an `UPDATE` setting the D4 tombstone
    rather than a real `DELETE`. `ShiftList` got a Delete button per row behind
    a native confirmation (`Alert.alert`, no new dependency) — destructive from
    the user's point of view even though it's soft under the hood. Shipped as
    two commits, not three: the data-access function stood alone fine, but
    `ShiftList`'s new required `onShiftDeleted` prop broke `App.tsx`'s existing
    call site immediately, so there was no working intermediate state to split
23. Confirmed delete on a physical device: logged a shift, tapped Delete,
    confirmation prompt showed, shift disappeared after confirming
24. Added edit: `updateShift` mirroring `createShift` as an `UPDATE`.
    `LogShiftForm` reused rather than duplicated — takes an optional
    `editingShift` prop, pre-fills from it, gets a Cancel button while editing.
    Resolved the gap flagged at step 20: `useState` initializers only run once
    at mount, so switching from editing shift A to shift B wouldn't update the
    fields — fixed with a `key` tied to `editingShift?.id ?? 'new'`, React's
    standard fix (force a remount) rather than syncing state with a `useEffect`
25. Confirmed edit on a physical device. Create, list, edit, and delete are all
    verified working for real — the full CRUD loop for shifts is proven
26. Verified the whole toolchain on a new machine (moved from a Windows desktop
    to a MacBook): hooks path, `expo-doctor` 20/20, `tsc`, both check scripts,
    Metro bundling for iOS and Android, push credentials. Everything passed
    with no fixes needed. Worth knowing what's *not* installed rather than
    rediscovering it: no full Xcode (Command Line Tools only, so no iOS
    simulator — `npm run ios` won't work), no Android SDK, no watchman. Expo Go
    on a physical device is unaffected and is how this project gets tested
    anyway. Node is v26.5.0, newer than Expo SDK 57 was tested against — it
    bundles clean, but it's the first thing to suspect if Metro ever throws
    something nonsensical
27. Gross totals, which completes MVP Layer 0's own scope. `totals.ts` is the
    first pure-calculation module in the project — no SQLite, no async, no
    React — which is what lets `totals.test.ts` run the money math on Node with
    no device and no database. That test uses no framework at all: Node runs
    TypeScript directly and `node:assert/strict` is standard library, so it
    costs zero dependencies. Wired into the pre-commit hook, then broken on
    purpose to prove it fails. D5 is the real decision — wages round per shift,
    not once per total. `format.ts` came out of the same work once a third
    place formatting cents appeared. Concepts worth revisiting: `reduce` as a
    `for` loop with the bookkeeping removed (its starting value is what makes
    an empty array return zeros instead of crashing), and `import type` as a
    real runtime distinction rather than a style choice — it's what keeps
    `totals.ts` loadable outside the app
28. Restructured the repo. Application code moved into `src/` with three
    folders that name the architecture boundary the project already argued for
    — `components/` renders, `data/` persists, `lib/` computes with no I/O.
    Docs reorganized by the question each one answers, and dates dropped from
    filenames everywhere except the build log, where chronology is the content.
    The old `YYYY-MM-topic.md` scheme had quietly reintroduced the exact
    problem the no-numbered-sequels rule exists to prevent: finding the Expo
    question would have meant remembering which month it was asked in. Also
    replaced the hard 500-line split threshold with a 250-line review prompt,
    since length was only ever a proxy for "is this still one topic?"
29. Confirmed gross totals on a physical iPhone, using three shifts chosen to
    break a wrong implementation: `8.6h`, `$42.75`, `$175.31`, exactly as
    predicted. `Intl.NumberFormat` works on Hermes, so the `toFixed` fallback
    isn't needed. Layer 0's feature set is complete and verified end to end.
    The same session surfaced four defects, listed in `NEXT` above. The
    important one is that shifts were logging against the UTC calendar day
    rather than the local one — a correctness bug that no amount of bundling
    or unit testing was going to catch, because it only shows up when a real
    person looks at a real screen late at night. Worth remembering as an
    argument for on-device testing every step, which this project already does
30. Fixed all four, one commit each. The date bug moved its arithmetic into
    `lib/dates.ts` so it could be tested at all — the function now takes a
    `Date` instead of reading the clock, and the tests build every `Date` with
    the local-time constructor so they hold in any timezone. The edit-form
    numbers got D6 and a test that walks all 1440 durations in a day checking
    each one converts back to the same stored minutes; the tempting fix of
    matching the list's `7.6h` fails that test on the first iteration by
    turning a one-minute shift into zero. The layout and keyboard fixes are
    one change in two commits: handing the form to `ShiftList` as its header
    makes the screen a single scroller, and only then do
    `keyboardShouldPersistTaps` and `keyboardDismissMode` have anything to act
    on. Concepts worth revisiting: `toISOString()` is always UTC and is almost
    never what a calendar-day question wants, and `ListHeaderComponent` must
    be handed an element rather than a function, or React remounts the header
    on every render and the keyboard closes on every keystroke
31. Confirmed all four fixes on a physical device: the date defaults to the
    local day, the edit form shows `7.58` and `15.50`, saving an untouched
    shift leaves the list and totals unchanged (the D6 round-trip holding in
    practice, not just in a test), the screen scrolls as one surface, and the
    keyboard dismisses on a tap away and on a drag. **Layer 0 is done** —
    every feature in its scope is built, tested, and verified on real
    hardware. The four defects it took a device to find are the argument for
    keeping that habit through Layer 1
32. End-of-session audit. Logged the three questions from this session that had
    been answered in conversation but never written down — the doc-structure
    and root-layout complaint, how to weigh two options when neither is
    obvious, and how usability defects sort against features. All three are in
    [learning/docs-and-process.md](learning/docs-and-process.md). Fixed the
    last stale reference in `check-docs.sh`, whose comment still used a
    directory the restructure deleted, and added a note to
    [learning/README.md](learning/README.md) explaining that Q&A entries name
    files as they were named on the day they were asked, pointing at the rename
    table in the build log rather than rewriting history. Note that this
    session ran past midnight: entries dated 2026-07-30 and 2026-07-31 are the
    same sitting
