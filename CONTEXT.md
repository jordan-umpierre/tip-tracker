# Tip Tracker

Tip Tracker records income from multiple kinds of work and helps a worker understand gross earnings and supported federal tax estimates without moving money or filing taxes.

## Language

**Job**:
A source of earned income, including W-2 employment, tipped work, and self-employed contract work.
_Avoid_: Employer, gig, side hustle

**Shift**:
A dated period of work for a Job with recorded duration and earnings.
_Avoid_: Entry, work session

**Job tax treatment**:
The optional classification of a Job as W-2 employment, self-employed contract work, or not configured.
_Avoid_: Employment type, job type

**Tax household**:
The person or joint filers whose income, deductions, credits, taxes, withholding, and payments are combined on one federal tax return. It does not mean everyone living at one address.
_Avoid_: App account, household members

**Tax profile**:
The optional, tax-year-specific facts a Tax household supplies for an annual federal projection. Worker-supplied totals for outside income, adjustments, deductions, credits, other taxes, withholding, and payments are inputs, not Tip Tracker determinations of eligibility.
_Avoid_: Tax return, W-4 settings

**Gross income**:
Recorded wages, tips, and contractor revenue before taxes or contractor expenses.
_Avoid_: Take-home pay, net income

**Paycheck**:
A payment from one W-2 Job for a defined pay period. A Paycheck may record the employer's gross pay, payroll deductions, and deposited amount; it is not a Shift.
_Avoid_: Shift, contractor payment

**Pay period**:
The date range for one W-2 Job that an employer groups into one Paycheck. Shifts within the range provide estimated earnings until payroll is reconciled.
_Avoid_: Trend period, workweek

**Payroll reconciliation**:
The comparison between estimated Shift earnings for a Pay period and the actual gross and deposited amounts on its Paycheck. The Paycheck controls paid-income and tax totals after reconciliation; the Shifts remain the work record.
_Avoid_: Duplicate income, Shift correction

**Payroll adjustment**:
The difference between estimated Shift earnings and actual Paycheck gross for a reconciled Pay period. The difference is not assigned to an individual Shift without supporting payroll detail.
_Avoid_: Missing Shift, calculation error

**Take-home pay**:
The deposited amount on a completed Paycheck after all employer payroll deductions.
_Avoid_: Net income, Estimated after-tax income

**Estimated take-home pay**:
A prediction of a future Paycheck's deposited amount using supported federal withholding and payroll-tax calculations plus worker-supplied nonfederal deductions. Missing deductions make the result incomplete, and an actual Paycheck replaces its estimate for completed pay periods.
_Avoid_: Take-home pay, annual tax liability

**Estimated after-tax income**:
Gross income minus supported estimated federal taxes and recorded contractor expenses. It excludes state and local taxes, benefits, insurance, retirement contributions, garnishments, and unrecorded expenses.
_Avoid_: Net income, take-home pay

**Tax set-aside**:
Money a self-employed worker may reserve for future federal taxes based on an estimate. It is not a tax payment or final tax liability.
_Avoid_: Tax payment, tax bill

**Contractor expense**:
A recorded business expense associated with self-employed work that may reduce estimated taxable profit.
_Avoid_: Deduction

**Contractor net profit**:
Recorded contractor revenue minus recorded Contractor expenses, before personal federal taxes. The calculation does not decide whether an expense is deductible under tax law.
_Avoid_: Net income, Take-home pay, Estimated after-tax income

**Federal withholding estimate**:
An estimate of federal income-tax withholding for one regular W-2 paycheck. It is not annual tax liability or Estimated after-tax income.
_Avoid_: Tax due, refund, take-home pay
