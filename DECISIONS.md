# Decisions

Every real technical decision on tip-tracker, numbered so it can be referenced
from anywhere else (`see D3`) instead of restating the reasoning.

Rejected alternatives stay in this file permanently. "Here's what I didn't do
and why" is worth more than the decision alone, and a decision with no visible
alternatives isn't a decision, it's an assumption.

Companion docs: `BRAINSTORM.md` for the learning log and open questions,
`schema.sql` for the data model.


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

#### The decision one level up (already settled, worth noting)

React Native vs Flutter vs native Swift + Kotlin was never close here. Flutter
means learning Dart. Native means learning two languages and maintaining two
codebases. React Native reuses React, which you already know. One codebase, two
stores.

The tradeoff being accepted: React Native apps can feel very slightly less
native than hand-written Swift, especially in complex animations. For a
form-and-charts app, that gap is not where quality will be won or lost — the
UI/UX bar from the product definition is achievable here.

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

### D4 — Shifts get a tombstone too, from day one (2026-07-30)

> **Decision:** `shifts` gets a `deleted_at` column. Deleting a shift sets the
> timestamp and the row stays. Same mechanism as `jobs.archived_at` (D3), named
> differently because the user's intent differs: archiving a job means "I don't
> work there anymore", deleting a shift means "that was a mistake".
>
> **Alternatives:**
> - Hard delete shifts in MVP, add the column in a migration once sync exists
> - Never allow deleting a shift, only editing it
>
> **Why:** This came out of a review that spotted D3 and the schema disagreeing.
> D3 argues a hard delete is invisible to a device that never saw the row, which
> is why jobs get tombstones — and then shifts were hard-deleted anyway.
>
> The tiebreaker is which mistake can be undone. Adding the column and never
> needing it costs one nullable column that can be dropped. Skipping it and
> later needing it cannot be undone: users delete shifts for a year, sync
> arrives, and there is no tombstone to send for a row that no longer exists,
> so the shift reappears on the second device. In an app whose entire claim is
> that your income history is accurate, a deleted shift coming back is a
> correctness bug, not a cosmetic one — and it is discovered after real people
> have real data.
>
> YAGNI pushes the other way and is usually right, but its actual target is
> speculative *abstraction* you cannot remove later. A nullable column with a
> written reason is not that.
>
> Worth knowing this is the ordinary answer rather than a clever one. Every
> syncing local-first library — WatermelonDB, PouchDB, Realm, libSQL sync —
> keeps deletion tombstones on every table that syncs.
>
> **Known cost:** two of them. Tombstones accumulate forever without a purge
> policy, so eventually rows need dropping once every device has seen the
> delete — a sync-era problem, not one for now. And the missing-filter footgun
> D3 flagged for jobs now applies to a second table: every query listing shifts
> needs `deleted_at IS NULL`. That is the argument for writing both list queries
> in one place rather than repeating the filter at each call site.
>
> **Revisit when:** the purge policy is needed, which is when sync ships (D1).


### D5 — Round wages per shift, not once per total (2026-07-30)

> **Decision:** A shift's wage is `Math.round(minutes * hourly_rate_cents / 60)`
> — rounded to whole cents for that one shift. Totals sum those already-rounded
> numbers. The multiplication happens before the division so the arithmetic
> stays on integers as long as possible.
>
> **Alternatives:**
> - Sum the unrounded wages and round once at the end
> - Store a `wage_cents` column on `shifts`, computed at write time
> - Keep fractional cents in a decimal library and round only for display
>
> **Why:** Minutes divided by 60 is usually not a whole number of cents. A
> 7h35m shift at $15.50/hr earns 11754.166… cents. Something has to round, and
> the only question is where.
>
> Rounding per shift is the one a user can verify. The totals row sits directly
> above a list of individual shifts, so anyone who adds the rows up by hand must
> get the number in the summary. Rounding once at the end breaks that: the total
> can land a cent or two off the sum of what the rows display, and "your app's
> math is wrong" is the report that follows. Two 30-minute shifts at $15.01/hr
> are the smallest case — 751 + 751 = 1502 per shift, versus 1501 rounded once.
>
> It also generalizes, which the alternative does not. `hourly_rate_cents` is
> stored per shift on purpose, so a raise can't rewrite last year (see the data
> conventions in `CLAUDE.md`). Once two shifts have different rates you cannot
> sum hours and multiply once anyway — there is no single rate to multiply by.
> Per-shift rounding is the only rule that works for both cases.
>
> A stored `wage_cents` column was rejected because it's derived data: it can
> disagree with the columns it came from after an edit, and there's no
> performance problem to justify the risk at a few thousand rows. A decimal
> library was rejected as a dependency for something integer cents already
> solve.
>
> **Known cost:** this is not exactly what a paystub shows. A real employer
> sums hours across a pay period at one rate and rounds once, which can differ
> by a cent from summing per-shift. That gap is smaller than the thing this app
> is actually for — cash tips nobody withholds against — and it is the correct
> tradeoff for a screen whose rows must add up. Worth revisiting when paycheck
> estimates arrive, since matching a real stub is the whole point there.
>
> **Revisit when:** paycheck estimation ships (Layer 2). That feature's job is
> to predict a specific employer's number, so it may need pay-period rounding
> alongside this. This rule stays correct for "what did I earn," which is what
> the totals row answers.
