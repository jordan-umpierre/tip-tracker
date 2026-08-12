# Learning — product scope & data model

Part of the [learning log](README.md) — every question asked on this project,
with its answer, dated. New entries append here.

Companion docs: [../roadmap.md](../roadmap.md) for what is next,
[../product.md](../product.md) for product scope,
[../decisions.md](../decisions.md) for the numbered decisions.

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

### 2026-07-30 — "What would a senior engineer really do about deleting shifts?"

The contradiction: D3 says a hard delete is invisible to a device that never saw
the row, which is the whole reason jobs are archived instead of deleted. Then
shifts were hard-deleted anyway.

I asked whether to add the tombstone column now or defer it until sync exists,
since YAGNI argues for deferring.

**The answer is to add it now, and the reasoning is an asymmetry rather than a
preference.**

Cost of adding it and never needing it: one nullable column, and a
`WHERE deleted_at IS NULL` in a query that was going to be centralized anyway.
You can drop a column.

Cost of deferring it and later needing it: you ship, people delete shifts for a
year, then sync arrives. Device A deleted a shift. Device B never heard. There
is no tombstone to send, and you cannot invent one for a row that is already
gone — so the shift **reappears on the other phone**. No migration fixes that
after the fact. In an app whose entire claim is that your income history is
accurate, a deleted shift coming back is a correctness bug.

So the question is not "will I need this", it is **which mistake can I undo.**

#### Where the YAGNI line actually sits

This is the part worth keeping. YAGNI is usually right, and it did not apply
here, which means the rule needs a sharper edge than "don't build what you don't
need yet."

YAGNI's real target is speculative **abstraction** — an interface with one
implementation, a plugin system for one plugin, a config value that never
changes. Those are expensive because removing them means untangling everything
built on top.

A nullable column with a written reason is not that. It has no dependents. The
test to apply: *if I am wrong about this, what does it cost to reverse?* Cheap
to reverse means the safe direction is whichever side protects the data.

#### Also worth knowing: this is the ordinary answer

Every syncing local-first library — WatermelonDB, PouchDB, Realm, libSQL sync —
keeps deletion tombstones on every table that syncs. Being able to say "this is
the standard approach for this problem" is a stronger interview answer than a
clever argument, and it is a signal worth checking for generally: if a solved
problem has an industry-standard shape and mine is different, I should know why.

The two costs, so they are not a surprise later: tombstones grow forever without
a purge policy, which becomes a real task when sync ships; and the missing-filter
footgun now applies to a second table. Both are written into D4.

### 2026-07-29 — The data model questions, asked and answered in order

Two entities looked obvious from the start: **Job** and **Shift**. Every
question below is now implemented, not just decided — kept in question form
because the reasoning is the useful part.

**How is money stored? — integer cents.**

Not as floating point. `0.1 + 0.2` is `0.30000000000000004` in JavaScript,
because binary floats can't represent most decimal fractions exactly. Small
errors compound across hundreds of shifts and a tax calculation.

Store whole cents as integers. `$24.50` is `2450`. Format for display only.
Every money column in `schema.sql` (`hourly_rate_cents`, `tips_cents`) follows
this. See also D5, which is about where the rounding happens once cents stop
dividing evenly.

**What happens to shift history when a job's hourly rate changes?**

The expensive one. Scenario: 200 shifts logged against a job paying $8/hr. You
get a raise to $10/hr and update the job. If a Shift only stores `job_id` and
the rate is looked up from Job at display time, what happens to those 200
historical shifts?

Whatever this app shows for last year has to still be true next year. So
`shifts.hourly_rate_cents` copies the job's rate at the moment the shift was
created, and is never a live lookup. `createShift`/`updateShift` take it as a
required argument for exactly this reason.

**What kind of IDs? — text UUIDs, via `expo-crypto`.**

D1 committed to sync-later. Auto-incrementing integers collide across devices —
two phones both create row 5, and there's no way to reconcile them. Text UUIDs,
generated on-device with `Crypto.randomUUID()`, are unique everywhere without
needing a central authority to hand them out.

**How is a shift's date stored? — date-only ISO 8601.**

A shift on October 5th is October 5th. If it's stored as a UTC timestamp, a
user in a negative-offset timezone logging a late shift can see it land on the
wrong day. `shift_date` is `"YYYY-MM-DD"`, no time, no timezone.

**What happens on delete? — see D3 (jobs) and D4 (shifts).**

### 2026-07-31 — "Help me decide numbers versus charts and see the big picture"

There are three real choices, not two.

**Numbers only.** Exact values in cards and rows are the smallest, most
accessible version and the easiest one to verify against hand calculations.
They are also weak at the job a Trends screen exists to do: helping someone
see a pattern faster than they could by reading a table.

**A third-party chart library.** This buys axes, SVG paths, animations,
tooltips, multiple series, and interaction. It also introduces the first
non-Expo UI dependency in the project, plus version compatibility,
accessibility work, bundle cost, and an API the app would need to wrap or
rewrite around. None of Layer 1's current requirements needs zooming, panning,
tooltips, or hundreds of points.

**Exact numbers plus a native comparison.** Keep every value visible as text,
then use ordinary React Native `View`s as bars for the fixed seven-weekday
comparison. The bars make relative differences visible; the labels remain the
accessible, testable truth. Month and year summaries can start as exact rows
or cards rather than forcing a dense chart onto a phone.

The third option is the professional fit here. It improves comprehension
without adopting a general charting system for seven categories. It is
deliberately not a home-grown chart library: one fixed comparison component,
no axes engine, no reusable geometry abstraction.

The trigger for a real chart dependency is a requirement the native bars
cannot honestly cover—many time-series points, multiple overlaid series,
touch inspection, zooming, or panning.

The comparison also exposed a more important product question, which D10
settled before implementation:

- Does Trends default to all jobs or one selected job? Combining jobs can make
  a weekday look better merely because a higher-paying job happens on that
  day.
- Is a per-hour value `sum(amount) / sum(hours)` or an average of each shift's
  individual rate? The ratio of sums is weighted by time and does not let a
  short shift distort the result.
- Which number does "Mondays are $24/hr" mean: gross per hour or tips per
  hour? At the time, the product scope named tips per hour as the headline,
  but the weekday example said earnings per hour.
- How much evidence sits behind the number? Shift count and total hours stop
  one unusual shift from looking like a reliable trend.

D10 initially chose one all-jobs-or-single-job scope, time-weighted rates,
gross per hour for the weekday comparison, and both shift count and total hours
as context. A polished chart cannot rescue an undefined metric; exact formulas
and job scope had to come before visual treatment. The device-test revision
below changed the headline and orientation without changing those foundations.

### 2026-08-03 — "Why did the iPhone test change the Trends design?"

The first device pass confirmed the arithmetic, but it also showed that a
mathematically correct screen can still answer the wrong question or present
the answer poorly.

- Gray sample text reused on a dark-blue card passed compilation but was hard
  to read. Accessibility contrast is part of correctness, not later polish.
- Tips per hour excluded hourly wages, so it did not answer the more useful
  question: "What did my time actually earn?" D10 now makes time-weighted
  gross per hour the headline.
- The data model and form already supported many jobs, but `LogScreen` stopped
  rendering the creation form after job one. Supporting a capability in the
  database is not the same as exposing a complete user flow.
- Horizontal bars made exact labels easy to place but required seven stacked
  rows. The user clarified that vertical bars would be better for the user
  experience. D9 now uses seven native columns while keeping exact rates,
  sample context, and full accessibility labels visible.

The professional lesson is not that an initial decision must never change. It
is that the boundary should remain stable while evidence improves the choice:
the calculations are still pure TypeScript and the weekday comparison still
uses native views. The later chronological line below adds one SVG primitive
dependency after its original revisit condition becomes real; neither change
needs a data migration.

### 2026-08-03 — "Why add SVG now, but not a chart framework?"

The 845-row import changed the requirement. Trends now needs many chronological
points and touch inspection—the exact trigger D9 originally named. Keeping the
old no-dependency rule after its premise changed would be stubbornness, not
consistency.

The smallest new boundary is `react-native-svg`: it draws one path, guide, and
selection dot and is supported by Expo Go. The app still owns its five fixed
calendar ranges and exact accessible text. A general chart framework would add
axes, legends, zoom, comparison series, and configuration that this screen does
not need. One line also avoids copying the three-series density of the reference
tracker or Robinhood's misleading red/green gain-and-loss semantics.

Horizontal drag inspects the nearest point. The same gesture does not also page
between periods because the two outcomes conflict; the visible range buttons
change scale. Add period navigation only when users need an older week or month
at its original resolution, not merely because the reference app has arrows.

### 2026-08-03 — "If someone imported a CSV like mine but with real Start Time and End Time values, would the app process that data accurately?"

No, and deliberately so: it refuses the file rather than importing it wrong.

`parseShiftRecord` accepts `Start Time` and `End Time` only when they are empty
or the literal text `no data`. Anything else produces an error per column, and
any error at all means `ImportCsvForm` shows the invalid-file state with no
import button — so nothing is saved. Verified by running the parser directly:

- Both rows carrying real times → 0 rows accepted, 4 errors ("Start Time
  contains a real time, which this importer cannot preserve yet").
- Blank or `no data` in both columns → 2 rows accepted, 0 errors.
- One good row, one row with times → 1 row accepted but 2 errors, and because
  errors block the whole file, that single good row does not import either.

The reason is the data model, not the parser. `shifts` stores `shift_date` and
`duration_seconds` and has no column for when a shift started or ended, so
importing those rows would mean silently discarding the times while claiming the
import succeeded. Refusing states the limitation instead of hiding it.

What it costs: a user whose spreadsheet does track times cannot import at all,
even though the wage, hours, and tips in their file are perfectly usable. The
current workaround is clearing those two columns before importing, which is real
friction and a reasonable thing to fix later by accepting the columns and
recording the loss in the preview instead of rejecting.

This is also a prerequisite for something already planned. D14 notes overtime
cannot claim accuracy without knowing an employer's fixed workweek boundary, and
a midnight-to-midnight assumption is exactly what stored shift times would
replace. Whenever times get stored, this importer rule is the first thing that
should change.

**2026-08-04 update:** `4173c44` made that change after schema version 3 added
paired time columns. The importer now accepts a deliberately narrow,
case-insensitive `h:mm AM/PM` pair and stores normalized `HH:MM`; blank/`no
data` pairs remain null. One-sided or malformed values still block the whole
file. Tests cover synthetic midnight, noon, overnight, case, and leading-zero
examples, but the supplied Breadmaker export contains no real times, so its
actual timed-source format remains unverified.

### 2026-08-04 — "Forget what D16 says. What would a real engineer do about the export filename collision?"

Asked after the second export of a day failed: `createFile` refuses an existing
path rather than replacing it, and the name only carried the date.

Two real options. Overwrite the day's file, or put the time in the name so
exports accumulate.

The instinct that makes overwrite look obvious is that an exported CSV is a
*derived artifact*. The app is the source of truth (D1), so the file can be
regenerated at any time, which normally makes replacing one free. That
reasoning is sound and it is also the trap: it quietly assumes the app is still
there.

There is no restore path yet. An exported file cannot be re-imported, because
the importer only accepts D13's contract. So until restore exists these files
are the only copy of the data that survives losing the phone, and a name
collision should cost some clutter rather than a backup. Once restore is built
that inverts and overwrite becomes the better answer — which is why it is
written into D16's revisit condition rather than just rejected.

The second reason had nothing to do with product. Timestamping changes one pure
function that already had a test; overwriting changes the write path, which is
code Node cannot reach, on the one path where being wrong destroys a file
instead of failing to create one. Given the same session had already shipped
two fixes that failed because they were reasoned about rather than run, putting
the change in the half that can be asserted was worth something on its own.

The general shape: "this is cheap to lose" is a claim about the *system*, not
the file. Check whether the thing that makes it cheap actually exists yet.

### 2026-08-11 — "How should paging, custom ranges, and drill-down share one chart?"

Start with gesture ownership. The line already uses horizontal movement to
inspect its nearest point, so making that movement page as well would give one
gesture two valid outcomes. Older and Newer buttons are less fashionable than a
swipe, but they are visible, accessible, and deterministic.

Then keep the date contract below the UI. Presets, custom boundaries, per-job
lines, the totals table, and the detail screen all consume one `TrendSeries`.
The detail route does not reconstruct what a week or month means; it asks the
series for the dates behind the selected point and clamps partial buckets to the
visible window. That is why the screen cannot disagree with the graph without a
pure assertion failing first.

More visualization is useful only when it answers a different question. The
line answers when income arrived. Conditional job bars answer how the visible
total is divided. A second time-series or a one-job bar would repeat the same
data without adding a decision, so neither exists.

The engineering lesson is that interaction design and data modeling meet at
boundaries. Once a chart can page and drill down, its date window is no longer a
labeling detail. It is an application contract worth owning once and testing
directly.
