# Federal withholding calculator

## `738f86c` — docs: bound the first federal withholding estimate (2026-08-04)

D20 limits the first tax feature to an opt-in 2026 federal income-tax
withholding estimate for one regular W-2 paycheck. The caller supplies federal
taxable wages and the employee's actual 2020-or-later W-4 values. The
calculation runs on-device and rejects unsupported tax years instead of
silently reusing stale rules.

That boundary deliberately does not claim take-home pay, FICA, state or local
tax, annual liability or refund, supplemental-wage handling, 1099 income,
nonresident-alien or special methods, or automatic qualification of tips and
overtime for deductions.

## `565967c` — feat: add 2026 federal withholding calculator (2026-08-05)

`src/lib/federalWithholding2026.ts` implements Publication 15-T Worksheet 1A
and all six 2026 automated percentage-method tables: the three filing statuses
with the standard and Step-2 schedules. It supports semimonthly, monthly,
biweekly, weekly, daily, quarterly, and annual payroll periods.

Money enters and leaves the boundary as integer cents. Internally, `bigint`
rational arithmetic preserves percentage products and division across pay
periods; the calculator rounds half up only once, at the final paycheck result.
It validates the year, filing status, pay frequency, W-4 fields, boolean flags,
safe integer cents, and safe output range.

The direct assertion file pins every table's bracket signature, exercises all
filing statuses, both schedules, and all pay frequencies, and derives five
Worksheet 1A examples independently. It also covers Steps 3 and 4, exemption,
zero floors, bracket edges, half-cent rounding, and invalid inputs.

## Verification boundary

The direct Node test prints `2026 federal withholding OK`, TypeScript passes,
and the full repository hook passes. Fallow reports no dead code or duplication,
and its changed-file audit is clean. Its full-repository health command retains
seven pre-existing complexity estimates outside this calculator.

No database migration, stored W-4 setting, paycheck record, or UI was added.
The next unit is a schema-version-4 and backup-format compatibility decision.
Backup version 1 currently represents exact schema-3 jobs and shifts, so tax
records cannot be added without defining how new backups remain lossless and
how older backups restore.
