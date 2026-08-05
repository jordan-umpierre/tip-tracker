# Decisions

Every real technical decision on tip-tracker, numbered so it can be referenced
from anywhere else (`see D3`) instead of restating the reasoning.

Rejected alternatives stay in this file permanently. "Here's what I didn't do
and why" is worth more than the decision alone, and a decision with no visible
alternatives isn't a decision, it's an assumption.

Companion docs: [roadmap.md](roadmap.md) for what is next,
[learning/](learning/) for the question-and-answer log, and
`src/data/schema.sql` for the data model.

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

### D3 — Soft delete for jobs, not cascade (2026-07-29; revised 2026-08-03)

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
> The requested job-removal UI now uses this one archive path. Its confirmation
> says that shift and trend history stays; active Log/import choices exclude
> the job, while historical screens read all jobs so old rows keep their name.
> The last active job can be removed without hiding its history.
>
> **Revisit when:** users need restore, or user research shows that permanently
> erasing a zero-shift mistake is meaningfully different from hiding it. Do not
> add a second deletion path merely because the archived row still exists.

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


### D5 — Round wages per shift, not once per total (2026-07-30; revised 2026-08-03)

> **Decision:** A shift's wage is
> `Math.round(duration_seconds * hourly_rate_cents / 3600)` — rounded to whole
> cents for that one shift. Totals sum those already-rounded numbers. The
> multiplication happens before the division so the arithmetic stays on
> integers as long as possible.
>
> **Alternatives:**
> - Sum the unrounded wages and round once at the end
> - Store a `wage_cents` column on `shifts`, computed at write time
> - Keep fractional cents in a decimal library and round only for display
>
> **Why:** Seconds divided by 3600 is usually not a whole number of cents. A
> 7h35m shift at $15.50/hr earns 11754.166… cents. Something has to round, and
> the only question is where. D12 changed the duration unit, not this rounding
> boundary.
>
> A shift is the smallest earnings record in the app, and each one carries its
> own historical rate. Turning that record into whole cents before adding it to
> a total gives every screen one reusable definition of "this shift's gross."
> Rounding only after summing would make the total depend on which shifts happen
> to be grouped together. Two 30-minute shifts at $15.01/hr are the smallest
> case — 751 + 751 = 1502 per shift, versus 1501 rounded once.
>
> `hourly_rate_cents` is stored per shift on purpose, so a raise can't rewrite
> last year (see `src/data/schema.sql`). Once shifts have different rates, wage
> calculations already have to happen per shift; rounding at that same boundary
> keeps the rule local and testable.
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
> tradeoff for a shift tracker whose totals are built from discrete shift
> records. Worth revisiting when paycheck estimates arrive, since matching a
> real stub is the whole point there.
>
> **Revisit when:** paycheck estimation ships (Layer 2). That feature's job is
> to predict a specific employer's number, so it may need pay-period rounding
> alongside this. This rule stays correct for "what did I earn," which is what
> the totals row answers.

### D6 — Edit hours at round-trip-safe precision (2026-07-30; revised 2026-08-03)

> **Decision:** When `LogShiftForm` pre-fills the hours field for an existing
> shift, it renders `duration_seconds / 3600` to at most **four** decimal
> places, not raw and not at the one-decimal precision `ShiftList` displays.
> Money fields pre-fill at two decimals for the same reason.
>
> **Alternatives:**
> - Leave it raw — the status quo, which showed `7.583333333333333`
> - Match the list's one-decimal display, so both read `7.6`
> - Replace the decimal-hours input with hours, minutes, and seconds controls
> - Store whatever the user typed alongside the canonical seconds
>
> **Why:** Seconds are the stored truth and decimal hours are a lossy view of
> them, so the only safe display precision is one that converts back to the
> same number of seconds. Saving runs `Math.round(hours * 3600)`, which makes
> this checkable rather than a matter of taste.
>
> Four decimals round-trip for every second from 1 to 86,400; the test checks
> that full range. Three decimals do not. The failure is not cosmetic: a
> 27,300-second shift shown as `7.6` saves as 27,360 seconds, so merely opening
> a shift and pressing save would rewrite it. Matching the list would have
> been the obvious change and it quietly corrupts data on every edit.
>
> Separate duration controls are the genuinely correct fix, because they
> remove the lossy conversion instead of choosing a safe precision within it.
> Not done now: it changes the shape of the primary input on the one screen
> this project has committed to obsessing over, which deserves its own pass
> rather than being smuggled into a bug fix.
>
> **Known cost:** the same shift now reads `7.5833` in the edit field and `7.6`
> in the list. Two renderings of one value is a real inconsistency. It is the
> lesser problem — a display that disagrees with itself is visible and
> annoying, whereas silently rewriting stored seconds is invisible and
> permanent.
>
> **Revisit when:** the hours input becomes hours/minutes/seconds controls.
> That removes the conversion this decision is working around, and both this
> rule and the mismatch it causes disappear with it.

### D7 — Add Expo Router when Layer 1 introduces the second screen (2026-07-31)

> **Decision:** Use Expo Router for application navigation. Route files live
> in `app/` and stay thin; components, SQLite access, and pure calculations
> remain under `src/`. Introduce it now, when Trends creates the first real
> navigation boundary, rather than before the app has multiple screens.
>
> **Alternatives:**
> - Keep one entry component and switch between Log and Trends with
>   `useState`
> - Configure React Navigation directly
>
> **Why:** A state toggle is the smallest answer for exactly two views, but
> Layers 2 and 3 already name several more screens: tax profile, paycheck and
> year-end estimates, mileage, and expenses. Those are written product scope,
> not hypothetical scale, so the toggle would be knowingly temporary.
>
> React Navigation directly is fully valid in an Expo app and offers more
> precise control over navigation state, URL parsing, and navigator structure.
> This app has no requirement for that extra control. Expo Router uses React
> Navigation underneath while adding the file-based route structure, typed
> routes, and automatic linking Expo recommends for SDK 57 projects. Choosing
> the lower-level API would add configuration without a current consumer.
>
> Waiting until the second screen keeps the decision proportional: routing
> would have been premature in Layer 0, but avoiding it now would create code
> the existing roadmap already tells us to replace.
>
> **Known cost at decision time:** the old `index.ts` → `App.tsx` entry flow
> needed to migrate to an `app/` route tree, and the state `App.tsx` owned
> needed a deliberate home. D11 settled that ownership before implementation;
> the migration completed in `341274c` and `0c7eb92`. File locations are now
> part of route behavior, so moving a route is not merely filing.
>
> **Revisit when:** navigation needs custom state restoration or URL parsing
> that Expo Router cannot express cleanly, or a required navigation feature
> forces work against the router instead of with it.

### D8 — Calculate Layer 1 Trends in pure TypeScript (2026-07-31; revised 2026-08-03)

> **Decision:** Group shifts by weekday, month, and year and calculate
> tips-per-hour in a pure module under `src/lib/`. The functions take `Shift[]`
> and return integer-second / integer-cent result objects. They do not query
> SQLite or format display strings.
>
> **Alternatives:**
> - Add SQLite aggregate queries using `GROUP BY`
> - Split the work: group in SQLite and finish calculations in TypeScript
>
> **Why:** `listShifts()` already reads every non-deleted shift because the Log
> screen displays that complete history, and `App.tsx` already keeps the array
> in memory. Layer 1 can derive its summaries from the same data without a
> second query path. At the documented scale—a few thousand rows at most—one
> linear pass is not a meaningful performance cost.
>
> This follows the boundary established by `totals.ts`: SQLite owns persisted
> facts; `src/lib/` owns derived arithmetic. Keeping Trends pure makes money and
> date grouping runnable under Node with hand-built `Shift` values, without a
> device, database setup, or duplicated fixtures.
>
> SQL aggregation would be the right answer if the app no longer loaded the
> underlying rows. It is not inherently more professional to push arithmetic
> into a database; doing so now would add queries and SQLite-specific date logic
> without reducing the existing read.
>
> **Known cost:** calculation is O(n) and requires the complete shift array in
> memory. Calendar grouping must not use `new Date("YYYY-MM-DD")`, which treats
> a date-only string as UTC and could repeat the date bug fixed in Layer 0.
> The pure tests must pin weekday and month boundaries.
>
> This decision does not constrain sync. A future device can still calculate
> Trends from its local SQLite copy while offline, and a server can add its own
> Postgres aggregates for web or large-history use without changing the mobile
> data model.
>
> **Revisit when:** shifts are paginated or no longer all loaded, a measured
> Trends calculation becomes slow, or a server endpoint needs to return
> summaries without sending the underlying rows.

### D9 — Keep exact text around one focused income chart (2026-07-31; revised 2026-08-03)

> **Decision:** Make one chronological gross-income line the first content on
> Trends. Keep its exact gross, wage, tip, duration, date, and scope in text;
> horizontal touch inspection changes those values to the nearest point.
> Render the path with `react-native-svg`, not a general chart framework.
>
> Keep the fixed seven-weekday comparison as vertical React Native `View`s and
> keep month/year summaries as numeric rows. Use the existing blue accent for
> income. Red remains destructive; lower income is not an investment loss.
>
> **Alternatives:**
> - Display numbers and weekday bars only
> - Plot wage, tips, and gross as three permanent lines
> - Install a full chart library
> - Copy an investment chart's red/green gain and loss language
>
> **Why:** Multi-year CSV history created the condition that originally would
> justify revisiting this decision: many chronological points and touch
> inspection are now real requirements. A single gross line answers the main
> question without the density of three overlapping series. Exact visible text
> and an adjustable accessibility action keep shape and color from becoming
> the only way to read the data.
>
> SVG supplies only the path primitives this screen needs and is supported by
> Expo Go. Range controls, bucketing, scaling, and touch selection remain small
> app-owned code; a chart framework would add a larger API and bundle surface
> without supplying a currently requested interaction.
>
> **Known cost:** the app owns a fixed line-chart layout and nearest-point
> selection. It does not provide zoom, free-form dates, comparison overlays, or
> period paging. Scrubbing and paging are not assigned to the same horizontal
> gesture because their outcomes conflict; range buttons select the time scale.
>
> **Revisit when:** users need comparison series, custom dates, zooming, or
> explicit navigation to an older week/month at its original resolution.

### D10 — Define Trends as scoped, weighted calendar summaries (2026-07-31; revised 2026-08-03)

> **Decision:** Trends defaults to all jobs and offers one job filter that
> applies to the entire screen. The summary card is scoped to the chart's
> selected range; the weekday, month, and year breakdown uses all recorded
> non-deleted shifts in the job scope. Do not persist the selected filter or
> range in Layer 1.
>
> **Formulas and outputs:**
> - Both summaries cover exactly the shifts the chart drew: every shift whose
>   `shift_date` falls between the series' start date and its anchor date,
>   inclusive, then narrowed to the job scope. The chart and the card therefore
>   cannot describe different sets, which is asserted per range by summing the
>   series points and comparing.
> - The default summary is **Per hour**: gross per hour,
>   `round(total gross cents * 3600 / total duration seconds)`, total gross,
>   and total duration. It does not repeat the full-history shift count in the
>   headline.
> - A **Per week** choice shows average gross and hours per **worked week**.
>   A worked week is a Sunday-Saturday calendar week containing at least one
>   logged shift in the selected job scope. Divide total gross cents and total
>   duration seconds by the number of unique worked weeks, rounding back to
>   whole cents and seconds. All jobs counts an overlapping week once.
> - Each weekday uses the same gross-per-hour formula over that weekday's
>   shifts:
>   `round(total gross cents * 3600 / total duration seconds)`.
> - Total gross first calculates and rounds each shift's wages under D5, then
>   sums those shift-level gross values before deriving a rate.
> - Rates are weighted by time. Never average the per-hour values of individual
>   shifts, because a short shift would count as much as a long one.
> - Weekday rates retain shift count and total duration as sample context.
> - Month and year rows are calendar periods derived from `shift_date`. Each
>   shows gross, tips, total duration, and shift count. The current incomplete
>   month or year remains visible and is labeled as being to date.
> - A group with no shifts has no rate. Represent it as `null` and display
>   "No shifts," not `$0.00/hr`; no observations and a measured zero are
>   different facts.
> - The chart defaults to 3M. Its fixed choices are 1W (7 daily points), 1M
>   (30 daily points), 3M (13 Sunday-start weekly points), 1Y (12 monthly
>   points), YTD (January through the newest shift's month), and All (one point
>   for every month from first through last shift). Each range anchors to the
>   newest shift in the selected job scope rather than the device clock, and
>   missing periods are explicit zero points. YTD is the only range anchored to
>   a calendar boundary instead of rolling backwards, so it shrinks to a single
>   point each January.
> - Each range names its window as a date range built from that window's start
>   and the newest shift in it, rather than describing the calculation that
>   produced it. Ranges measured in months name months; the rest name days.
> - Each chart point sums D5 gross, tips, and duration for its calendar bucket.
>   The line shows gross only; touch inspection exposes the exact breakdown.
>   This is recorded gross under the current contract, not overtime-adjusted
>   or after-tax income until D14's required profiles exist.
>
> Exact calculation results remain integer cents and integer seconds under D8.
> Formatting hours and money into strings remains a component concern.
> Weekday is the default breakdown because it is the only view that compares
> like periods against each other rather than listing history in order, which
> the chart above already does better. Weekday, Month, and Year are mutually
> exclusive views, ordered default-first and widening to the right; the screen
> does not stack every historical row into one long page.
>
> **Alternatives:**
> - Default to one job
> - Average the rate calculated for each shift
> - Keep tips per hour as the headline
> - Show both gross per hour and tips per hour in every weekday row
> - Add a current-month, rolling-window, or custom-date default
> - Average over every elapsed calendar week, including weeks with no shifts
> - Render weekday, month, and year sections simultaneously
> - Keep the summary on all history regardless of the selected chart range
>   (what shipped through 2026-08-03)
> - Scope the breakdown to the chart range as well, for one scope per screen
>
> **Why:** All jobs is the only non-arbitrary default and answers the first
> question most users have: what the work they logged earned overall. The
> visible job filter supplies the analytically cleaner comparison when jobs
> have different wages or tipping patterns. The job scope still controls the
> whole screen, so no figure on it can silently describe a different job than
> the one selected.
>
> The date scope is deliberately not uniform, which this decision originally
> forbade. Changing the chart range while the number under it stayed fixed made
> the range buttons look broken, so the summary follows the range. Applying the
> same range to the breakdown was rejected on what it produces: under 1W, the
> Month and Year views collapse to a single row and the weekday bars drop to
> whichever days that week happened to include, which is a worse chart than
> the all-history one it replaced. The card names its own window on every
> render, so the two scopes are stated rather than inferred.
>
> Gross per hour is both the headline and weekday metric because the product
> question is what the user's time actually earned after hourly wages and tips
> are combined. Physical iPhone testing showed that tips per hour alone was not
> a satisfying top-level answer. Tips remain visible in month and year totals;
> keeping a second hourly headline would add density without answering a new
> primary question.
>
> All time leads because it answers "what has this work earned" without the
> worked-week denominator needing to be explained first. Weekly average was the
> default until 2026-08-03; device use showed the weekly framing is the more
> specific question, worth a tap rather than worth landing on. It sits second in
> the row to match, since a selected chip that is not the leftmost one reads as
> though a default was turned off.
>
> Worked weeks avoid calling an unlogged or unemployed week a measured zero.
> Including empty weeks would require an employment start/end date the app does
> not store. The label says "worked week" so the denominator is visible rather
> than implied. Calendar months and years still match the language people use
> for earnings records and statements.
>
> **Known cost:** an all-jobs weekday rate can reflect the mix of jobs as much
> as the weekday itself, and an all-history rate may become less representative
> as working conditions change. The explicit scope label, job filter, and
> sample context make those limits visible but do not remove them.
>
> The summary and the breakdown now answer over different date ranges on one
> screen. The window label in the card is the only thing distinguishing them,
> and a user who does not read it can compare a 1W rate against an all-history
> weekday chart and think they are the same measurement.
>
> **Revisit when:** real use shows old shifts obscuring current patterns, users
> ask for a separate tip-efficiency view, or a remembered job/date filter
> becomes more useful than the predictable all-jobs/all-history default.

### D11 — Use native peer tabs with route-owned SQLite reads (2026-08-01; revised 2026-08-03)

> **Decision:** Make Trends and Log two static root tabs using Expo Router's
> SDK 57 `NativeTabs`, with Trends mapped to the index route and shown first.
> Keep route files under `app/` thin and keep screen composition under
> `src/screens/`. Do not add nested stacks until a tab has a real child route.
>
> Each screen owns its loading state and reads through the existing SQLite
> data functions when it gains focus. SQLite remains the source of truth; do
> not add a shared React context or external state store. Preserve the old root
> component's wiring responsibility under `LogScreen.tsx` once Expo Router
> owns the actual entrypoint.
>
> **Alternatives:**
> - Push Trends onto a stack from the Log screen
> - Use Expo Router's stable JavaScript tabs
> - Build a custom tab bar
> - Put jobs and shifts in a shared React context
> - Add Redux, Zustand, React Query, or another state dependency
> - Keep the `App.tsx` name after it stops representing the application root
>
> **Why:** Log and Trends are peer destinations a user moves between
> repeatedly. A stack is the right shape for details and temporary flows, but
> would make Trends secondary and less discoverable. Future details can gain a
> stack inside the relevant tab when the first such screen exists.
>
> Native tabs support the product's native-feeling UI goal without making the
> app own tab accessibility, safe areas, animation, and platform behavior.
> Their unstable API is contained in one layout file, the dependency is pinned
> by the lockfile, and replacing that layout with JavaScript tabs would not
> change route or screen code. Do not use deeper unstable escape hatches.
> `disableTransparentOnScrollEdge` keeps the bar opaque when long React Native
> lists do not report a reliable scroll edge; automatic content insets remain
> enabled instead of guessing a tab-bar height.
>
> Route-owned reads reuse `listActiveJobs()` and `listShifts()` rather than
> creating another query implementation. At a few thousand local rows, one
> read when a route is focused is cheaper than maintaining a second in-memory
> source of truth and an update protocol for two screens. A shared provider
> becomes justified by shared unsaved state or a measured read problem, not by
> the mere existence of a second screen.
>
> **Known cost at decision time:** each screen has its own
> loading/error/refresh logic, tab focus performs another SQLite read, and the
> native-tabs API may change during an Expo upgrade. Native tab behavior and
> insets had to be checked on both platforms; the physical-iPhone and
> Android-emulator acceptance passes are now recorded.
>
> **Revisit when:** native tabs remain unstable near release or cause a device
> defect; a tab gains a child route; several screens duplicate substantial
> loading logic; screens need shared unsaved state; or background sync must
> update a visible screen immediately.

### D12 — Store duration as integer seconds, not hundredths of an hour (2026-08-03)

> **Decision:** `shifts.duration_seconds` is the canonical duration. Version 2
> renames the old `minutes` column and multiplies every value by 60 inside one
> transaction. CSV hours with two decimal places convert as
> `hundredths * 36`, also without rounding.
>
> **Alternatives:**
> - Keep integer minutes and round imported values
> - Store integer hundredths of an hour because the first import source does
> - Store decimal hours in SQLite `REAL`
>
> **Why:** The supplied export contains 495 shifts that are not whole-minute
> durations. Rounding them would change wage calculations before the user even
> sees the preview. Integer seconds preserve both histories exactly: every old
> minute is 60 seconds and every source hundredth is 36 seconds.
>
> Hundredths would also preserve this one file, but it is a source format, not
> a neutral time unit. It cannot represent an existing one-minute shift
> exactly, while seconds represent minutes, hundredths, and future clock-based
> durations. SQLite `REAL` was rejected for the same reason money never uses
> floating point: exact stored facts should not depend on binary decimal
> approximations.
>
> The migration and its `PRAGMA user_version = 2` marker commit together. Its
> runnable test compares every non-duration field, archived relationship, and
> tombstone before and after migration, then forces a failure to prove the
> version-1 database rolls back intact.
>
> **Known cost:** editable decimal hours need up to four places to round-trip
> any whole second under D6. Display-only hours can remain rounded to one
> decimal because they are never saved.
>
> **Revisit when:** the product records sub-second work, which a shift tracker
> does not currently need, or imports real start/end times that justify a
> different input control. The integer-second storage unit still remains valid.

### D13 — Import one CSV contract atomically and append-only (2026-08-03)

> **Decision:** The first importer supports the supplied nine-column contract
> only. A user chooses one saved job, picks a document, reviews a complete
> preview and any conflicts, then confirms one append-only SQLite transaction.
> Any invalid row blocks the import. Existing rows are never changed, merged,
> or silently deduplicated.
>
> **Alternatives:**
> - Build a generic column-mapping screen for arbitrary exports
> - Import valid rows while skipping invalid ones
> - Automatically merge same-day rows or discard likely duplicates
> - Trust the source's `Daily Income` value as stored truth
> - Add a general CSV dependency before a second format exists
>
> **Why:** A financial-history import is a trust boundary. Partial success or
> guessed merging leaves the user with a dataset that looks complete but is
> not. The preview makes the transformation visible; the transaction makes it
> all-or-nothing; overlap and exact-match warnings leave the final choice with
> the user.
>
> The adapter parses money and duration as integers. Cash and credit tips are
> combined because the current schema stores one tip total. `Daily Income` is
> checked but recalculated under D5 because the supplied file has one one-cent
> disagreement. Blank or `no data` start/end times must appear as a pair and
> become null. Otherwise both fields must use strict 12-hour `h:mm AM/PM`
> values; the importer normalizes them to stored `HH:MM`. One-sided or
> malformed times block the entire file. This bounded contract is pinned by
> synthetic midnight, noon, overnight, case, leading-zero, malformed, and
> rollback-gate assertions. The supplied Breadmaker export contains only `no
> data`, so a real timed Breadmaker file still needs evidence. A private,
> tested RFC 4180 state machine is smaller than a production dependency for
> one known layout.
>
> **Known cost:** importing the same file twice creates duplicates if the user
> confirms past the warning. Other tip trackers remain unsupported until their
> real exports are inspected. Some Android document providers expose an opaque
> identifier instead of the original filename, so content and headers—not the
> extension—are the validation boundary.
>
> **Revisit when:** a second real export needs a different adapter, users need
> undo for large imports, or sync introduces a durable import identity that can
> prevent cross-device duplication without guessing.

### D14 — Keep overtime and taxes profile-driven (2026-08-03; revised 2026-08-04)

> **Decision:** Do not change recorded gross with a universal overtime toggle
> or flat tax percentage. Overtime begins as an opt-in job setting with the
> employer's fixed workweek boundary and the user's known time-and-a-half
> arrangement. Tax begins as the already-planned opt-in, federal-only W2
> profile. Tax estimates consume overtime-adjusted wages only after both
> profiles are configured.
>
> **Alternatives:**
> - Apply 1.5x automatically after 40 hours in every Sunday-Saturday week
> - Let the user enter one tax percentage and call the result take-home pay
> - Add all state, local, tipped-credit, and 1099 rules in the first release
>
> **Why:** Federal overtime is based on a fixed recurring 168-hour workweek,
> not an arbitrary calendar range, and covered nonexempt employees generally
> receive at least 1.5 times their regular rate after 40 hours. State law can
> impose a higher standard, and tipped employees using a tip credit have
> additional overtime rules. The app currently stores a date and duration, not
> the employer's workweek start time, eligibility, or tip-credit arrangement.
> ([DOL Fact Sheet 23](https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay),
> [DOL Fact Sheet 15](https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa))
>
> Federal withholding likewise depends on the tax year, filing status, pay
> frequency, W-4 inputs, and other income/adjustments; a flat percentage would
> be easy code and a false product claim. The 2026 withholding methods also
> include current-law handling for qualified tips and overtime, so tax rules
> need an explicit version rather than timeless constants.
> ([IRS Publication 15-T](https://www.irs.gov/publications/p15t))
>
> **Known cost:** this makes overtime/tax a separate implementation phase and
> requires configuration before showing net estimates. That friction is safer
> than silently giving a service worker the wrong number.
>
> **Revised 2026-08-04 — where the overtime number appears.** Once a job is
> configured, the gross shown on Log and Trends is the overtime-adjusted one,
> carrying an explicit estimate label, rather than an adjusted figure sitting
> beside an unadjusted one. Two numbers for the same week was the alternative
> and it was rejected as the more confusing of the two: a user comparing them
> has no way to know which is the one their employer will pay.
>
> Estimate labels follow the displayed scope. An individual shift or selected
> job is labeled estimated only when that job has overtime enabled. An All jobs
> or collapsed calendar group is labeled estimated when any job inside that
> scope has overtime enabled, even though unconfigured jobs keep their recorded
> gross. Otherwise a mixed total could contain an estimate while presenting the
> whole number as recorded fact.
>
> The prohibition this decision opens with still holds and is narrower than it
> first reads. It rules out a *universal* toggle, not display. What stays true
> either way: `shifts` rows keep their own recorded values untouched, so
> nothing stored is ever an estimate, and **the CSV export keeps exporting
> recorded gross rather than adjusted**. An export is a backup of what
> happened; if a misconfigured workweek leaked into it, the backup would be
> wrong with nothing on the file to say so.
>
> **Revisit when:** the first profile is specified. The smallest defensible
> release is a clearly labeled estimate for a configured 40-hour, 1.5x job and
> 2026 federal W2 taxes. State/local, 1099, varying-rate regular-pay rules, and
> tip-credit edge cases stay explicitly unsupported until their required inputs
> and tests exist. Non-midnight workweek boundaries were in that list until
> D18 stored the inputs they need.

### D15 — Collapse the shift history into a year/month/week tree (2026-08-03; revised 2026-08-03)

> **Decision:** The Log nests shifts under year, then month, then week rows,
> each carrying its own gross and shift count. Everything starts collapsed, so
> the tab opens to one row per year. The tree is flattened into one array of
> typed rows and rendered through a single `FlatList`. Expansion state stores
> only the groups the user has tapped.
>
> **Alternatives:**
> - Keep the flat, fully expanded list and rely on virtualization alone
> - Month sections with sticky headers but nothing collapsed
> - Month sections, collapsed, one level deep (what shipped first, 2026-08-03)
> - Open the newest year, month, and week by default (shipped 2026-08-03,
>   replaced the same day)
> - A month stepper showing exactly one month at a time, with no full scroll
> - Infinite scroll paging in older shifts as the user reaches the bottom
> - Nested `FlatList`s, one per level
>
> **Why:** virtualization solved the rendering cost of 845 rows but not the
> navigation cost. Every row looked alike and nothing said where in five years
> of history the scroll had landed. One level of collapsing fixed the distance
> between months but not within them: an open month of thirty shifts is still a
> long list, and it was still the first thing on the tab. Three levels reduce
> five years to one row per year.
>
> Opening the newest branch by default was tried first, on the reasoning that
> the current week is what a user most often wants to see. It reintroduced the
> scrolling the tree existed to remove and left the screen too tall to sit
> centered, so the default is now fully closed and reaching this week costs
> three taps. The stepper was rejected because it removes the ability to scan across
> months at all, and comparing a slow month against the one before it is a
> normal thing to want. Paging was rejected as the same infinite scroll with
> extra machinery. Nested lists were rejected outright: scrollers inside
> scrollers fight over the same gesture and the inner one loses virtualization,
> which is the thing making a long history cheap.
>
> **Known cost:** collapsed groups hide their rows from search-by-scrolling,
> and there is no expand-all — worse now than at one level, since every shift
> is three closed groups deep from a cold open, including the one just logged. Sticky headers were lost in the move off
> `SectionList`; they were solving orientation mid-scroll, which a
> collapsed-by-default tree does not have enough scroll to need. A week
> crossing a month boundary is split so that each month's rows add up to its
> own header, which means one calendar week can appear twice under different
> months. Group subtotals also duplicate a calculation the Trends tab presents,
> so both have to keep using the same D5 per-shift gross or they will disagree
> in front of the user.
>
> **Revisit when:** a shift search or a job filter lands on the Log. Either one
> changes what "the newest group" should default to, and a filtered result set
> probably wants every matching group open instead.

### D16 — Export in the app's own CSV format, not the import contract (2026-08-03; revised 2026-08-04)

> **Decision:** Exported CSVs use their own columns — `Date`, `Job`, `Hours`,
> `Duration Seconds`, `Hourly Rate`, `Tips`, `Gross`, `Note`, `Start Time`, and
> `End Time` — rather than the nine-column contract D13 defined for import.
> The two time columns were appended in 2026-08-04 so the established column
> order did not move. Timed shifts emit stored `HH:MM`; untimed shifts emit
> blanks. `Gross` remains recorded D5 gross, never the overtime estimate shown
> on screen. Duration appears twice: `Hours`
> to two decimals for people and spreadsheets, `Duration Seconds` as the exact
> stored value. Rows are oldest first, tie-broken by id, so two exports of the
> same data are byte-identical. Files are written wherever the user chooses via
> `Directory.pickDirectoryAsync`, named `tip-tracker-shifts-<date>-<time>.csv`
> so repeated exports sit beside each other rather than colliding. A canceled
> picker is recognized by its message and returns silently; only a genuine
> failure logs and alerts.
>
> **Alternatives:**
> - Emit the nine-column import contract so exports can be re-imported
> - Emit only `Hours`, dropping the exact seconds
> - Add `expo-sharing` and open the system share sheet instead of a picker
> - Use React Native's built-in `Share` with a file URI
> - Export JSON instead of CSV
> - Treat every throw from the export path alike, cancel included (shipped
>   2026-08-03, replaced 2026-08-04)
> - Name the file by date alone (shipped 2026-08-03, replaced 2026-08-04)
> - Overwrite an existing export of the same day via `create({ overwrite: true })`
> - Check `file.exists` and ask the user before replacing
>
> **Why:** the import contract stores `Hours` to two decimals, which is
> 36-second granularity. A shift stored as 27300 seconds — 455 minutes, the
> shape every row from the pre-D12 minutes column has — is 7.5833… hours and
> rounds to 7.58, losing 30 seconds on the way out. Export is the first half of
> the backup story the roadmap places before public tax projections, and a
> backup that silently rounds the data it is protecting is not one. Keeping the
> exact seconds costs one extra column.
>
> Round-tripping was the real thing given up, and it is worth being clear that
> it was a choice: this spreadsheet export cannot currently be re-imported,
> because the importer only accepts D13's contract. It now preserves shift
> times, duration, money, and notes, but it is not a complete database backup:
> stable ids, timestamps, tombstones, jobs, and job settings are absent.
> Lossless backup/restore therefore needs a separate versioned JSON contract.
>
> `Directory.pickDirectoryAsync` over the sharing alternatives because
> `expo-file-system` is already a dependency for the import picker, so this
> adds none. React Native's built-in `Share` was rejected on portability: it
> carries a file URI on iOS but ignores it on Android, where it only shares
> text. CSV over JSON because the file's job is to open in a spreadsheet.
>
> The cancel handling is a correction, and it took two passes because the first
> attempt repeated the mistake it was fixing. This originally shipped claiming a
> canceled pick and a failed write were indistinguishable to the caller, so both
> logged at `console.error` and both raised the same alert. That was never
> tested, because until 2026-08-04 the export path had never run.
>
> The device pass surfaced a red LogBox toast on cancel. Reading
> `expo-file-system` 57 found a dedicated native exception on each platform —
> `FilePickingCancelledException` on iOS, `PickerCancelledException` on Android
> — and `expo-modules-core` derives an error code from each class name. That
> looked like a stable discriminator, so a code check shipped. It did not work,
> and it did not work for the same reason as the original: the derivation was
> read from source rather than observed. Logging the caught value on device
> showed the code never survives the crossing into JavaScript. What arrives is a
> plain `Error` carrying `message` and `stack`, nothing else.
>
> The message is therefore the only available signal, and both platforms share
> the phrase "was cancelled by the user". Matching on it is a heuristic on
> someone else's string, which is worth stating plainly rather than dressing up.
> It is acceptable because its failure is one-directional: a reworded or
> localized message means cancels log as errors again, which is noise and
> nothing worse, while wrongly swallowing a genuine failure would require that
> failure to describe itself as cancelled by the user.
>
> The filename carried only the date at first, and the same device pass showed
> why that was not enough. `Directory.createFile` throws
> `FileAlreadyExistsException` rather than replacing, so the second export of
> any day failed outright — and because the alert deliberately claims only that
> no file was written, it could not say why. The intent behind the date was
> right; a day was simply too coarse to carry it, so the name now includes the
> local time.
>
> Overwriting was the real alternative and is the better answer later, not now.
> An exported CSV is a derived artifact the app can regenerate at will, which
> normally makes replacing one free. That reasoning depends on the app still
> being there. With no restore path, these files are the only copy of the data
> that survives losing the device, so a name collision should cost some clutter
> rather than a backup. Revisit it when restore exists. Putting the fix in the
> pure filename function rather than the write path was the second reason:
> `create({ overwrite: true })` would put new behavior somewhere no local test
> can reach, on the one path where being wrong destroys a file instead of
> failing to make one.
>
> Doing nothing was reconsidered once the code check fell through, since the
> toast is dev-only and no user would ever see it. It lost on two facts. LogBox
> patches `console.warn` as well as `console.error`, so downgrading the severity
> recolors the toast rather than removing it. And the alert — the one part a
> user does see — cannot be removed without telling cancel apart from failure,
> so declining to distinguish leaves the only user-visible half unfixed. The
> logging still matters for later: once crash reporting exists, a miscategorized
> cancel arrives as a reported error, and the cost there is not noise but
> learning to ignore your own error reports.
>
> **Known cost:** two duration columns is redundancy a reader has to have
> explained, and nothing enforces that they agree — a future edit could write
> one and not the other. Two trailing time columns widen the spreadsheet. The
> export also has no importer, so "export" currently means "get readable data
> out", not "restore the database".
>
> Cancel detection depends on a message string this project does not own, and
> an Expo reword would break it silently. `pickerCancel.test.ts` pins both real
> messages and guards the pattern against being loosened to `/cancel/`, which
> would start hiding real write errors — but no local test can notice the day
> upstream changes its wording. That is why the failure direction was the
> deciding factor rather than the fragility itself.
>
> The right fix is upstream: `expo-file-system` raises a properly coded
> exception and then loses the code on the way to JavaScript. Worth reporting,
> not worth blocking on.
>
> **Revisit when:** spreadsheet round-trip becomes a real user need. Lossless
> backup/restore should use its own versioned JSON contract rather than making
> this human-readable CSV carry database internals. Re-check the cancel
> message on any `expo-file-system` upgrade, and drop the heuristic entirely if
> the error code ever starts reaching JavaScript.

### D17 — Build the calendar picker rather than depend on one (2026-08-04)

> **Decision:** The date field keeps its text input and gains a calendar
> alternative beside it, built in this repo. `buildMonthGrid` in
> `src/lib/monthGrid.ts` produces a fixed six rows of cells; `CalendarPicker`
> renders them in a bottom sheet with the days that already have a shift
> dotted. Months page by swipe or arrows, animated; the header opens a month
> and year chooser for anything further away. `expo-haptics` provides feedback
> on paging, on selection, and a distinct warning when the chosen date already
> has a shift.
>
> **Alternatives:**
> - `react-native-calendars` (spiked on device 2026-08-04, then removed)
> - `@react-native-community/datetimepicker`, the system picker
> - Text entry only, as before
> - `react-native-calendars` kept, with `react-native-gesture-handler` added to
>   repair its swipe
>
> **Why:** the dots decided it. Knowing a day already has a shift is the whole
> value of seeing a month at once, and the system picker cannot draw them. That
> ruled out the cheapest option immediately, and since nothing here shipped a
> date picker already, every remaining choice cost either a dependency or code.
>
> `react-native-calendars` was the reasonable default and was installed rather
> than argued about. It rendered, dotted, and selected correctly on RN 0.86 and
> React 19 — and its month swipe did not work, because it depends on
> `react-native-swipe-gestures`, which predates `react-native-gesture-handler`
> and does not survive the New Architecture. That left twelve packages,
> including `xdate`, `prop-types`, and a virtualized list this does not need,
> paying for a month grid whose gesture was broken. A package whose own
> dependency is non-functional on the target platform is not merely untidy: it
> is evidence the package is not tested against this stack, which predicts the
> next React Native upgrade rather than just this one.
>
> Building was cheap here for reasons that would not hold generally. The hard
> parts of a calendar — locale, week start, ranges, right-to-left — are all
> absent: this app is English-only, D10 already pins Sunday, and the field takes
> one date. What remained was a grid, and a grid is one pure function that Node
> can assert. The library's version of that logic could not have been tested at
> all by the direct-run pattern the rest of `src/lib/` uses.
>
> **Known cost:** accessibility and visual polish are now this project's
> problem. The neighbouring months rendered for the swipe are hidden from
> assistive tech, day cells carry spoken labels including whether a shift
> exists, and the two off-screen panes are excluded — all of which a mature
> library would have arrived with. None of it is covered by a test, because
> none of it is reachable from Node.
>
> The animation took three attempts, and the two failures are worth keeping.
> Both rendered three months and re-centred the strip after each page, which
> requires moving the strip and swapping its contents in the same instant.
> Doing that in the animation callback flashed the outgoing month. Moving it
> into `useLayoutEffect` did not help, and the reason matters: with
> `useNativeDriver` the transform lives on the native thread, so ordering
> JavaScript operations cannot fix a race between two threads. Positioning each
> month by its own distance from an anchor removes the re-centre entirely, and
> with it the race. Reach for that shape before reaching for effect ordering.
>
> **Revisit when:** the app needs localization, a date range, or a second
> calendar surface. Any of those changes the arithmetic above, and at that point
> a maintained library is worth re-pricing — checking first, as here, whether its
> gesture dependencies work on the React Native of the day.

### D18 — Store shift times and the employer's workweek (2026-08-04)

> **Decision:** Schema version 3. `shifts` gains optional `start_time` and
> `end_time` as local `HH:MM`; `jobs` gains `overtime_enabled`,
> `workweek_start_weekday` and `workweek_start_time`. Times do not define how
> long a shift was — `duration_seconds` stays authoritative — they only place a
> shift against a workweek boundary. A shift with no times counts wholly
> against its logged date, which is the midnight-boundary behaviour, and the
> estimate says so.
>
> **Alternatives:**
> - Support only a weekday boundary at midnight, storing no times at all
> - Support only Sunday at midnight, reusing `weekStartString` with no new setting
> - Make times `NOT NULL` and backfill the existing rows
> - Derive `duration_seconds` from the two times instead of storing both
>
> **Why:** federal rules define a workweek as a recurring 168-hour period that
> may begin on any day *at any hour*, so a boundary of "Tuesday at 6am" is
> normal and cannot be evaluated from a date alone. D14 had listed non-midnight
> boundaries as unsupported precisely because the inputs did not exist; this
> stores them. It also unblocks the CSV importer, which currently refuses any
> file carrying real Start Time or End Time values because there was nowhere to
> put them (D13).
>
> Optional rather than `NOT NULL` because 845 shifts already exist with no
> times and no way to recover them. A `NOT NULL` column would have forced a
> fabricated value into real history, which is the opposite of what the
> "history stores its own values" convention protects.
>
> Keeping `duration_seconds` authoritative rather than deriving it is the other
> half. Clock times are rounded to the minute and a shift's recorded length is
> not; deriving would let a rounded time silently rewrite a stored duration,
> and D6 already exists because that class of quiet rewrite happened once. It
> also makes `end_time` earlier than `start_time` a legal, meaningful state —
> an overnight shift — rather than a contradiction to resolve.
>
> **Known cost:** two facts about the same shift that nothing forces to agree.
> A four-hour duration can sit beside times eight hours apart and the database
> will accept it, because the alternative is worse. Validity is enforced by
> triggers rather than `CHECK` constraints, because SQLite cannot `ALTER` a
> `CHECK` onto an existing table — so `schema.sql` uses triggers too, to keep a
> freshly created database and a migrated one identical. `test-migration.sh`
> compares their resolved column order and triggers, since SQLite preserves
> source DDL text differently for fresh tables and `ALTER`-added columns.
>
> The 845 existing shifts can never be placed exactly against a non-midnight
> boundary. Anyone who configures one is getting the midnight approximation for
> all of their history and exact placement only for shifts logged afterwards.
>
> **Revised 2026-08-04 — minimize repeated entry.** With both times present
> and hours blank, the form derives elapsed duration and wraps overnight. An
> entered hours value still wins so unpaid breaks can differ from elapsed time.
> Blank tips mean zero. Tapping either time opens the platform's native time
> picker; iOS uses its 12-hour spinner while SQLite still receives normalized
> `HH:MM`. Edit mode leaves derived hours blank so changing either time
> recalculates, but preserves an entered duration when it differs from elapsed
> time until the user changes a time.
>
> **Revised 2026-08-04 — crossing the workweek boundary.** If a timed shift
> crosses the boundary and its paid duration differs from its clock span, split
> the authoritative seconds in the same proportion as elapsed time and keep
> the rounded remainder on the second side. The app does not know where an
> unpaid break occurred, so this deterministic approximation preserves every
> stored second without inventing a break time.
>
> **Revisit when:** a user reports overtime that disagrees with their pay stub.
> The first suspects are an overnight shift attributed to the wrong workweek,
> or a boundary configured against history that predates times.

### D19 — Separate lossless backup from readable CSV export (2026-08-04)

> **Decision:** Keep D13's source-specific CSV import and D16's readable CSV
> export, and add a separate versioned JSON backup contract for exact restore.
> Version 1 identifies itself as `tip-tracker-backup`, records schema version 3,
> and carries every stored column from every job and shift, including stable
> ids, timestamps, archived jobs, shift tombstones, overtime settings, exact
> integer cents and seconds, and optional shift times. It contains no derived
> gross, totals, or display-only hours.
>
> Restore validates the complete document before touching SQLite, then inserts
> jobs before shifts inside one exclusive transaction. It is empty-database
> only: if either table already contains a row, restore stops without changing
> anything. Ordinary `INSERT` statements, foreign-key checking, and a complete
> ordered row comparison must all succeed before the transaction commits.
>
> **Alternatives:**
> - Teach the app to restore from its readable CSV export
> - Replace the existing CSV formats with one universal import/export format
> - Merge a backup into the current database
> - Delete or replace current data before restoring
> - Export the SQLite database file directly
>
> **Why:** the readable CSV deliberately omits internal identity and lifecycle
> state. Even with shift times added, it cannot preserve job ids, archived
> status, overtime configuration, row timestamps, or deleted-shift tombstones.
> Rebuilding those values would produce a similar-looking history, not the same
> database, and missing tombstones could later resurrect deleted income rows.
>
> A separate machine-readable backup keeps the spreadsheet useful without
> pretending it is lossless. Empty-only restore is the smallest safe recovery
> boundary before sync exists. Merge needs conflict resolution and durable
> source identity; replacement risks destroying the only good local copy.
> Exporting the raw SQLite file preserves bytes but couples recovery to SQLite
> internals and schema migration behavior instead of a small validated contract.
>
> Version 1 is bounded to 10,000,000 UTF-8 bytes, 1,000 jobs, and 20,000
> shifts. That keeps whole-file parsing bounded on a phone while allowing more
> than fifty years at one shift per day. Unknown versions or fields are rejected
> rather than silently discarded by an older app.
>
> **Known cost:** JSON is for recovery, not spreadsheets, so Manage data now has
> two exports with different jobs. Restore cannot combine a backup with shifts
> already on the device; a user must use a fresh or otherwise empty database.
> The first release is also unencrypted, like the existing CSV, so the chosen
> destination must be treated as sensitive financial data.
>
> **Revisit when:** optional accounts and sync ship. That is when server-side
> backup can become automatic and authenticated merge/conflict behavior can be
> defined. Add encryption only with a recovery-key design that still works after
> the phone is lost; encrypting solely with a device-held key defeats restore.

### D20 — Start with regular-paycheck federal withholding, not take-home (2026-08-04)

> **Decision:** The first tax calculation is an opt-in **2026 federal income-tax
> withholding estimate for one regular W2 paycheck**. It runs on-device from a
> user-entered federal taxable-wages amount and the values on the 2020-or-later
> Form W-4 actually on file for that job: filing status, pay frequency, Step 2's
> checkbox, Step 3 credits, and Steps 4(a), 4(b), and 4(c). An exempt W-4 returns
> zero for regular wages. The calculation implements Worksheet 1A and the 2026
> Percentage Method tables for automated payroll systems from
> [IRS Publication 15-T](https://www.irs.gov/publications/p15t).
>
> This first result is **not** take-home pay, total payroll tax, annual tax
> liability, a refund, or an amount due. It explicitly excludes Social Security
> and Medicare taxes, state and local taxes, 1099 income, supplemental wages,
> nonresident-alien adjustments, part-year and cumulative-wage methods, and
> every other special withholding method. It accepts the user's Step 4(b) total
> but does not decide whether tips, overtime, or another deduction qualifies.
> Those eligibility rules require separate inputs, tests, and qualified tax
> review. The current [2026 Form W-4](https://www.irs.gov/pub/irs-pdf/fw4.pdf)
> remains the source for what each entered value means.
>
> **Alternatives:**
> - Derive taxable wages directly from logged shift gross
> - Add FICA and call the result take-home pay
> - Project annual tax liability and refund or amount due in the same release
> - Wait for Node, accounts, and cloud sync before writing any tax calculation
>
> **Why:** app gross is not a payroll tax boundary. The app does not know the
> employer's federal taxable-wages figure, pretax benefits, allocated tips,
> service charges, payroll adjustments, or supplemental-wage treatment. Asking
> for the paystub's federal taxable wages keeps that uncertainty outside the
> formula instead of hiding it inside a precise-looking result. This narrows
> D14: overtime-adjusted app gross may become an editable convenience later,
> but it is not the authoritative input to this first withholding estimate.
>
> Withholding is also not final income tax. Publication 15-T tells an employer
> what to withhold from a paycheck; it does not compute the employee's completed
> Form 1040. Likewise, a take-home claim would need FICA and payroll deductions.
> [IRS Publication 15](https://www.irs.gov/publications/p15) separately defines
> the 2026 Social Security and Medicare rules, so omitting them while saying
> “take-home” would be materially misleading.
>
> The pure calculator stays on-device under D1 so it works without an account or
> network. Its rules are explicitly versioned to 2026 and reject other years
> instead of silently reusing stale tables. Publication 15-T permits employers
> to round wages or pay-period withholding to whole dollars if they do so
> consistently. This app keeps integer cents and rounds once, at the final cent;
> that deterministic product rule is disclosed because a valid employer result
> may differ slightly.
>
> **Known cost:** the first slice asks the user to copy a paystub amount instead
> of promising an automatic estimate from shifts. It also cannot support public
> tax projections until the settings and paystub facts have lossless backup and
> authenticated sync. Local calculator work can proceed now; managed accounts
> and sync remain a trust and launch gate, not a prerequisite for pure math.
>
> **Revisit when:** schema version 4 defines tax-setting history and the backup
> contract can preserve it without dropping unknown fields; a qualified tax
> professional reviews the supported inputs, exclusions, result wording, and
> test vectors; or a later slice adds FICA, paycheck records, annual liability,
> or an editable app-derived taxable-wage prefill.

### D21 — Preserve effective-dated per-job withholding settings (2026-08-05)

> **Decision:** Store federal withholding settings as an effective-dated
> history per job. `effective_from` means the **first paycheck pay date** to
> which that row applies. For any pay date, the applicable row is the newest
> one for that job whose `effective_from` is on or before the pay date. A job
> and effective date can have only one row.
>
> Each row stores the W-4 and payroll facts D20's calculator needs repeatedly:
> filing status, pay periods per year, Step 2's checkbox, Step 3 credits, Steps
> 4(a), 4(b), and 4(c), and exempt status. It does not store a tax year,
> paycheck taxable wages, calculated withholding, or an annual projection. Tax
> rules come from the paycheck pay date and the explicitly versioned
> calculator; a W-4 election can remain in force across tax years.
>
> Schema version 4 adds one `federal_withholding_settings` table with a UUID
> primary key, a restricted job foreign key, integer cents and booleans, and a
> unique `(job_id, effective_from)` pair. That unique constraint also supplies
> the index for the as-of lookup, so a second speculative index is not added.
> The first live data read exists only for lossless backup. Schema assertions
> pin the future pay-date lookup, but its create and lookup functions wait for
> the tax UI that will call them rather than landing as suppressed dead code.
> Update, delete, list, paycheck storage, and UI behavior likewise wait for a
> caller and a deliberate correction/removal contract.
>
> Lossless backup format version 2 records schema version 4 and includes every
> withholding-setting column. New code still accepts the exact version-1,
> schema-3 jobs-and-shifts contract and normalizes it to an empty settings
> collection. Version 2 requires the new collection; unknown versions and
> fields still fail. Restore remains empty-only across all three tables and
> inserts jobs, then settings, then shifts before foreign-key and exact-row
> parity checks. Version 1 fixtures remain permanent compatibility evidence.
>
> **Alternatives:**
> - Keep only one mutable settings row on each job
> - Store both `effective_from` and `effective_to`
> - Key settings by tax year
> - Add tax columns directly to `jobs`
> - Stop accepting version-1 backups
>
> **Why:** changing today's W-4 must not rewrite which inputs explain an older
> paycheck. A sequence of start dates preserves that history without redundant
> end dates or overlapping ranges: the next row closes the preceding interval.
> Keeping the settings in their own table also avoids turning a job row into a
> mixture of employer identity, mutable payroll configuration, and tax history.
>
> The pay date is explicit because a W-4 submission date and the first paycheck
> that uses it can differ. The app asks for the latter rather than guessing an
> employer's processing delay. Backward-compatible parsing keeps existing
> recovery files useful, while a new format version makes older apps reject tax
> history they cannot preserve instead of silently dropping it.
>
> **Known cost:** saving a change requires an effective pay date, and the first
> persistence slice cannot edit or remove a mistaken row. Adding either action
> requires a clear historical-correction and future sync policy rather than an
> implicit overwrite or a delete that reactivates an older setting.
>
> **Revisit when:** the tax UI needs correction/removal, paycheck records need
> to retain the exact settings used, tax years beyond 2026 ship, or authenticated
> sync defines server conflict and tombstone behavior.
