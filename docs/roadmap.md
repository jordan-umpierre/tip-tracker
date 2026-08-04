# Roadmap

Where this project is, what's next, and everything done so far in order.
This is the file to open first, every session.

Last updated: 2026-08-03

---

## NEXT

**Confirm the Layer 2 money contract, then implement overtime before taxes.**

1. Confirm D14's first overtime slice: opt-in per job, a configured fixed
   workweek, 40-hour threshold, 1.5x base wage, and an explicit estimate label.
   Decide whether a weekday-at-midnight boundary is sufficient or shift times
   must be stored before the feature can claim accuracy.
2. Confirm the first tax slice: opt-in 2026 federal W2 estimates using filing
   status, pay frequency, W-4 inputs, other income/adjustments, and actual
   withholding. Do not substitute one flat percentage; state/local, 1099, and
   tipped-credit edge cases remain explicit later scope.
3. Run the CSV import plus the complete dashboard revision on a physical
   iPhone, including the YTD range, the new date-range window labels, and the
   weekday bars at their widest shift counts. Android now passes the graph
   ranges and scrub interaction, chart
   vertical scrolling, lower Log management controls, concealed swipe-delete,
   long-press/accessibility delete paths, and native confirmation. The iOS
   bundle passes, but that is not a VoiceOver or gesture claim.
4. Place user-controlled export and optional cloud backup/sync before public
   tax projections. Years of local income history need a recovery story before
   net estimates increase the data's value.

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
- **Navigation:** Expo Router with native peer tabs (D7, D11)
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
33. Finished the Layer 1 design boundary before implementation. D7 chooses
    Expo Router at the second screen, D8 keeps aggregation in pure TypeScript,
    D9 keeps exact values beside one bounded native weekday comparison, and D10
    defines the actual product semantics: one all-jobs-or-single-job scope,
    time-weighted rates, gross per hour by weekday, visible sample context,
    calendar month/year totals, and no-data values that stay distinct from
    zero. `NEXT` now starts with tested arithmetic rather than UI
34. Built the Layer 1 arithmetic before its screen. Extracted D5's per-shift
    gross calculation for reuse, then added one pure Trends pass with all-jobs
    or one-job scope, weighted headline and weekday rates, calendar month/year
    totals, strict date grouping, and 18 dependency-free checks. The work
    exposed an older input-boundary gap: the form can still save a malformed
    date, so `NEXT` closes that before routing or UI
35. Closed that input boundary before exposing Trends. One strict calendar
    parser now serves the form and aggregation code, impossible dates and
    malformed numbers produce visible native alerts, and date coverage grew
    from 5 to 11 checks. Rechecked the SDK 57 Router and native-tabs references;
    `NEXT` now asks only which Router shell and refresh boundary fit this app
36. Chose the concrete Layer 1 route boundary in D11. Log and Trends are static
    native peer tabs; route files stay thin; screens own focused SQLite reads;
    no Context, external store, custom tab bar, or empty nested stack is added.
    The old app-root wiring would become `LogScreen.tsx` once Router owned entry
37. Implemented Layer 1's route and UI boundary. Expo Router now owns the app
    entry, Log and Trends are native peer tabs, and both screens refresh their
    own SQLite snapshot on focus. Trends renders D10's tested all-history
    summaries with exact text and D9's dependency-free weekday bars. Corrected
    Router's transitive React DOM peer from 19.2.8 to Expo SDK 57's 19.2.3;
    npm's dependency tree and Expo's online compatibility check now pass. The
    tracked checks, TypeScript, and fresh iOS and Android exports pass. Physical
    iPhone validation remains the next gate, so Layer 1 is implemented but not
    yet claimed as device-verified
38. Closed the final generated-config and learning-log gaps during the handoff
    audit. Expo Router's first typed-route generation added the required hidden
    route types to `tsconfig.json`; preserved that SDK 57 requirement while
    restoring the explanatory comments its JSON rewrite removed. Also logged
    the previously missed question about continuing a Claude session in VS
    Code with Codex. The tracked checks and TypeScript pass, and `NEXT` remains
    the physical iPhone verification rather than expanding scope
39. Completed the first Layer 1 physical-iPhone pass. The calculations looked
    correct, while real use exposed low-contrast sample text, the missing path
    to create job two, an unsatisfying tips-per-hour headline, and a preference
    for vertical weekday bars. The last report originally cut off after
    `exep`; the user clarified that they meant user experience before the chart
    direction changed. Fixed each concern as a separate verified and pushed
    commit: `d9341fa` corrects card contrast, `02a7120` reuses the existing job
    form after job one, `4714516` makes time-weighted gross per hour the tested
    headline, and `ac65e6a` turns the dependency-free weekday comparison
    vertical while retaining exact values and sample context. Revised D9 and
    D10 rather than erasing their original reasoning. TypeScript, all tracked
    checks, the 18 Trends checks, and fresh iOS and Android exports pass. A
    browser preview was not applicable because this mobile checkout omits
    `react-native-web`; no test-only dependency was added. The four corrections
    still need their physical-iPhone recheck, and Android remains bundle-only
40. Ran the explicit freshness and cold-agent handoff audit. Refreshed the
    GitHub remote, confirmed no stashes or uncommitted work, and found one real
    stale implementation/comment pair: `CreateJobForm` still described itself
    as a first pass and silently ignored invalid input. Commit `0b5b8aa` now
    uses the same strict number parsing and visible native-alert behavior as
    the shift form. Commit `4f1408d` makes the baton path discoverable from the
    tracked `AGENTS.md`, replaces a tracked reference to ignored `CLAUDE.md`,
    and ignores local Fallow/Playwright caches. Fallow's local command still
    hangs without output and was stopped; its documented fallback completed
    instead. Its stricter unused-code check found and removed one dead
    `LogScreen` import in `1035266`; the final sweep also narrowed one outdated
    tips-or-gross helper comment to the gross rate the app now calculates. The
    tracked checks, TypeScript, Expo compatibility, React peer tree,
    current-facing terminology sweep, and native exports pass. `NEXT` remains
    the physical-iPhone correction recheck, now including the new invalid-job
    alert
41. Completed the Layer 1 correction recheck on the physical iPhone. The user
    confirmed the empty-job alert, second-job creation and inherited rate,
    readable time-weighted gross-per-hour headline and job filters, all seven
    proportional weekday bars with exact values and sample context, scrolling,
    safe areas, and both tabs. This closes Layer 1's iPhone acceptance gate;
    Android runtime behavior remains unverified and is now `NEXT`
42. Completed the Layer 1 Android-emulator acceptance pass. The user confirmed
    the prescribed Log and Trends checklist passed without reporting a runtime
    defect. Combined with the physical-iPhone result, Layer 1 is now verified
    across both target platforms. The next product need is importing the user's
    existing nine-column shift history without rounding away its hundredths of
    an hour, so exact duration preservation and CSV import replace platform
    verification in `NEXT`
43. Migrated canonical shift duration from integer minutes to integer seconds.
    Version 2 renames and scales existing values atomically, while all data,
    calculations, forms, totals, and Trends now use seconds. The migration test
    proves non-duration fields, tombstones, archived relationships, constraints,
    foreign keys, and rollback survive; the edit-format check exhaustively
    round-trips every duration from one second through 24 hours
44. Added the first format-specific CSV importer. The Log screen now chooses a
    destination job, reads a native document, validates the exact nine-column
    contract and every row, previews totals and conflicts, then appends all
    rows in one exclusive SQLite transaction after confirmation. The supplied
    845-row file imported successfully in Android, refreshed Log and Trends,
    and produced 845 exact-match warnings when selected again. Static iOS and
    Android exports pass; physical-iPhone picker verification is now `NEXT`
45. Shipped the requested product revision in three verified commits. Trends
    is now the real index/home tab and Android's native tab bar stays opaque.
    Log puts outlined job-management and CSV actions before the shift form;
    removing a job archives it, preserves named history, and is covered by the
    schema check. Trends defaults to average gross/hours per worked week and a
    compact Year view, with All time and Month/Weekday choices. The supplied
    845 rows calculate to 198 worked weeks, $645.61/week, 20.1h/week, and
    $32.14/hr. The tracked hook, TypeScript, Expo dependency check, Fallow
    changed-file gate, and Android interaction pass. D14 records why overtime
    and tax math require profiles instead of guessed universal percentages.
46. Added the requested interactive dashboard in `5bf1375`. Trends now opens
    with one large gross-income line, exact wage/tip/hour text, 1W/1M/3M/1Y/All
    ranges, job scope, and nearest-point touch inspection. The supplied 845-row
    history condenses to 51 monthly All points instead of a multi-year daily
    scroll. D9 now records why this uses one Expo-supported SVG primitive
    dependency rather than a chart framework or misleading investment-style
    red/green semantics; D10 pins the tested calendar buckets and newest-shift
    anchor. Log now orders form, totals, management, then history. Shift Delete
    is visually concealed until a left swipe, while long press and a screen-
    reader action reach the same soft-delete confirmation. React Native's own
    gesture and animation primitives handle both interactions. The tracked
    hook, TypeScript, Expo dependency check, Fallow changed-file audit, fresh
    iOS/Android exports, and Android cold-runtime interactions pass. Physical-
    iPhone CSV, gesture, and VoiceOver verification remains in `NEXT`.
47. Refined the shipped dashboard from device feedback, in `b771c03` and
    `6de533f`. Trends gained a YTD range covering January through the newest
    shift's month, the only range anchored to a calendar boundary rather than
    rolling backwards. Every range now names its window as a date range
    ("Jul 28 – Aug 3, 2026") instead of describing the calculation that
    produced it ("7 days ending Aug 3, 2026"); `TrendSeries` carries
    `startDate` so the window's start stays knowledge of `trends.ts` rather
    than something the chart re-derives. The weekday bars stopped silently
    truncating: their two-line sample label lost the hours on every column
    whose shift count wrapped, so only Saturday appeared to show hours. Hours
    were removed rather than the label widened, since the bar already encodes
    dollars per hour; screen readers still speak them. TypeScript, the tracked
    hook, the schema and migration checks, and all five direct-run test files
    pass. Neither change has run on a physical device.
48. Acted on a second round of device feedback, in `3dc3013` and `d2a28d1`.
    Tapping the income line now jumps straight to that point instead of
    requiring a drag: the chart claims the touch on press-down and hands it
    back if the surrounding scroll view asks, clearing the selection so a
    vertical scroll leaves nothing highlighted. The Log stopped being an
    845-row unbroken scroll — shifts now sit under sticky month headers
    carrying that month's gross and shift count, with every month except the
    newest collapsed, so five years of history is about fifty headers and one
    tap. Rows lead with weekday and day and put the shift's gross on the right,
    since the header already supplies the month and year. D15 records why
    collapsed rather than merely sectioned, and what a future search or job
    filter would change about the default. Grouping lives in
    `src/lib/shiftGroups.ts` with its own assertions so month subtotals stay on
    the same D5 per-shift gross that Trends uses. TypeScript, the tracked hook,
    and all six direct-run test files pass; neither change has run on a
    physical device.
49. Compacted the Log screen on request, in `561bbd7`, `2e134d0`, and
    `4825557`. The tab no longer opens onto seven input boxes: the shift form
    sits behind one filled "Log a shift" button and the job manager and CSV
    importer behind a "Manage data" toggle, so the default state of the screen
    is the history it exists to show. Tapping a row still opens the form
    directly. The history went from one level of month sections to a
    year > month > week tree with only the newest branch open, which puts the
    current week on screen with no taps and turns five years into a handful of
    rows. The tree is flattened into one array of typed rows so it still
    renders through a single virtualized `FlatList`; nested scrollers would
    have cost the virtualization that keeps 845 shifts cheap. The Sunday
    week-start rule D10 pins moved into `dates.ts` first, since Trends and the
    Log now both group by week and two copies would drift apart silently. D15
    is revised for the level change, the split of a month-straddling week, and
    the loss of sticky headers. TypeScript, the tracked hook, the schema and
    migration checks, and all six direct-run test files pass; none of it has
    run on a physical device.
50. Made All time the default Trends summary and moved it left of Weekly
    average, in `9958a4f`. D10 is revised for the swap, and the same revision
    backfills YTD and the date-range window labels into D10's chart bullet,
    which had been describing the pre-`b771c03` screen for several commits.
