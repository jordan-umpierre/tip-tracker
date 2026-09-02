# 2026 payroll facts for an estimated net pay contract

Research completed September 1, 2026. This note supports the Wayfinder ticket
"Define the estimated net pay calculation contract." It covers a regular U.S.
W-2 paycheck and uses IRS and Social Security Administration sources. It does
not resolve the product decision or give tax advice.

## Findings

### Social Security

For wages paid in 2026, the employee Social Security rate is 6.2%. The annual
Social Security wage base is $184,500, so the maximum employee Social Security
tax for the year from one employer is $11,439. The employer applies the rate to
Social Security-taxable wages until that employer's wages and reported tips
reach the base. [SSA contribution and benefit
base](https://www.ssa.gov/OACT/COLA/cbb.html)
[IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

A paycheck estimate therefore needs both of these employer payroll values:

- Social Security wages for the paycheck; and
- Social Security wages already paid by the same employer in 2026.

Shift gross is not a safe replacement. The IRS defines exceptions for some
wages and compensation, and the wage base follows payroll wages rather than the
app's gross-income total. A worker with multiple employers can have more than
the annual maximum withheld because each employer withholds on its own wages.
The worker may claim qualifying excess withholding on a federal return. [IRS
Publication 15 for 2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf) [IRS Topic 608,
Excess Social Security and RRTA tax
withheld](https://www.irs.gov/taxtopics/tc608)

For an ordinary paycheck that does not cross the base, the employee estimate is
`Social Security wages x 6.2%`. For a paycheck that crosses it, only the wages
up to the employer's remaining 2026 base are subject to the tax. Employer
successor, common-paymaster, railroad, government, religious, and international
coverage cases need separate rules and should remain unsupported unless the
contract adds them. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

### Medicare and Additional Medicare Tax

The employee Medicare rate is 1.45% of Medicare-taxable wages and tips. Medicare
has no wage base. [SSA contribution and benefit
base](https://www.ssa.gov/OACT/COLA/cbb.html)

An employer must also withhold 0.9% Additional Medicare Tax from Medicare wages
and tips it pays above $200,000 in a calendar year. Withholding starts in the
pay period in which the employer's cumulative wages cross $200,000 and
continues through year-end. The employer does not use the worker's filing
status, and there is no employer match for this 0.9%. A paycheck estimate needs
current-paycheck Medicare wages and the same employer's prior 2026 Medicare
wages. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

The $200,000 employer withholding threshold is not the final tax-liability
threshold. Final Additional Medicare Tax uses combined Medicare wages and
self-employment income, including a spouse's amounts on a joint return. The
thresholds are $250,000 for married filing jointly, $125,000 for married filing
separately, and $200,000 for single, head of household, or qualifying surviving
spouse. As a result, the amount withheld on one paycheck may be less or more
than final liability. A paycheck estimator should calculate employer
withholding, not claim to calculate final Additional Medicare Tax. [IRS
Publication 505 for
2026](https://www.irs.gov/pub/irs-prior/p505--2026.pdf)

### Reported tips

Cash tips of $20 or more in one calendar month from one employer must be
reported to that employer by the tenth day of the following month. Cash tips
include cash, charged tips distributed to the employee, and tips received
through tip sharing. Tips below the $20 employer-reporting threshold are still
income the worker reports on a tax return. [IRS Topic 761, Tips, withholding and
reporting](https://www.irs.gov/taxtopics/tc761)

The employer calculates Social Security, Medicare, and federal income-tax
withholding on wages and reported tips. For 2026, the employer stops collecting
employee Social Security tax when its wages and tips reach $184,500, while
Medicare continues on all covered wages and tips. Tips are considered paid when
the employee reports them. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

The federal income-tax withholding method for tips is not fixed by the tip
amount alone. Publication 15 treats reported tips as supplemental wages but
also permits an employer to treat them as regular wages. Depending on how the
employer identifies and pays them and whether income tax was withheld from
regular wages, the employer may aggregate the tips with regular wages or use
the 22% supplemental-wage method. A Tip Tracker estimate cannot reproduce this
part of a paystub without recording the employer's method and the needed payroll
history. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

The employer collects taxes on tips from regular wages or other funds the
employee supplies. If those funds are insufficient, the employer withholds in
this order: taxes on regular wages, Social Security and Medicare taxes on tips,
then income tax on tips. Some tip taxes can remain uncollected and appear on
Form W-2. A formula that always subtracts all calculated tip taxes from the
current paycheck can therefore differ from actual net pay. [IRS Topic 761,
Tips, withholding and reporting](https://www.irs.gov/taxtopics/tc761)

Mandatory service charges are not tips. When paid to an employee, they are
non-tip wages subject to Social Security, Medicare, and federal income-tax
withholding. The qualified-tips income-tax deduction does not remove reported
tips from Social Security or Medicare wages. An employee can account for an
expected qualified-tips deduction through an updated Form W-4, but the employer
still follows Publication 15-T withholding procedures. [IRS Topic 761, Tips,
withholding and reporting](https://www.irs.gov/taxtopics/tc761) [IRS Publication
15 for 2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

### Rounding

Publication 15-T permits an employer to reduce the last digit of wages to zero
or round wages to the nearest dollar when calculating federal income-tax
withholding. It also permits rounding the pay-period tax to the nearest dollar,
as long as the employer uses rounding consistently. Its whole-dollar rule drops
amounts below 50 cents and raises amounts from 50 through 99 cents to the next
dollar. Different valid employer choices can produce a small difference from
an app estimate. [IRS Publication 15-T for
2026](https://www.irs.gov/pub/irs-prior/p15t--2026.pdf)

Publication 15 tells employers to determine Social Security and Medicare
withholding by multiplying each wage payment by the employee rate. It also
recognizes "fractions-of-cents" differences caused when payroll records add or
drop fractions of cents on individual wage payments. The cited federal guidance
does not establish one exact per-paycheck cent-rounding algorithm that every
employer must use. The app should state its own deterministic money-rounding
rule and label small paystub differences as expected rather than claiming exact
employer parity. [IRS Publication 15 for
2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)

## Facts the app must not infer

A defensible estimate needs worker-entered or paystub-derived values for facts
that Shift records do not prove:

- Social Security wages, Medicare wages and tips, and federal taxable wages for
  the paycheck. These amounts can differ from gross pay and from each other.
- Same-employer year-to-date Social Security wages and Medicare wages. These
  determine the wage-base and Additional Medicare withholding transitions.
- Whether logged tips were reported to the employer, when they were reported,
  and whether the employer had enough employee funds to collect every tip tax.
- Whether an amount is a voluntary tip or a mandatory service charge.
- The employer's federal income-tax withholding treatment for reported tips.
- Actual federal taxes already withheld and any employer correction or
  adjustment.
- State and local withholding, pretax and post-tax benefits, retirement
  contributions, garnishments, union dues, advances, and other payroll
  deductions. Federal payroll-tax rules do not supply these net-pay inputs.
- Final Additional Medicare Tax liability. It depends on filing status and
  income outside this employer, while paycheck withholding uses the employer's
  fixed $200,000 threshold.

If any required value is missing, the product can show an explicitly named
approximation with its assumptions. It should not present that number as the
employer's expected deposit or as actual Net pay.

## Contract implications for the decision ticket

The smallest supportable federal payroll-tax contract for one regular 2026
W-2 paycheck is:

1. Accept employer payroll wage bases for the paycheck, not only Shift gross.
2. Accept same-employer 2026 year-to-date Social Security and Medicare wages.
3. Calculate employee Social Security, Medicare, and employer-withheld
   Additional Medicare Tax as separate line items.
4. Keep the existing federal income-tax withholding estimate separate from
   payroll taxes and record how the employer treats reported tips if tip
   withholding is included.
5. Apply one documented product rounding rule and explain that valid employer
   rounding can differ.
6. Subtract worker-provided state, local, benefit, retirement, and other
   deductions only when the contract supports them. Missing items make the
   estimated net pay incomplete.

This contract estimates a payroll deposit. It does not calculate annual tax
liability, a refund, or the legal effect of the qualified-tips deduction.

## Primary sources

- [IRS Publication 15 for 2026](https://www.irs.gov/pub/irs-prior/p15--2026.pdf)
- [IRS Publication 15-T for 2026](https://www.irs.gov/pub/irs-prior/p15t--2026.pdf)
- [IRS Publication 505 for 2026](https://www.irs.gov/pub/irs-prior/p505--2026.pdf)
- [IRS Topic 761, Tips, withholding and reporting](https://www.irs.gov/taxtopics/tc761)
- [IRS Topic 608, Excess Social Security and RRTA tax withheld](https://www.irs.gov/taxtopics/tc608)
- [SSA contribution and benefit base](https://www.ssa.gov/OACT/COLA/cbb.html)
