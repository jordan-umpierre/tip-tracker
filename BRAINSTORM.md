# Tip Tracker — Brainstorm Log

Running log of every design decision, question, and dead end on this project.
Start to finish. Nothing gets decided in chat and forgotten.

**How this file works:**
- **Order of Operations** — what we did, in order. Append-only.
- **Product Definition / MVP vs Later** — what we're building and what's
  deliberately deferred.
- **Pushback / Risks** — what a senior engineer would object to.
- **Open Questions** — what's undecided and blocking.
- **Q&A / Confusions** — every question I asked and the answer. Lives in
  `docs/brainstorm/`, one file per month, with a pointer left here.
- **Concepts to Learn** — things I hit but don't understand yet.

**Companion docs:**
- `DECISIONS.md` — the numbered decision log (D1, D2, …). Split out of this file
  once it got long, because decisions are the part worth finding fast.
- `schema.sql` — the data model.

Splitting rule: docs get split by purpose, never into `BRAINSTORM_2.md`. A
numbered sequel makes things unfindable — "which file has the Expo decision?"
is a question nobody should have to ask. The Q&A log is the section that grows
without limit, so it archives by month into `docs/brainstorm/YYYY-MM.md` — which
happened on 2026-07-30, when this file hit 592 lines. The same rule applies
recursively: `2026-07.md` itself passed ~500 lines the same day, so it split
again by purpose into `2026-07-<topic>.md` files, with `2026-07.md` left behind
as a short index.

Last updated: 2026-07-30

---

## Order of Operations

1. Created directory `tip-tracker`
2. Created `README.md`
3. `git init`, first commit, pushed to GitHub
4. Created `BRAINSTORM.md` — the file you're reading
5. Defined the problem, the differentiators, and what's out of scope
6. Split the feature set into MVP + three later layers
7. Decided architecture: local-first, SQLite on device, sync added later (D1)
8. Decided platform: Expo (React Native, TypeScript) (D2)
9. Data model written as `schema.sql` — `jobs` and `shifts`, checked by hand
   against sqlite3
10. Split `DECISIONS.md` out of this file once it passed 750 lines, and added
    `scripts/check-docs.sh` plus a git pre-commit hook to stop docs rotting
11. First code review of the repo. `check-docs.sh` turned out to print FAIL and
    exit 0, so nothing it found had ever blocked a commit; `schema.sql` still
    cited D1 in the wrong file; and the claim that constraints were tested had
    no tests behind it. Fixed all three, added `scripts/test-schema.sh`, gave
    shifts a tombstone (D4), rewrote `README.md`, archived this file's Q&A log
12. Installed `sqlite3` and DB Browser for SQLite (both via `winget`), since
    `test-schema.sh` had been silently skipping on this machine the whole time
    (`WARN sqlite3 not installed`). Verified the suite actually catches a
    broken constraint by loosening a `CHECK` and watching it fail, not just
    trusting the 19-checks-passed output. Found `core.hooksPath` wasn't
    actually set on this machine despite being documented as done, and
    re-ran it. Split the July Q&A archive again, this time by purpose, once
    it itself passed the ~500 line threshold
13. Built a cold-agent handoff system, since `CLAUDE.md`'s old "Start here"
    section (status + next task, restated) had already drifted from this
    file's Order of Operations once. Thinned `CLAUDE.md` down to a pointer at
    this section instead of a second copy, added an explicit handoff protocol
    (check `core.hooksPath` first, do the one `NEXT:` task, update this log
    before ending the session), and taught `check-docs.sh` two new warnings:
    `core.hooksPath` not actually set to `.githooks`, and this file's
    `Last updated` date being stale while other work is being committed. Both
    verified by triggering them on purpose before trusting them
14. Scaffolded the Expo app. `create-expo-app` refuses a non-empty directory,
    so it ran into a throwaway subdirectory and the result got moved up by
    hand instead. That meant `app.json`'s `name`/`slug` and `package.json`'s
    `name` came out as the throwaway directory's name — caught by
    `expo-doctor`, fixed to `tip-tracker`. Kept the project's real
    `CLAUDE.md` over Expo's generated stub, and merged Expo's `.gitignore`
    rules into the existing file rather than overwriting it, per the trap
    this file already had a note about. Verified with `tsc --noEmit`,
    `expo-doctor` (20/20), and an actual `CI=1 expo start` bundling and
    serving before committing
15. Added `BUILD_LOG.md`: a commit-by-commit log detailed enough to recreate
    the repo from scratch, separate from `DECISIONS.md` (why) and this file
    (Q&A / what's next). Backfilled all 18 commits so far. Gave it the same
    staleness check `check-docs.sh` already runs against this file's
    `Last updated` date, verified by breaking it on purpose first
16. Wired `schema.sql` into `expo-sqlite` (`db.ts`). Opens the connection,
    turns on `PRAGMA foreign_keys = ON`, then runs `schema.sql` — shipped as
    a bundled asset via `metro.config.js` rather than duplicated as a JS
    string, so `db.ts` and `test-schema.sh` always run the same source of
    truth. Guarded against re-running the `CREATE TABLE` statements on every
    launch with `PRAGMA user_version`, since `schema.sql` deliberately has no
    `IF NOT EXISTS`. `App.tsx` temporarily renders the open/fail status to
    prove it end to end; that gets replaced once there's a real screen.
    Confirmed working for real on a physical iPhone — "database ready"
    rendered, meaning the schema actually loaded and ran on device. Getting
    there needed a detour: the App Store's Expo Go build was still on SDK 54
    while this project is on SDK 57 (Apple's review lag on Expo Go itself, a
    real and current gap, not a local issue). Fixed with `npx eas-cli@latest
    go`, which builds a custom Expo Go matched to our SDK and ships it via a
    personal TestFlight team — needs an Apple Developer Program membership,
    and the App Store Connect API key it generates needs the **Admin** role,
    not App Manager, since only Admin can manage the certificates EAS needs
    to sign the build
17. Revisited "screen sketches next" before starting it: this app has no
    server backend at all in MVP (D1), so "build the backend first" doesn't
    apply the normal way. What a screen actually needs first is a small
    data-access layer — plain functions wrapping SQL — since `db.ts` alone
    can open a connection and run `schema.sql` but can't insert or list
    anything yet. Reordered to: data-access functions per table, then the
    screen that calls them, one vertical slice at a time, rather than all
    screens first or (nonexistent) "all backend" first
18. Wrote `jobs.ts`: `createJob` and `listActiveJobs`, the first of that
    data-access layer, using `expo-crypto`'s `Crypto.randomUUID()` for ids.
    First pass at `listActiveJobs` copied `createJob` almost verbatim instead
    of adapting it — still an `INSERT`, still generating a new id and
    timestamp, wrong params, wrong return type. Rewritten to actually read:
    `db.getAllAsync<Job>(...)` instead of `db.runAsync(...)`, filtering
    `archived_at IS NULL` per D3. Verified with `tsc --noEmit`; not wired into
    a screen yet, so nothing to run on device for this one
19. Wrote `shifts.ts`: `createShift` and `listShifts`, same pattern as
    `jobs.ts`. `hourlyRateCents` is a required argument rather than looked up
    from the job inside the function — `schema.sql` is explicit that the
    column copies the job's rate at the moment of the shift, not a live
    reference, so the caller decides the value (default it to the job's
    current rate, let the user override it). `listShifts` takes no filter
    arguments for now, returns every non-deleted shift most recent first,
    and leaves grouping to the caller — add a filtered variant once a screen
    actually needs one. Verified with `tsc --noEmit`
20. Built the log-a-shift screen — first real UI in the app, and the first
    time writing React/React Native by hand this project. `CreateJobForm`
    built as a fully worked example (never done this before, so nudging
    would've wasted time — a full annotated example was the right call,
    same reasoning as the earlier `db.ts` moment). `LogShiftForm` and the
    `App.tsx` wiring built the same way after that, on request, once the
    same "never done this" gap applied to the rest of it too. `ShiftList`
    added alongside `App.tsx` since MVP Layer 0 needs "see a list of past
    shifts," not just log one. Concepts worth revisiting later: `useState`
    initializers only run once at mount (`LogShiftForm`'s job-selection
    default would go stale if the jobs list changed while it stayed
    mounted — currently harmless, since `App.tsx` only renders it once jobs
    already exist), and controlled inputs / callback props as the two-way
    data flow between a form and its parent. Verified with `tsc --noEmit`
    and a bundling `CI=1 expo start` (750 modules, no resolution errors)
    against a freshly started Metro instance
21. Confirmed the log-a-shift screen for real on a physical device: created
    a job, logged several shifts, all showed up correctly in the list.
    First time anything in this app has been exercised as an actual user
    would, not just bundled or typechecked
22. Added delete: `shifts.ts` got `deleteShift(id)`, an `UPDATE` setting
    the D4 tombstone rather than a real `DELETE`. `ShiftList` got a Delete
    button per row behind a native confirmation (`Alert.alert`, no new
    dependency) — destructive from the user's point of view even though
    it's soft under the hood, so a stray tap can't lose a shift silently.
    Shipped as two commits, not three: the data-access function stood alone
    fine (a new unused export doesn't break anything), but `ShiftList`'s
    new required `onShiftDeleted` prop broke `App.tsx`'s existing call site
    immediately, since that component was already wired in — unlike
    `CreateJobForm`/`LogShiftForm` earlier, which were dead code until
    wired, there was no working intermediate state to split there. Verified
    with `tsc --noEmit` and a bundling `CI=1 expo start` (801 modules, no
    resolution errors)
23. Confirmed delete on a physical device: logged a shift, tapped Delete,
    confirmation prompt showed, shift disappeared from the list after
    confirming. Both create and delete now verified working for real, not
    just bundled
24. **NEXT:** Edit shifts (`updateShift` in `shifts.ts`, plus UI to trigger
    it — likely tapping a row to open it pre-filled in something shaped
    like `LogShiftForm`). Last piece before gross totals, and then Layer 0
    is actually complete against this file's own MVP scope

### Settled stack

- **Language:** TypeScript
- **UI:** React via React Native
- **Framework/tooling:** Expo (D2)
- **Storage:** SQLite on device via `expo-sqlite` (D1)
- **Backend:** none for MVP. Node + Express + Postgres later, sign-in optional (D1)

---

## What We Know So Far

- Name: `tip-tracker`
- Target: production app on the Apple App Store and Google Play
- Audience: public — any service worker, W2 or 1099
- Initial scale: 3–10 users, scale up if demand appears
- Stack preference: TypeScript / React / Node / Postgres world
- Nothing technical is decided yet

---

## Product Definition (2026-07-29)

### The problem

Service workers have irregular income. They don't know what they actually make
per hour, which shifts are worth taking, or what they'll owe at tax time. Cash
tips make it worse — nothing withholds tax from cash.

### What the app does

Log a shift in seconds. See what you actually earn — after tax, not before.

### The three differentiators

1. **Net, not gross.** Projected take-home, projected paycheck amount, estimated
   refund or amount owed at year end. Opt-in, because most people will find tax
   settings intimidating and should be able to skip them entirely.
2. **1099 as a first-class citizen.** Mileage and expenses, not just W2 shifts.
   Tax projection matters *more* for them since nothing is withheld.
3. **UI/UX quality.** Modern, fast, feels good to use.

### Explicitly out of scope (v1)

- Payroll integration or bank connections
- Anything that files or submits a tax return
- Social features, leaderboards, comparing to other users
- Employer-side or manager-side views

---

## MVP vs Later

The feature set splits into four layers. Each one is built on the layer below
it, and each is *additive* — none of them forces a rewrite of the one before.
That property is the reason to ship in this order.

### Layer 0 — MVP

- Create jobs. A job has a name and an hourly rate. Multiple jobs, different
  rates.
- Log a shift: date, which job, hours, tips, optional note. Hourly rate is
  inherited from the job but overridable (raises happen, so do special events).
- Multiple shifts per day, any number of days.
- See a list of past shifts. Edit and delete them.
- Gross totals only.

This is a complete, shippable, useful app. Someone would actually use it.

### Layer 1 — Trends

- Earnings by day of week ("Mondays are $24/hr, Tuesdays are $33/hr")
- Earnings by month and by year, going back as far as data exists
- Tips per hour as the headline number

No new data model. Every one of these is a query over Layer 0 data. That is
exactly why it's Layer 1 and not MVP — it can't block anything.

### Layer 2 — Net income for W2

- Opt-in tax profile: filing status, state, W4 allowances/adjustments
- Projected take-home per shift and per pay period
- Projected paycheck amount (weekly / biweekly / semimonthly)
- Year-end estimate: refund or amount due

### Layer 3 — 1099 mode

- Mark a job as 1099 instead of W2
- Log miles driven and deductible expenses
- Self-employment tax, quarterly estimated payments

### Why this order

Layer 0 is where the risk of getting it wrong is highest and the cost of
fixing it later is highest. Layers 2 and 3 are each individually bigger than
Layer 0, and both depend on shift data being correct. Build the foundation,
prove it works, then stack on it.

Common failure mode this avoids: building the impressive tax engine first,
then discovering the shift-logging flow is annoying enough that nobody logs
shifts, which makes the tax engine worthless.

---

## Pushback / Risks

Things a senior engineer would raise in review.

### 1. Tax projections for strangers is a liability, not just a feature

You're shipping financial estimates to the public. If someone under-saves for
taxes because of a number this app showed them, that's real harm to a real
person. This is the highest-risk part of the product and it is also the
differentiator, so it can't just be dropped.

Mitigations to build in from day one of Layer 2:

- Never call it advice. It's an estimate.
- Visible disclaimer wherever a projected number appears, not buried in a
  settings page.
- Show the inputs and the math, so a user can sanity-check it.
- Be conservative by default. Over-estimating what's owed is a much kinder
  failure than under-estimating.
- Federal only, at first. Fifty states of tax law is not a v1 problem, and
  pretending to handle a state you handle badly is worse than saying you don't.

App store review may also scrutinize a finance app more closely. Worth knowing
before submission, not during.

### 2. "Superb UI/UX" is a constraint, not a feature

It can't go on a task list and get checked off. It shows up as: no janky
animations, no layout shift, works one-handed, works in bright sun, respects
system dark mode, accessible font sizes. It's a bar we hold on every screen.

The practical version for MVP: the log-a-shift flow is the *only* screen that
gets obsessed over. Make that one excellent. Everything else can be clean and
plain.

### 3. Speed-first and tax-settings pull in opposite directions

"Log in 10 seconds" and "configure your W4" are opposite experiences. The
opt-in framing is the right instinct. Keep the tax module completely walled off
so a user who never touches it never sees it.

---

## Decision Log

Moved to `DECISIONS.md` so it stays findable as this file grows. Currently
D1 (local-first storage), D2 (Expo), D3 (soft delete for jobs), D4 (tombstones
for shifts).

---

## Open Questions

### Round 1: Product scope — ANSWERED (see Product Definition above)

### Round 2: Architecture

**Q1. Does MVP need a backend and user accounts, or is on-device storage
enough? — ANSWERED, see D1 in the Decision Log.**

Kept below because the rejected options and their tradeoffs are the useful part.

This was the expensive decision. All three options are defensible; they're
defensible for different reasons.

*Option A — on-device only.* Data lives in SQLite on the phone. No server, no
accounts, no login screen.

- Pros: no hosting cost, nothing to operate, no auth to build, no password
  resets, no user data to breach or be legally responsible for. Ships far
  sooner. Works with no signal, which matters when you're logging a shift in a
  basement break room.
- Cons: phone lost or upgraded means data lost, unless we add export/backup.
  No second device. Adding accounts later requires a migration and a story for
  merging local data into a new account.

*Option B — Express + Postgres backend with accounts from day one.*

- Pros: data survives the phone. Multi-device. The scaling path is already
  there. Better interview talking point on the backend side.
- Cons: at 3–10 users this is mostly cost and maintenance for benefit nobody is
  asking for yet. Auth is genuinely fiddly and is a place to introduce security
  bugs. Now legally responsible for storing strangers' income data. Every
  feature costs more to build because it touches two codebases.

*Option C — local-first, sync added later.* SQLite on device is the source of
truth. A backend and optional sign-in get added at Layer 1/2. Users who sign in
get backup and multi-device; users who don't keep working exactly as before.

**Recommendation: Option C.**

Reasoning, and this is the part worth being able to say out loud:

- The log-a-shift flow has to be instant and work with no signal. A basement
  break room has no bars. That means writing to the device first, always. So
  we're building on-device storage *no matter which option we pick* — Option B
  doesn't remove that work, it adds server work on top of it.
- Auth built before the product is understood is auth that gets rewritten.
- But this app's data is multi-year income and tax records. That's too precious
  to leave on a single device with only a manual export as backup. Most people
  will never remember to export. So "never build a backend" is the wrong answer
  *for this specific app* — not because of scale, because of data value.

The real cost of Option C: the local schema has to be designed so it can sync
later. Sync is genuinely one of the harder problems in software because of
conflict resolution. It's tractable here — shift records are single-user and
mostly append-only, so two devices rarely touch the same record, and
last-write-wins is a defensible policy. Worth knowing it's the hard part.

Note that "production ready" does not mean "has a backend." It means real people
can rely on it: doesn't lose data, doesn't crash, handles bad input, is
supportable. Plenty of shipped production apps store everything on device.

**Q2. Expo vs bare React Native? — ANSWERED, see D2 in the Decision Log.**

**Q3. Where does the tax logic live?**

If there's no backend, it runs on-device. That means tax rules ship inside app
versions, and updating rates for a new tax year requires an app store release.
Worth thinking about before Layer 2.

### Round 3: Data model (current)

Two entities look obvious: **Job** and **Shift**. The questions are about their
fields, and a few of these are genuinely expensive to get wrong.

**Q1. How is money stored?**

Not as floating point. `0.1 + 0.2` is `0.30000000000000004` in JavaScript,
because binary floats can't represent most decimal fractions exactly. Small
errors compound across hundreds of shifts and a tax calculation.

Store whole cents as integers. `$24.50` is `2450`. Format for display only.

**Q2. What happens to shift history when a job's hourly rate changes?**

The expensive one. Worth reasoning through before reading ahead.

Scenario: 200 shifts logged against a job paying $8/hr. You get a raise to
$10/hr and update the job. If a Shift only stores `job_id` and the rate is
looked up from Job at display time, what happens to those 200 historical
shifts?

Whatever this app shows for last year has to still be true next year.

**Q3. What kind of IDs?**

D1 committed to sync-later. Auto-incrementing integers collide across devices —
two phones both create row 5, and there's no way to reconcile them. What's the
alternative, and what does it cost?

**Q4. How is a shift's date stored?**

A shift on October 5th is October 5th. If it's stored as a UTC timestamp, a user
in a negative-offset timezone logging a late shift can see it land on the wrong
day. Date-only, or timestamp?

**Q5. What happens on delete? — ANSWERED, see D3 in the Decision Log.**

### Housekeeping to sort out before submission

- Apple Developer Program: $99/year. Google Play: $25 one-time. Apple review
  takes days and can reject.
- A public app needs a privacy policy URL even if it stores nothing remotely.
- App name availability on both stores. "Tip Tracker" is likely taken.

---

## Q&A / Confusions

Every question I ask goes here with its answer. This is the section that grows
without limit, so it archives by calendar month and a pointer stays behind:

- [July 2026](docs/brainstorm/2026-07.md) — why documentation comes before code,
  how to tell MVP from later, SQLite vs Postgres, Expo vs bare React Native, why
  historical shifts keep their own rate, SQL syntax from nothing, keeping docs
  from going stale, the first code review of the repo, why shifts keep a
  deleted_at tombstone, actually running and breaking the schema tests to trust
  them, GUI vs CLI for SQLite, getting unstuck in the sqlite3 shell, why there's
  no "backend MVP" yet, wiring `schema.sql` into `expo-sqlite` from nothing,
  why UI shouldn't wait on a "backend" that doesn't exist for MVP, what
  `expo-crypto` is and why it's needed, and the App Store's Expo Go lagging
  behind Expo's own SDK releases.

New questions get appended to the current month's file, not to this one.

---

## Concepts to Learn

- React Native vs React — what actually differs, and what Expo adds on top
- Embedded databases (SQLite) vs server databases (Postgres) — the distinction
  that makes "which database" the wrong question
- Local-first architecture, and why sync conflict resolution is the hard part
- Database migrations — why changing a schema after you have real user data is
  the expensive part, and how that shapes MVP decisions
- App store submission process for both platforms
- W4 withholding math, and self-employment tax for 1099 (Layers 2 and 3)
- `PRAGMA user_version` as a migration guard — right now it's a blunt 0/1
  switch in `db.ts`, but the real pattern (every local-first sync library
  uses it) is a ladder: `if (currentVersion < 1) { ... }`,
  `if (currentVersion < 2) { ... }`, so a database can upgrade incrementally
  no matter which version it started at. Matters for real the first time a
  column gets added to `schema.sql` after the app has shipped
- `expo-sqlite`'s read/write API split — `runAsync`/`execAsync` for writes,
  `getAllAsync`/`getFirstAsync` for reads. Mixed these up writing the first
  draft of `listActiveJobs` in `jobs.ts`, which stayed a copy-pasted `INSERT`
  under a new name instead of becoming a `SELECT`
