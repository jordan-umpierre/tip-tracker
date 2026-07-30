# Tip Tracker — Brainstorm Log

Running log of every design decision, question, and dead end on this project.
Start to finish. Nothing gets decided in chat and forgotten.

**How this file works:**
- **Order of Operations** — what we did, in order. Append-only.
- **Decision Log** — real decisions with the tradeoff written down. If I can't
  defend it out loud in an interview, it doesn't go here until I can.
- **Open Questions** — what's undecided and blocking.
- **Q&A / Confusions** — every question I asked and the answer, kept verbatim
  enough to be useful later.
- **Concepts to Learn** — things I hit but don't understand yet.

Last updated: 2026-07-29

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
9. Data model written as `schema.sql` — `jobs` and `shifts`, verified against
   sqlite3 with tests confirming every constraint rejects bad data
10. **NEXT:** Scaffold the Expo app (`npx create-expo-app`)
11. *(not started)* Rewrite `README.md` — after scaffolding, since
    `create-expo-app` writes its own README that would overwrite it
12. *(not started)* Wire `schema.sql` into `expo-sqlite`, with `PRAGMA
    foreign_keys = ON` on the connection
13. *(not started)* Rough screen sketches, focused on the log-a-shift flow

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

Format for each entry:

> **Decision:** what we chose
> **Alternatives:** what we rejected
> **Why:** the tradeoff, in plain language
> **Revisit when:** the condition that would change this call

### D1 — Local-first, with sync added later (2026-07-29)

> **Decision:** SQLite on the device is the source of truth for MVP. No user
> accounts, no backend, no login screen. A Node + Express + Postgres backend
> with *optional* sign-in gets added around Layer 1/2. Users who sign in get
> backup and multi-device sync. Users who don't keep working exactly as before.
>
> **Alternatives:**
> - On-device only, forever, with manual export as the backup story
> - Backend and accounts from day one
>
> **Why:** Logging a shift has to be instant and work with no signal — a
> basement break room has no bars. That forces a device-side write no matter
> what, so on-device storage is work we do in every version of this plan. A
> day-one backend doesn't replace that work, it stacks server work on top of
> it, plus auth we'd likely rewrite once we understand the product.
>
> Going the other way and staying local forever is wrong too, and the reason
> isn't scale — it's data value. This app holds multi-year income and tax
> records. Losing a phone shouldn't mean losing your tax history, and manual
> export doesn't save anyone because nobody remembers to export.
>
> Local-first is the option that respects both facts.
>
> **Known cost:** the local schema has to be designed so it can sync later.
> Sync conflict resolution is genuinely one of the harder problems in software.
> It's tractable here because records are single-user and mostly append-only, so
> two devices rarely touch the same row and last-write-wins is defensible. This
> is the part to be careful about, not hand-wave.
>
> **Revisit when:** users ask for multi-device or web access, or the first
> person loses their history. Either is the trigger to build the backend.

**What this means for the stack:** SQLite on the device, Postgres on the server
when the server exists. Both, in different places — not one instead of the
other.

### D2 — Expo, not bare React Native (2026-07-29)

> **Decision:** Build with Expo. TypeScript, React, React Native, Expo SDK.
>
> **Alternatives:** bare React Native (managing `ios/` and `android/` by hand);
> truly native Swift + Kotlin.
>
> **Why:** Truly native means two languages and two codebases for a solo dev —
> not close. Between Expo and bare, the scarce resource here is time, and the
> native build pipeline is the most reliable way to burn weeks with nothing
> shippable. Expo removes that risk *without* foreclosing the alternative, since
> `npx expo prebuild` hands over the native projects whenever needed.
>
> **Revisit when:** a required native dependency has no config plugin, EAS
> pricing stops making sense, or binary size becomes a real constraint.

Full tradeoffs below, kept because the rejected reasoning is the useful part.

#### First: React is not being replaced

Worth clearing up before the tradeoffs, because it's the same shape of
confusion as SQLite vs Postgres — comparing two things that don't occupy the
same slot.

React is not a rendering target. It's a component model: JSX, props, state,
hooks, composition, the reconciler that figures out what changed. That core is
platform-agnostic on purpose.

What varies is the **renderer** plugged into it:

| Renderer | Renders to | Where |
|---|---|---|
| `react-dom` | HTML DOM elements | browser |
| `react-native` | real native iOS/Android views | phone |

Same React. Same hooks, same mental model, same `useState`. What changes is the
vocabulary of primitives:

- `<div>` becomes `<View>`
- `<p>` / `<span>` becomes `<Text>`
- CSS files become style objects (flexbox works, and it's the default)
- `onClick` becomes `onPress`

So React is fully in the stack. React Native isn't an alternative to React —
it's React with a different renderer. Your React knowledge transfers almost
completely. What doesn't transfer is CSS and the DOM.

**And Expo is not an alternative to React Native either.** Expo is a framework
and toolchain built on top of React Native. Every Expo app *is* a React Native
app. So the real question is narrower than it sounds:

> Do I let a toolchain generate and manage the native iOS/Android build
> configuration for me, or do I own those files myself?

That's it. That's the whole decision.

#### How Expo actually works now

The current model is **Continuous Native Generation (CNG)**. You don't keep
`ios/` and `android/` folders in the repo. They're generated on demand from
`app.json` plus "config plugins" by running `npx expo prebuild`. Native config
becomes declarative and version-controlled as JSON instead of hand-edited Xcode
project files.

The old limitation people remember — "you can't use native modules on Expo" —
is gone. Config plugins are how arbitrary native code gets wired in now.

#### Expo — pros

- **No Xcode or Gradle config to hand-edit.** Native SDK versions, iOS
  deployment target, permissions strings are declared in `app.json`. This is
  where solo mobile devs lose entire weeks.
- **EAS Build** compiles iOS and Android in the cloud, so app-store builds don't
  depend on local toolchain setup being correct.
- **EAS Submit** uploads to App Store Connect and Google Play.
- **`expo-sqlite` is first-party.** Lines up exactly with D1 — the storage layer
  is a maintained module rather than a third-party gamble.
- **Over-the-air updates** (`expo-updates`) ship JS-only fixes without an app
  store review cycle. For a money app this matters a lot: a wrong number gets
  fixed today instead of in three days after Apple approves.
- **`expo-router`** gives file-based routing, which is the Next.js pattern.
  Familiar territory.
- Large set of maintained native modules (secure storage, haptics, notifications,
  file system) that would otherwise mean auditing random npm packages.

#### Expo — cons (the honest ones)

- **An extra abstraction layer to debug.** When a cloud build fails, the problem
  might be your code, the native platform, *or* Expo's tooling. Three suspects
  instead of two.
- **Upgrades happen on Expo's schedule, not yours.** React Native versions land
  when an Expo SDK supports them, roughly quarterly. You can't jump to a new RN
  release the day it drops.
- **EAS is a paid service** past a limited free tier — queue times and build
  minutes. Fine at this size, and local builds are still possible for free, but
  it's a company you're now partly dependent on.
- Slightly larger app binaries by default.
- An unusual native dependency may need a config plugin written, which is real
  work when it happens.

#### Bare React Native — pros

- Total control of the native projects. No layer between you and the platform.
- Upgrade React Native whenever you want.
- No dependency on a third-party build service or its pricing.

#### Bare React Native — cons

- **You own signing certificates, provisioning profiles, CocoaPods, and Gradle.**
  This is not conceptually hard, it's just an enormous amount of fiddly detail
  with bad error messages.
- **RN version upgrades are genuinely painful** in bare projects, because
  upgrading means merging changes into native files you've since modified.
- **Parts of the Expo ecosystem stop working.** Confirmed in Expo's own docs:
  `expo-build-properties`, for example, is explicitly incompatible with projects
  that don't use `expo prebuild`. Going bare isn't only "more work," it also
  costs access to tooling.
- No over-the-air updates unless you add and operate that yourself.

#### Recommendation and reasoning

**Expo**, for reasons specific to this project rather than general preference:

1. Solo developer, first mobile app, 3–10 users. The scarce resource is your
   time, and the native build pipeline is the single most reliable way to burn
   weeks without shipping anything a user can see.
2. `expo-sqlite` matches D1 directly.
3. OTA updates are disproportionately valuable for an app that shows people
   money numbers.
4. **There's a real escape hatch.** `npx expo prebuild` generates the native
   projects, and you can commit them and manage them yourself from then on.
   "We can leave if we need to" is actually true, which is what makes this a
   low-risk bet rather than a lock-in.

Point 4 is the one to be able to say in an interview. The strongest argument for
Expo isn't that it's easier — it's that choosing it doesn't foreclose the
alternative.

**Revisit when:** a required native dependency has no config plugin, EAS pricing
stops making sense, or binary size becomes a real constraint. None apply now.

### D3 — Soft delete for jobs, not cascade (2026-07-29)

> **Decision:** Jobs are never hard-deleted. They get an `archived_at` column,
> and "delete" in the UI sets it. The foreign key on `shifts.job_id` uses
> `ON DELETE RESTRICT` as a backstop, so a bug in app code still can't destroy
> shift history.
>
> **Alternatives:** `ON DELETE CASCADE` (delete the shifts with the job);
> `ON DELETE RESTRICT` alone with no archive concept.
>
> **Why:** The test for cascade is whether the child row means anything on its
> own. A cart line item is meaningless without its cart, so cascade is right
> there. A shift is not meaningless without its job — October 2025's earnings
> still matter after you quit. So cascade is wrong here.
>
> The scenario that decides it: a user quits their job and deletes it from the
> app. That's the most likely thing any user will ever do, and under cascade it
> silently destroys a tax year. Irreplaceable data, no undo.
>
> Plain `RESTRICT` collapses into this same answer, because blocking the delete
> is only usable if there's a way to hide old jobs — which is archive. So archive
> is the direct answer rather than a workaround.
>
> **Bonus:** this also answers Round 3 Q5. Soft delete is the standard fix for
> sync deletes, since a tombstone row is something another device can actually
> receive. Hard deletes are invisible to a device that never saw the row.
>
> **Known cost:** every query listing jobs now has to filter
> `WHERE archived_at IS NULL`. Forgetting that filter once means archived jobs
> reappear. This is a real recurring footgun — worth centralizing the job-list
> query in one place rather than rewriting the filter at each call site.
>
> **Revisit when:** users want to truly delete a job created by mistake. The
> likely answer then is: allow hard delete only when the job has zero shifts.
> Deliberately not in MVP — one code path is simpler, and nobody has asked.

#### The decision one level up (already settled, worth noting)

React Native vs Flutter vs native Swift + Kotlin was never close here. Flutter
means learning Dart. Native means learning two languages and maintaining two
codebases. React Native reuses React, which you already know. One codebase, two
stores.

The tradeoff being accepted: React Native apps can feel very slightly less
native than hand-written Swift, especially in complex animations. For a
form-and-charts app, that gap is not where quality will be won or lost — the
UI/UX bar from the product definition is achievable here.

---

## Decision Log

Format for each entry:

> **Decision:** what we chose
> **Alternatives:** what we rejected
> **Why:** the tradeoff, in plain language
> **Revisit when:** the condition that would change this call

*(empty — no real decisions made yet)*

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

Every question I ask goes here with its answer.

### 2026-07-29 — "What's the next logical step or commit an engineer would do?"

Write down what the app does before choosing any technology.

The reason: every technical decision downstream (database, whether there's a
server, what screens exist) is derived from the problem statement. Pick the
stack first and you're guessing. Guess wrong and you rewrite the data model
after you've already built on top of it.

Concretely, the next commits are documentation, not features. That's normal and
it reads well in a commit history — it shows the thinking happened before the
typing.

### 2026-07-29 — "Not sure what an actual engineer would have as MVP vs not MVP"

The test isn't "is this feature important." Everything you listed is important.
The test is: **what is the smallest version someone would genuinely use?**

Two questions that sort any feature list:

1. *Does this change the data model, or does it just read data I already have?*
   Trends and charts only read existing shift data. So they can't block
   anything, so they aren't MVP. Anything that adds new stored fields
   (tax profile, mileage) is a bigger deal and needs more thought.
2. *If I ship without this, is the app useless or just less good?* Useless means
   MVP. Less good means later.

Applied here: logging a shift and seeing your shifts is the useless/not-useless
line. Everything else — trends, net income, 1099 — is "less good without it."

The instinct to resist: building the most interesting part first. The tax engine
is the fun problem. But if shift logging is annoying, nobody logs shifts, and a
tax engine with no data is worth nothing.

### 2026-07-29 — "Why use SQLite when my tech stack clearly states PostgreSQL?"

Because they aren't competing for the same slot. They're different *kinds* of
thing that happen to both be called databases.

**Postgres is a server.** A separate program that runs continuously on a
machine. Your app connects to it over a network. Something has to keep it alive,
patch it, back it up.

**SQLite is a library.** It's a file on disk, plus code linked into your app
that reads and writes that file. No process to run, no network, no connection
string, no port.

That difference decides everything. You can't run Postgres on a phone — not
"it's a bad idea," the model doesn't fit. Phones suspend and kill background
processes, and there's no always-on machine to be the server.

So the actual question is never "SQLite or Postgres." It's **where does the data
live?**

- Data on the device → SQLite. Effectively the only option.
- Data on a server → Postgres. Correct choice, exactly as your stack says.
- Both → both, which is the normal answer for serious mobile apps. SQLite on
  device for instant offline reads and writes, Postgres on the server as the
  source of truth, sync between them. That pattern is called **local-first**.

Your stack list is a web stack. Postgres is on it because web servers talk to
Postgres. Nothing about that changed — it just doesn't reach onto the phone.
If we build the backend, it's Node + Express + Postgres, straight down your
stack. SQLite sits underneath it on the device, not instead of it.

Worth noticing the general pattern here: when a tool seems not to fit, check
whether you're comparing two things that occupy the same slot. Often they don't,
and the real question was one level up.

### 2026-07-29 — "Are you saying I should use both Expo and native, like SQLite + Postgres?"

No. This one is genuinely either/or, and the difference between the two
situations is worth understanding because it comes up constantly.

**SQLite + Postgres was additive.** Two different places needing storage: the
phone and the server. Two tools, two locations, both exist at once.

**Expo vs bare React Native is a single choice about a single project.** There's
one app, and its native build config is either generated by a toolchain or
managed by hand. It can't be both at the same time.

#### The naming is what makes this confusing

Three different things get called "native" in these conversations:

| Tier | What it means | Language | Renders native UI? |
|---|---|---|---|
| Truly native | Separate iOS and Android apps | Swift + Kotlin | Yes |
| Bare React Native | React Native, native build files managed by hand | TypeScript | Yes |
| Expo | React Native, native build files generated by tooling | TypeScript | Yes |

The trap: **"bare React Native" is not "native."** "Bare" describes the *build
setup*, not the language. Tiers 2 and 3 are both React Native, both TypeScript,
and both render genuinely native UI. Choosing bare over Expo does not make the
app more native — it makes the build configuration your job.

So "Expo vs native" is really two separate questions, and one is already
settled:

1. React Native vs truly native — **settled.** React Native, because it reuses
   React and means one codebase.
2. Expo vs bare React Native — **the actual open question.** Both are React
   Native. Only the build tooling differs.

#### The analogy that actually maps

**Expo is to React Native what Next.js is to React on the web.**

Next.js *is* React — plus routing, bundling, and build configuration handled for
you. Nobody says "I'm choosing between React and Next.js" as if they were rival
libraries. You use React *through* Next.js. Same relationship here: you use
React Native through Expo.

#### Why my earlier point sounded like "both"

I said you can start on Expo and move to bare later. That's a **one-way
transition, not simultaneous use.** `npx expo prebuild` writes out the `ios/`
and `android/` folders, you commit them, and from then on they're yours to
maintain. Like ejecting.

It's a door you can walk through once if Expo ever stops serving the project.
Not two things running side by side.

#### So the practical answer

Pick Expo. You are still using React. You are still using React Native. You are
simply not hand-writing Xcode and Gradle configuration — and if that ever
becomes necessary, prebuild hands those files over.

### 2026-07-29 — Q2 answered: historical shifts keep their original rate

My answer: the past 200 shifts should not change when the wage changes. Correct.

The reason, stated so I can defend it: a Shift is a **record of something that
happened.** It is not a live calculation. If a shift's pay is derived by looking
up the job's current rate, then every raise silently rewrites history, and last
year's earnings — the thing this app exists to report accurately — become wrong.

So the rate has to be **copied onto the shift row** when the shift is created.
Denormalization, deliberately. The general rule underneath it:

> Anything that describes a past event gets stored with that event. Anything
> that describes the current state of the world gets looked up.

The Job's rate is current state — it's the default for the *next* shift. The
rate on a Shift row is history and never changes.

This same reasoning will come back in Layer 2, since tax rates also change year
to year.

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
