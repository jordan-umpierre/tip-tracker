# Product

Tip Tracker helps tipped, hourly, and gig workers answer two questions:

1. What did I earn on each shift?
2. What patterns do I see in my income?

It is not a tax filing product, payroll system, bank connection, or source of
financial advice.

## V1

Free local-first V1 includes:

- multiple jobs and historical rates
- shift logging with date, hours, tips, and optional notes
- optional clock times for overtime estimates
- edit and delete with confirmation
- gross income trends and hourly earnings
- CSV import/export
- lossless JSON backup and empty-device restore
- optional cloud account, backup, and cross-device sync

The primary flow is deliberately clear:

`Open → choose Log income or View income → finish the task`

Logging stays usable without an account or network connection. An account is
available when a user wants cloud backup or another device.

## Optional tools

Settings contains advanced local tools:

- per-job overtime rules, clearly labeled as estimates
- a bounded federal withholding estimate for one regular W-2 paycheck
- CSV import/export
- full device backup and restore
- cloud account and sync controls

The withholding calculator is not take-home pay, total payroll tax, annual tax
liability, a refund, or an amount owed. Its disclosure stays beside the result.

## Deferred scope

The following require separate product and release decisions:

- one-time purchases and entitlement validation
- 1099 mileage and expense tracking
- state/local tax calculations
- payroll, bank, employer, social, or tax-filing integrations

The launch is free. One-time purchases remain a post-launch monetization
slice until the paid feature and entitlement boundary are defined.

## Trust rules

- Store money as integer cents; never use floating point for stored money.
- Store duration as integer seconds; never infer it from rounded display text.
- Store a shift's rate on the shift so later job-rate changes cannot rewrite history.
- Use date-only ISO strings so timezone changes cannot move a shift to another day.
- Keep destructive local records as tombstones while sync exists.
- Treat overtime and withholding outputs as estimates, never recorded facts.
- Re-read SQLite after writes so the screen reflects committed local data.

## Architecture

```text
UI → SQLite source of truth
  ├── pure gross, trend, overtime, and withholding calculations
  ├── CSV and JSON boundaries
  └── authenticated account/sync layer
```

The app does not need a global state store, a cache layer, or a service mesh.
The hard part is preserving financial and offline correctness while keeping
the logging path fast.

## Release standard

Static checks and exports are necessary but insufficient. A release also needs
the physical-device checklist in [`acceptance.md`](acceptance.md), a hosted
privacy policy, store metadata and screenshots, production provider settings,
and a live database with every required migration applied.
