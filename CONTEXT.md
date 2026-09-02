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
A named position worked within a Job, such as server, driver, shift lead, or
kitchen staff. Its name is unique within the Job, and it has a default hourly
rate while each Shift preserves the rate that actually applied.
_Avoid_: Job, employer

**Shift**:
A period of work in one Role with recorded duration, wage rate, tips, and local
start date. A Shift that crosses midnight keeps the date on which it started.
_Avoid_: Paycheck, entry, work session

**Gross income**:
Recorded wages and tips before taxes and payroll deductions.
_Avoid_: Net pay, take-home pay

**Payroll-taxable wages**:
The worker-confirmed portion of one Paycheck's earnings subject to a named
payroll tax, such as federal income-tax withholding, Social Security, or
Medicare. Shift-derived Gross income may prefill this amount but does not prove
it.
_Avoid_: Gross income, tax liability, Social Security wage base

**Earnings received outside the Paycheck**:
The worker-confirmed portion of a Pay period's earnings already paid through
cash tips, daily tip payouts, or another method. It remains part of Gross income
and Payroll-taxable wages but is not paid again in the Paycheck.
_Avoid_: Payroll deduction, reimbursement, untaxed income

**Workweek**:
A Job employer's recurring 168-hour period used to group Shifts for overtime.
A changed Workweek applies from its chosen date without altering earlier work.
_Avoid_: Calendar week, Pay period

**Pay period**:
The date range that a Job's employer groups into one Paycheck. Shifts in that
range provide estimated earnings until the worker records payroll results.
_Avoid_: Trend period, workweek

**Paycheck**:
A completed payment from one Job for one Pay period with employer-reported
Gross income and Net pay. An estimate is not a Paycheck.
_Avoid_: Shift, income trend

**Net pay**:
The amount shown as deposited on a completed Paycheck after employer payroll
deductions.
_Avoid_: Net income, Gross income, Estimated net pay

**Estimated net pay**:
A prediction of one Paycheck's Net pay using supported payroll calculations,
worker-confirmed Payroll-taxable wages, and worker-supplied payroll inputs.
Missing inputs make the estimate incomplete, and the estimate never replaces
an actual Paycheck amount.
_Avoid_: Net pay, net income, annual tax liability

**Payroll deduction setting**:
A worker-provided fixed-dollar default for a named recurring deduction from a
Job's Paychecks. It applies from a chosen paycheck pay date, can be adjusted for
one estimate, and helps calculate Estimated net pay.
_Avoid_: W-4 deduction, actual Paycheck deduction

**Payroll reconciliation**:
The comparison between Shift-based estimated earnings for a Pay period and the
actual gross and Net pay on its Paycheck. Shifts remain the work record after
reconciliation.
_Avoid_: Shift correction, duplicate income

**Federal withholding estimate**:
An estimate of federal income-tax withholding for one regular W-2 Paycheck. It
is one possible input to Estimated net pay, not annual tax liability.
_Avoid_: Tax due, refund, Net pay
