# Local federal-withholding UI

## `cf30b1b` — feat: add local withholding estimator (2026-08-05)

Manage data now contains one optional Federal withholding surface for active
jobs. It uses the existing controls and calendar rather than a dependency or
state store. Every button and input has at least a 44-point target, selections
expose radio state, switches carry labels, and important result text is marked
selectable. Actual screen-reader behavior remains a native gate.

The save path collects the first paycheck pay date, filing status, supported
pay frequency, Step 2, Steps 3 and 4 as integer cents, and exempt status. It
uses a bound plain `INSERT`. The duplicate job/date constraint becomes a
specific “nothing was overwritten” message rather than an upsert or generic
failure.

The calculate path validates a real 2026 paycheck pay date and required
nonnegative federal taxable wages, reads the newest setting effective on or
before that date, and calls D20's pure calculator. A date before the first
setting stops with guidance. The displayed result repeats the job, pay date,
taxable wages, settings date, filing status, frequency, Steps 2/3/4, exempt
status, and estimated withholding. Neither taxable wages nor the result is
written to SQLite.

The full D20 disclosure appears before the fields: this is one regular W-2
paycheck's 2026 federal withholding estimate, not take-home, total payroll tax,
annual liability, refund, or amount due. It names FICA, state/local, 1099,
supplemental-wage, nonresident-alien, part-year, cumulative-wage, and other
special-method exclusions; app gross is not used; and Step 4(b) eligibility is
not decided by the app.

## Verification boundary

The full hook passes, including 52 schema checks, the 1-to-4 migration and
rollback/parity suite, backup checks, and every pure library test. New direct
assertions cover strict money parsing, invalid dates, unsupported years, saved
row mapping, exemption, disclosure wording, and duplicate SQLite error shapes.
TypeScript, Expo dependency alignment, Expo Doctor 20/20, and web, iOS, and
Android exports pass. Fallow reports zero dead code and duplication.

No native interaction is claimed. Fallow's three changed-file complexity
estimates for the form, save handler, and calculate handler remain unsuppressed
until their picker, keyboard, alert, SQLite, result, and accessibility branches
run on iOS and Android. The native schema migration and isolated version-2
three-table backup/restore drill also remain open.
