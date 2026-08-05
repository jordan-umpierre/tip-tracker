# Product

What this app is, who it's for, what it deliberately doesn't do, and the order
the feature set gets built in.

Companion docs: [roadmap.md](roadmap.md) for what's next and what's done,
[decisions.md](decisions.md) for the numbered technical decisions.

---

## What we know

- Name: `tip-tracker`
- Target: production app on the Apple App Store and Google Play
- Audience: public — any service worker, W2 or 1099
- Initial scale: 3–10 users, scale up if demand appears

---

## The problem

Service workers have irregular income. They don't know what they actually make
per hour, which shifts are worth taking, or what they'll owe at tax time. Cash
tips make it worse — nothing withholds tax from cash.

## What the full product will do

Log a shift in seconds. See what you actually earn — after tax, not before.
Layer 0 and Layer 1 currently cover logging, gross totals, and trends; the tax
and 1099 promises below remain planned layers, not current app behavior.

## The three differentiators

1. **Net, not gross.** Projected take-home, projected paycheck amount,
   estimated refund or amount owed at year end. Opt-in, because most people
   will find tax settings intimidating and should be able to skip them
   entirely.
2. **1099 as a first-class citizen.** Mileage and expenses, not just W2 shifts.
   Tax projection matters *more* for them since nothing is withheld.
3. **UI/UX quality.** Modern, fast, feels good to use.

## Explicitly out of scope (v1)

- Payroll integration or bank connections
- Anything that files or submits a tax return
- Social features, leaderboards, comparing to other users
- Employer-side or manager-side views

---

## The four layers

Each layer is built on the one below it, and each is *additive* — none forces a
rewrite of the one before. That property is the reason to ship in this order.

### Layer 0 — MVP

- Create jobs. A job has a name and an hourly rate. Multiple jobs, different
  rates.
- Log a shift: date, which job, hours, tips, optional note. Hourly rate is
  inherited from the job but overridable (raises happen, so do special events).
- Multiple shifts per day, any number of days.
- See a list of past shifts. Edit and delete them.
- Import existing history from the supported nine-column CSV export after a
  complete preview and explicit confirmation.
- Gross totals only.

This is a complete, shippable, useful app. Someone would actually use it.

### Layer 1 — Trends

- Interactive gross-income timeline with 1W, 1M, 3M, 1Y, and All ranges
- Earnings by day of week ("Mondays are $24/hr, Tuesdays are $33/hr")
- Earnings by month and by year, going back as far as data exists
- Gross per hour as the headline number, weighted by time

No new data model. Every one of these is a query over Layer 0 data. That is
exactly why it's Layer 1 and not MVP — it can't block anything.

### Layer 2 — Net income for W2

- Opt-in per-job overtime settings: whether the job pays time-and-a-half and
  when its fixed workweek starts
- Opt-in tax profile: tax year, filing status, pay frequency, W-4 adjustments,
  other income/adjustments, and actual withholding
- Projected take-home per shift and per pay period
- Projected paycheck amount (weekly / biweekly / semimonthly)
- Year-end estimate: refund or amount due

The first bounded tax slice is smaller than the full Layer 2 described above. D20
starts with a 2026 federal income-tax withholding estimate for one regular W2
paycheck, using user-entered federal taxable wages and the actual 2020-or-later
W-4 values for that job. It does not claim take-home pay, total payroll tax,
annual liability, refund, or amount due. Those remain later slices rather than
being approximated under one number.

D21 gives the W-4 settings a local, lossless persistence boundary. Each job can
retain a history keyed by the first paycheck pay date a setting applies to, so
a later W-4 does not rewrite older inputs. Schema version 4 and backup version
2 are implemented, but no settings UI or paycheck record exists yet.

### Layer 3 — 1099 mode

- Mark a job as 1099 instead of W2
- Log miles driven and deductible expenses
- Self-employment tax, quarterly estimated payments

### Why this order

Layer 0 is where the risk of getting it wrong is highest and the cost of fixing
it later is highest. Layers 2 and 3 are each individually bigger than Layer 0,
and both depend on shift data being correct. Build the foundation, prove it
works, then stack on it.

Common failure mode this avoids: building the impressive tax engine first, then
discovering the shift-logging flow is annoying enough that nobody logs shifts,
which makes the tax engine worthless.

---

## Pushback and risks

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
- Do not treat app gross as federal taxable wages. D20 starts from the paystub's
  entered taxable-wages amount; an overtime-adjusted app value can become an
  editable prefill only after its assumptions are visible.

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
