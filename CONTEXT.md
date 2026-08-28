# Tip Tracker

Tip Tracker records restaurant wages, tips, and hours across different roles. It
shows gross income over time and can optionally estimate the net pay for one W-2
paycheck without filing taxes or moving money.

## Language

**Job**:
A worker's W-2 employment relationship with one restaurant or employer. A Job
may contain several Roles and owns the payroll settings shared by those Roles.
_Avoid_: Role, contractor gig, income source

**Role**:
A position worked within a Job, such as server, driver, shift lead, or kitchen
staff. A Role has a default hourly rate, while each Shift preserves the rate that
actually applied.
_Avoid_: Job, employer

**Shift**:
A dated period of work in one Role with recorded duration, wage rate, and tips.
_Avoid_: Paycheck, entry, work session

**Gross income**:
Recorded wages and tips before taxes and payroll deductions.
_Avoid_: Net pay, take-home pay

**Pay period**:
The date range that a Job's employer groups into one Paycheck. Shifts in that
range provide estimated earnings until the worker records payroll results.
_Avoid_: Trend period, workweek

**Paycheck**:
A payment from one Job for one Pay period. It may record payroll gross, payroll
deductions, and Net pay; it is not a Shift.
_Avoid_: Shift, income trend

**Net pay**:
The amount shown as deposited on a completed Paycheck after employer payroll
deductions.
_Avoid_: Net income, Gross income, Estimated net pay

**Estimated net pay**:
A prediction of one Paycheck's Net pay using supported payroll calculations and
worker-supplied payroll inputs. Missing inputs make the estimate incomplete, and
the estimate never replaces an actual Paycheck amount.
_Avoid_: Net pay, net income, annual tax liability

**Payroll reconciliation**:
The comparison between Shift-based estimated earnings for a Pay period and the
actual gross and Net pay on its Paycheck. Shifts remain the work record after
reconciliation.
_Avoid_: Shift correction, duplicate income

**Federal withholding estimate**:
An estimate of federal income-tax withholding for one regular W-2 Paycheck. It
is one possible input to Estimated net pay, not annual tax liability.
_Avoid_: Tax due, refund, Net pay
