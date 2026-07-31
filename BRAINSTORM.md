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
- `BUILD_LOG.md` — commit-by-commit history, detailed enough to recreate the
  repo from scratch. Different job from this file: chronological and
  command-level, not Q&A or what's next.
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

Append-only. Entries 1–19 (initial commit through finishing the jobs/shifts
data-access layer) archived to
[docs/brainstorm/order-of-operations-2026-07.md](docs/brainstorm/order-of-operations-2026-07.md)
on 2026-07-30, once this section passed the ~500 line split threshold. Picks
up here at entry 20. New entries go here, not the archive — it moves again
once this section does.

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
24. Added edit: `updateShift` in `shifts.ts` (mirrors `createShift`, as an
    `UPDATE`). `LogShiftForm` reused rather than duplicated — takes an
    optional `editingShift` prop, pre-fills from it, calls `updateShift`
    instead of `createShift` on submit, gets a Cancel button while editing.
    Tapping a shift row (kept as a sibling `Pressable` to the Delete
    button, not a parent of it) opens it for editing. Resolved the gap
    flagged when `LogShiftForm` was first built: `useState` initializers
    only run once at mount, so switching from editing shift A to shift B
    without submitting wouldn't update the fields — fixed with a `key` on
    `LogShiftForm` tied to `editingShift?.id ?? 'new'`, React's standard
    fix for this (force a remount) rather than syncing state with a
    `useEffect`. Verified with `tsc --noEmit` and a bundling
    `CI=1 expo start` (801 modules, no resolution errors)
25. Confirmed edit on a physical device: tapped a shift, it opened
    pre-filled, changed a value, saved, the list updated correctly; Cancel
    also confirmed working. Create, list, edit, and delete are all now
    verified working for real, not just bundled — the full CRUD loop for
    shifts is done and proven on device
26. **NEXT:** Gross totals — the last piece of Layer 0's own MVP scope in
    this file. Likely a small summary above or below `ShiftList` (total
    hours, total tips, total gross pay), computed from the `shifts` array
    `App.tsx` already holds in state — no new data-access function should
    be needed, this is arithmetic over data already being fetched. Once
    this lands, Layer 0 is actually complete and Layer 1 (Trends) becomes
    the next real scope decision

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

### Round 3: Data model — ANSWERED, all of it, see schema.sql

Two entities looked obvious: **Job** and **Shift**. Every question below is
now implemented, not just decided — kept in question form because the
reasoning is the useful part, same rule as everywhere else in this file.

**Q1. How is money stored? — ANSWERED: integer cents.**

Not as floating point. `0.1 + 0.2` is `0.30000000000000004` in JavaScript,
because binary floats can't represent most decimal fractions exactly. Small
errors compound across hundreds of shifts and a tax calculation.

Store whole cents as integers. `$24.50` is `2450`. Format for display only.
Every money column in `schema.sql` (`hourly_rate_cents`, `tips_cents`)
follows this.

**Q2. What happens to shift history when a job's hourly rate changes? — ANSWERED, see D2's sibling reasoning in `schema.sql`'s comments.**

The expensive one. Worth reasoning through before reading ahead.

Scenario: 200 shifts logged against a job paying $8/hr. You get a raise to
$10/hr and update the job. If a Shift only stores `job_id` and the rate is
looked up from Job at display time, what happens to those 200 historical
shifts?

Whatever this app shows for last year has to still be true next year. Answer:
`shifts.hourly_rate_cents` copies the job's rate at the moment the shift was
created, and is never a live lookup. `createShift`/`updateShift` in
`shifts.ts` take it as a required argument for exactly this reason.

**Q3. What kind of IDs? — ANSWERED: text UUIDs, via `expo-crypto`.**

D1 committed to sync-later. Auto-incrementing integers collide across devices —
two phones both create row 5, and there's no way to reconcile them. Text
UUIDs, generated on-device with `Crypto.randomUUID()`, are unique everywhere
without needing a central authority to hand them out.

**Q4. How is a shift's date stored? — ANSWERED: date-only ISO 8601.**

A shift on October 5th is October 5th. If it's stored as a UTC timestamp, a user
in a negative-offset timezone logging a late shift can see it land on the wrong
day. `shift_date` is `"YYYY-MM-DD"`, no time, no timezone.

**Q5. What happens on delete? — ANSWERED, see D3 (jobs) and D4 (shifts) in the Decision Log.**

### Housekeeping to sort out before submission

- Apple Developer Program: $99/year — **done**, membership already active
  (used it 2026-07-30 to build a custom Expo Go via `eas go` for device
  testing, see `docs/brainstorm/2026-07-tooling.md`). Google Play: $25
  one-time, still outstanding. Apple review takes days and can reject.
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
  `expo-crypto` is and why it's needed, the App Store's Expo Go lagging
  behind Expo's own SDK releases, and what a real engineer would do about
  splitting UI into component files.

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
- React/React Native fundamentals generally — first time writing any of it
  by hand this project (`CreateJobForm`). `useState` for state that survives
  a re-render, controlled `TextInput`s (`value` from state, `onChangeText`
  writes back), callback props as the only way a child tells a parent
  something happened, `View`/`Text`/`Pressable` as RN's own primitives
  instead of HTML elements, `StyleSheet.create` as RN's CSS equivalent
- React's `key` prop as a state-reset mechanism, not just a list-rendering
  requirement — used in `App.tsx` (`key={editingShift?.id ?? 'new'}`) to
  force `LogShiftForm` to remount instead of reusing the same instance with
  a prop that silently changed, since its `useState` initializers only run
  once at mount. Worth understanding well enough to recognize the next time
  "a prop changed but the UI didn't update" shows up
