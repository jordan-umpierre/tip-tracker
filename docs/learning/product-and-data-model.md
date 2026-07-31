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
