# Effective-dated withholding settings

## `1350a12` — docs: define withholding settings history (2026-08-05)

D21 defines one settings timeline per job. `effective_from` is the first
paycheck pay date the row applies to, not the date an employee submitted a
W-4. The newest row on or before a pay date supplies the settings; one job/date
pair is unique, so the result cannot be ambiguous.

Tax year and paycheck taxable wages are calculation inputs rather than stored
W-4 settings. The table also does not store a calculated result, paycheck, or
annual projection. Backup version 2 must preserve every setting while the app
continues to restore exact version-1/schema-3 files as settings-free history.

## `42f3265` — feat: persist withholding settings losslessly (2026-08-05)

Schema version 4 adds `federal_withholding_settings` with a job foreign key,
canonical real effective date, the three supported filing statuses, seven pay
frequencies, boolean checks, safe nonnegative integer cents, timestamps, and a
unique job/date pair. The migration creates only that table, so upgraded users
receive no invented tax settings.

Backup version 2 adds a bounded settings array and exact field validation. The
parser permanently accepts the strict version-1/schema-3 shape, normalizes it
to an empty settings array, and still rejects unknown versions and fields.
Empty-only restore checks all three tables, inserts jobs before settings before
shifts, runs the foreign-key check, and compares every ordered row.

The first live settings read serves lossless backup. Create and pay-date lookup
functions were deferred until the tax UI calls them; the schema fixture pins
the future as-of query before, between, and on effective dates without keeping
unused production code.

## Verification boundary

The full hook passes: 52 schema checks, the complete 1-to-4 migration,
preservation, forced final-hop rollback, fresh/migrated table-trigger-index
parity, backup database parity/rollback, the permanent v1 fixture, the strict v2
contract, and every existing pure-library test. TypeScript, Expo dependency
alignment, Expo Doctor 20/20, and web, iOS, and Android exports pass. Fallow's
changed-file audit has no issues; the full repository retains its documented
pre-existing UI and database complexity estimates.

No native database migration or backup/restore interaction was run. No tax UI,
paycheck, calculated result, derived taxable wages, backend, authentication,
account, dependency, correction, or deletion behavior was added.
