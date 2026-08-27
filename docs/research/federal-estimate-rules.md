# Federal estimate rules for tax year 2026

Research completed August 27, 2026. This note answers the Wayfinder ticket
"Establish the supported federal estimate rules." It uses federal sources that
apply to tax year 2026. It does not design the app or give tax advice.

## Decision summary

Tip Tracker cannot calculate a trustworthy combined federal estimate from its
current Shift data alone. The logged date, duration, rate, and tips can support
a Gross income record and an overtime estimate. They do not reveal payroll
taxable wages, the worker's current Form W-4, spouse income, deductions,
credits, prior-year tax, taxes already withheld, or whether a tip or overtime
payment qualifies for a federal deduction.

The first release can support these calculations if it keeps them distinct:

1. A 2026 federal income-tax withholding estimate for one regular W-2
   paycheck, using the worker's paystub taxable wages and Form W-4 inputs.
2. A 2026 self-employment tax estimate based on contractor net profit and the
   worker's W-2 Social Security wages.
3. A federal estimated-payment or set-aside calculation only when the worker
   supplies the household-level inputs required by Form 1040-ES. A flat
   percentage of contractor revenue is a budgeting preference, not an IRS
   required payment.
4. Estimated after-tax income only when the app can show every included tax,
   expense, input, assumption, and exclusion. If required inputs are missing,
   the app should show Gross income and mark the federal estimate incomplete.

Federal income tax is calculated at the tax-return level, not independently for
each Job. The IRS combines wages, self-employment income, deductions, credits,
withholding, and other taxes on the 2026 Estimated Tax Worksheet. A Job-level
"net" number would therefore be a product allocation rule, not an IRS result.
[2026 Form 1040-ES, Estimated Tax for Individuals](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf)

## Terms that must stay separate

| Term | What it means for this product |
| --- | --- |
| Gross income | Recorded wages, tips, and contractor revenue before federal taxes and contractor expenses. |
| Federal income-tax withholding | Amount an employer withholds from one paycheck under Publication 15-T and the Form W-4 on file. It is a prepayment, not final annual income tax. |
| Employee payroll taxes | The employee share of Social Security and Medicare tax, plus Additional Medicare Tax when applicable. These are not included in a federal income-tax withholding result. |
| Self-employment tax | Social Security and Medicare tax calculated on net earnings from self-employment. It is separate from federal income tax. |
| Estimated tax payment | A payment toward expected annual income tax and other taxes, including self-employment tax. It is not automatically required of every contractor. |
| Tax set-aside | Money the worker chooses to reserve. Unless the app completes the Form 1040-ES logic, it is not an IRS payment amount or safe-harbor result. |
| Estimated after-tax income | Product arithmetic that subtracts disclosed federal estimates and recorded contractor expenses from Gross income. It is not take-home pay, final tax liability, or a refund prediction. |

The IRS describes estimated tax as the method for paying tax on income not
subject to withholding, including gig and self-employment income. The estimated
tax worksheet includes annual income tax, self-employment tax, other taxes,
credits, withholding, and refundable credits. [2026 Form
1040-ES](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf)

## 2026 W-2 withholding

### Supported rule

Publication 15-T Worksheet 1A supports a deterministic estimate for one
regular paycheck. The calculation must use the exact 2026 percentage-method
tables and these inputs:

- federal taxable wages for that payroll period;
- number of payroll periods per year: 2, 4, 12, 24, 26, 52, or 260;
- the year and version of the Form W-4 on file;
- filing status;
- whether the 2020-or-later Form W-4 Step 2 checkbox is checked;
- Step 3 credits;
- Step 4(a) other income;
- Step 4(b) deductions;
- Step 4(c) extra withholding; and
- whether the worker validly claimed exemption from withholding.

Worksheet 1A annualizes payroll-period taxable wages, applies the W-4
adjustments and the appropriate schedule, subtracts the per-period share of
Step 3 credits, then adds Step 4(c). Publication 15-T permits consistent
rounding choices, so an estimate may differ slightly from an employer's
payroll. [IRS Publication 15-T for
2026](https://www.irs.gov/pub/irs-prior/p15t--2026.pdf)

The current Tip Tracker calculation fits this narrow case. Its user must enter
paystub taxable wages because logged Shift gross is not necessarily federal
taxable wages. Pretax benefits, payroll adjustments, tip treatment, and other
items can make the amounts differ.

### Multiple W-2 jobs

Each employer calculates withholding for its own paycheck using the Form W-4
it has on file. The 2026 Form W-4 tells a worker with multiple simultaneous jobs
to complete Step 2 and submit a separate W-4 for each job. For exactly two jobs
with similar pay, checking Step 2(c) on both forms splits the standard deduction
and tax brackets between the jobs. Otherwise, the form recommends the IRS
estimator or Multiple Jobs Worksheet, with the extra per-pay-period amount
entered on the highest-paying job's Step 4(c). [2026 Form
W-4](https://www.irs.gov/pub/irs-prior/fw4--2026.pdf)

Tip Tracker must not combine logged wages from several Jobs and call the result
paycheck withholding. It can estimate each regular paycheck from that Job's
actual W-4 settings. The worker remains responsible for coordinating multiple
jobs and spouse income through the W-4 or IRS estimator.

### W-2 withholding exclusions

The narrow paycheck estimator should exclude:

- supplemental wages such as bonuses when the employer uses the optional 22%
  method or the mandatory 37% method above $1 million;
- Forms W-4 from 2019 or earlier unless the older allowance method is added;
- nonresident-alien adjustments;
- irregular payroll periods and employer-specific alternative methods;
- actual paycheck reconciliation; and
- final annual tax, refunds, Social Security, Medicare, state tax, benefits,
  insurance, retirement, garnishments, or take-home pay.

Publication 15-T says its regular percentage method cannot replace the special
supplemental-wage methods. [IRS Publication 15-T for
2026](https://www.irs.gov/pub/irs-prior/p15t--2026.pdf) Publication 15 sets the
2026 supplemental-wage rates. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

## W-2 Social Security and Medicare taxes

For 2026, the employee Social Security rate is 6.2% on Social Security-taxable
wages up to $184,500 per employer. The employee Medicare rate is 1.45% with no
wage limit. Employers begin withholding another 0.9% Medicare tax after that
employer pays the worker more than $200,000 in Medicare wages during the year.
[IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

The worker's final Additional Medicare Tax threshold depends on filing status
and combined Medicare wages and self-employment income: $250,000 married filing
jointly, $125,000 married filing separately, and $200,000 for other filing
statuses. Employer withholding at $200,000 can therefore differ from final
liability. [IRS Instructions for Form
8959](https://www.irs.gov/instructions/i8959)

Across multiple employers, each employer applies the Social Security wage base
on its own. If total withholding exceeds the annual maximum because the worker
had multiple employers, the worker may claim the excess on the federal return.
This is another reason a sum of Job-level deductions is not final tax. [IRS Tax
Topic 608](https://www.irs.gov/taxtopics/tc608)

Logged gross does not identify Social Security wages, Medicare wages, or taxes
already withheld. A combined after-tax estimate needs those paystub values or
must clearly label a gross-wage approximation and exclude special wage cases.

## Tips

Tips remain income. Employees generally must report cash tips to an employer
when tips from that employer reach $20 in a calendar month. Unreported tips and
allocated tips may require Form 4137 for Social Security and Medicare tax.
[IRS tip recordkeeping and
reporting](https://www.irs.gov/businesses/small-businesses-self-employed/tip-recordkeeping-and-reporting)
[IRS Form 4137 overview](https://www.irs.gov/forms-pubs/about-form-4137)

The 2026 qualified-tips deduction is narrower than "tips logged in the app."
Qualified tips must be voluntary cash or cash-equivalent tips, come from a
listed tipped occupation, satisfy reporting rules, and meet other eligibility
rules. Mandatory service charges do not qualify. The annual deduction is
limited to $25,000, phases out above modified adjusted gross income of $150,000
or $300,000 for a joint return, requires a valid Social Security number, and
requires joint filing when married. For a self-employed worker, the deduction
cannot exceed net income from the business that earned the tips. [Treasury and
IRS final qualified-tips regulations
announcement](https://www.irs.gov/newsroom/treasury-irs-issue-final-regulations-listing-occupations-where-workers-customarily-and-regularly-receive-tips-under-the-one-big-beautiful-bill)
[2026 Form 1040-ES](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf)

Starting in tax year 2026, information returns identify qualified tip amounts
and tipped occupation codes. A logged tip amount does not prove either fact.
The first release should not apply the deduction from Shift tips alone. It must
either use the worker's qualified amount from the relevant tax statement and
collect every eligibility input, or state that the deduction is excluded. Tips
remain subject to applicable Social Security and Medicare taxes even when the
income-tax deduction applies. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

## Overtime

The qualified-overtime deduction applies only to the part of overtime pay above
the regular rate that section 7 of the Fair Labor Standards Act requires. For
ordinary time-and-a-half pay, that is the extra half, not all overtime wages.
The worker must be covered and nonexempt under the FLSA. Overtime required only
by a state rule, contract, or employer policy does not qualify.

For 2026 the annual deduction is capped at $12,500, or $25,000 on a joint
return, and phases out above modified adjusted gross income of $150,000 or
$300,000 for a joint return. It does not remove overtime from gross wages or
from Social Security and Medicare taxes. Employers report the qualified amount
in Form W-2 box 12 code TT beginning in 2026. [IRS Fact Sheet FS-2026-13,
updated August 2026](https://www.irs.gov/pub/taxpros/fs-2026-13.pdf)

Tip Tracker's current overtime estimate knows hours, rates, and a configured
workweek. It does not know FLSA coverage, exemptions, the employer's actual
regular-rate calculation, or whether the employer paid the amount. The app
must not turn its estimated overtime premium into a qualified-overtime
deduction. It should use the reported qualified amount and eligibility inputs,
or exclude the deduction.

## Self-employment income and contractor expenses

Independent-contractor earnings are generally subject to self-employment tax.
Classification depends on the facts, including behavioral control, financial
control, and the parties' relationship. A user-selected Job tax treatment is
an input, not a legal determination. [IRS independent-contractor
guidance](https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee)

For a sole proprietor, net profit generally starts with business income minus
allowable business expenses on Schedule C. An expense must be ordinary and
necessary. Personal expenses are not deductible, mixed-use costs must be
divided, and some costs must be capitalized or depreciated rather than deducted
immediately. Tip Tracker can record an amount and category, but it cannot
certify deductibility. [IRS Publication 334, chapter
8](https://www.irs.gov/publications/p334) [2025 Schedule C instructions, the
latest filed-return instructions available during this
research](https://www.irs.gov/pub/irs-prior/i1040sc--2025.pdf)

The regular 2026 self-employment-tax calculation follows the Form 1040-ES
worksheet:

1. Start with expected net profit from self-employment.
2. Multiply by 92.35%.
3. Apply 2.9% Medicare tax to that amount.
4. Subtract expected Social Security-taxable W-2 wages from the $184,500 annual
   Social Security base, not below zero.
5. Apply 12.4% Social Security tax to the smaller of net earnings from step 2
   or the remaining base.
6. Add the Medicare and Social Security amounts.
7. Deduct one-half of that result when calculating expected adjusted gross
   income.

Most self-employed workers owe self-employment tax when net earnings reach
$400, subject to special cases. Additional Medicare Tax may also apply after
combining Medicare wages and self-employment income. [2026 Form
1040-ES](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf) [IRS gig-work tax
guidance](https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work)

This calculation requires annual contractor net profit and annual W-2 wages.
It cannot be calculated correctly from one Job or one arbitrary chart range in
isolation.

## Estimated payments and set-aside guidance

For 2026, a worker generally must make estimated payments only when both tests
apply:

- expected tax due after withholding and refundable credits is at least
  $1,000; and
- withholding and refundable credits are less than the smaller of 90% of 2026
  tax or 100% of 2025 tax.

The prior-year percentage rises to 110% when 2025 adjusted gross income exceeds
$150,000, or $75,000 for married filing separately. Farmers, fishers,
nonresident aliens, and several other cases have special rules. Equal calendar
year installments are due April 15, June 15, and September 15, 2026, and
January 15, 2027. Uneven income may require the annualized-income method rather
than four equal installments. [2026 Form
1040-ES](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf)

An app cannot tell a worker that a percentage of contractor revenue is a
required quarterly payment without expected annual tax, prior-year tax and
adjusted gross income, all withholding and refundable credits, and applicable
special-case inputs. A defensible product can do one of two things:

- complete the supported portions of the Form 1040-ES method and identify any
  unsupported case; or
- show a worker-chosen "Tax set-aside" and say it is a budgeting amount, not a
  required payment or safe-harbor calculation.

The app should link to Form 1040-ES and the IRS Tax Withholding Estimator for
cases it does not support. The 2026 Form W-4 itself directs workers with
self-employment income or complex multiple-job situations to that estimator.
[2026 Form W-4](https://www.irs.gov/pub/irs-prior/fw4--2026.pdf)

## What the current data can and cannot supply

| Needed fact | Current logged data | Worker or tax document must supply |
| --- | --- | --- |
| Shift wages at the stored rate | Yes | No |
| Logged tips | Yes | Whether all tips were reported and whether they are qualified tips |
| Estimated overtime premium | Yes, when enabled | FLSA eligibility, actual payment, regular-rate facts, and W-2 code TT amount |
| Contractor revenue | Only if every payment can truthfully be represented as a Shift | Lump-sum, milestone, non-hourly, and other receipts |
| Contractor expenses | No | Amount, date, business, category, business-use share, and worker judgment about eligibility |
| Regular-paycheck federal taxable wages | No | Paystub amount |
| Form W-4 inputs | Stored when configured | Confirmation that they match the form currently on file |
| W-2 Social Security and Medicare wages and withholding | No | Paystub or Form W-2 values |
| Annual filing status and spouse income | No | Worker |
| Other income, adjustments, deductions, and credits | No | Worker |
| Qualified business income deduction | No | Worker inputs and supported calculation |
| Prior-year tax and adjusted gross income | No | Prior-year return |
| Federal withholding and estimated payments already made | No | Paystubs and IRS/payment records |

The current Shift model requires positive duration and an hourly rate. It
cannot represent every contractor receipt without inventing hours or a rate.
That is a product and data-model decision, not a tax formula.

## Minimum contract for Estimated after-tax income

The phrase "Estimated after-tax income" is defensible only if the result has a
visible calculation breakdown and a named tax year. For a supported annual
case, the breakdown must include:

```text
Gross income
- recorded contractor expenses
- estimated federal income tax
- estimated employee Social Security and Medicare taxes
- estimated self-employment tax
- estimated Additional Medicare Tax, when supported
= Estimated after-tax income
```

Federal income tax must use household-level facts. At minimum, the calculation
needs filing status, all supported taxable income, the standard or itemized
deduction, Schedule 1 and Schedule 1-A deductions, qualified business income
deduction when applicable, supported credits, self-employment tax, other
supported taxes, and withholding. The 2026 standard deductions are $16,100 for
single or married filing separately, $32,200 for married filing jointly, and
$24,150 for head of household. The 2026 rate schedules run from 10% through
37%. [IRS 2026 inflation-adjustment
announcement](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill)
[2026 Form 1040-ES](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf)

If the release does not implement that annual calculation contract, it should
not manufacture an income-tax number by adding per-paycheck withholding
estimates. It may instead subtract actual federal taxes entered from paystubs
or a worker-selected set-aside, but the label and breakdown must say which one.

The app also needs an explicit rule for date ranges. Annual federal tax is
nonlinear and household-wide. Allocating it to one month, one Job, or one Shift
is a product estimate that the IRS does not define. Until that rule is decided,
Estimated after-tax income should be annual or year-to-date with its projection
method shown, not silently reused for every Trends range.

## Required labels and disclosures

Use labels that name the calculation:

- "2026 estimated federal income-tax withholding" for one regular W-2
  paycheck;
- "2026 estimated self-employment tax" for the Schedule SE method;
- "Suggested federal tax set-aside" only when the method and assumptions are
  visible; and
- "Estimated after-tax income" only for the itemized combined calculation.

Do not use these claims:

- "take-home pay" or "net pay";
- "tax bill," "tax due," or "refund";
- "what you owe quarterly" without completing the applicable Form 1040-ES
  logic;
- "no tax on tips" or "no tax on overtime" as if all logged amounts qualify;
- "deductible expense" as a determination made by the app;
- "accurate for everyone" or "guaranteed accurate"; or
- language that treats a user-selected worker classification as an IRS ruling.

A concise combined disclosure can say:

> Estimate for 2026 federal taxes only. It is based on the income, expenses,
> tax settings, and assumptions shown here. It excludes state and local taxes
> and any unsupported deductions, credits, income, or special tax rules. It is
> not take-home pay, a tax return, or tax advice. Compare estimates with your
> paystubs and IRS Form 1040-ES.

The detail view should list omissions for the current result rather than hide
them in a general legal page. Missing required inputs should produce an
"Incomplete estimate" state, not a number that looks complete.

## Tax-year maintenance

Every federal rule set must be versioned by tax year. The app must not use 2026
tables for a 2027 paycheck or silently recalculate a saved 2026 explanation
with later rules. At minimum, an annual update must review Publication 15-T,
Form W-4, Form 1040-ES, the Social Security wage base, Schedule SE, qualified
tip and overtime guidance, and relevant Form 1040 schedules.

When a year is unsupported, the safe behavior is to preserve recorded Gross
income, identify the unsupported tax year, and withhold the federal estimate.
The IRS publications themselves direct readers to their Future Developments
pages because later legislation and guidance can change the published rules.

## Decisions this research makes ready

The map can now ask these precise questions:

1. What annual household profile and unsupported-case policy define the first
   release's federal income-tax estimate?
2. Is Estimated after-tax income limited to annual and year-to-date views, or
   how will an annual household tax estimate be allocated to shorter ranges
   without presenting that allocation as an IRS rule?
3. Will qualified-tip and qualified-overtime deductions use 2026 information
   return amounts and eligibility inputs, or remain explicit exclusions?
4. How will tax-year rule sets expire, update, and preserve historical
   explanations?
5. How will non-hourly contractor revenue and contractor expenses be recorded
   without inventing Shift facts?

## Primary sources

- [IRS Publication 15-T for 2026](https://www.irs.gov/pub/irs-prior/p15t--2026.pdf)
- [IRS Publication 15 for 2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)
- [2026 Form W-4](https://www.irs.gov/pub/irs-prior/fw4--2026.pdf)
- [2026 Form 1040-ES](https://www.irs.gov/pub/irs-prior/f1040es--2026.pdf)
- [IRS Publication 505 for 2026](https://www.irs.gov/pub/irs-prior/p505--2026.pdf)
- [IRS Fact Sheet FS-2026-13](https://www.irs.gov/pub/taxpros/fs-2026-13.pdf)
- [Treasury and IRS final qualified-tips regulations announcement](https://www.irs.gov/newsroom/treasury-irs-issue-final-regulations-listing-occupations-where-workers-customarily-and-regularly-receive-tips-under-the-one-big-beautiful-bill)
- [IRS Publication 334](https://www.irs.gov/publications/p334)
- [IRS Instructions for Form 8959](https://www.irs.gov/instructions/i8959)
