# Product

Tip Tracker helps tipped, hourly, and gig workers answer two questions:

1. What did I earn on each shift?
2. What patterns do I see in my income?

It is not a tax filing product, payroll system, bank connection, or source of
financial advice.

## iOS V1

The App Store launch is local-only:

- multiple jobs and historical rates
- shift logging with date, hours, tips, and optional notes
- optional clock times for overtime estimates
- edit and delete with confirmation
- gross income trends and hourly earnings
- CSV import/export
- lossless JSON backup and restore
- bounded federal withholding estimates

Logging must remain useful with no account, network, or server.

## Deferred scope

Android production acceptance, accounts, cloud backup, cross-device sync,
Postgres, AWS, one-time purchases, 1099 mileage and expenses, state/local tax
calculations, payroll, bank, employer, social, and tax-filing integrations
are all deferred until a separate product decision.

## Trust rules

- Store money as integer cents; never use floating point for stored money.
- Store duration as integer seconds; never infer it from rounded display text.
- Store a shift's rate on the shift so later job-rate changes cannot rewrite
  history.
- Use date-only ISO strings so timezone changes cannot move a shift to another
  day.
- Keep deleted local rows as tombstones so backups preserve user intent.
- Treat overtime and withholding outputs as estimates, never recorded facts.
- Re-read SQLite after writes so the screen reflects committed local data.

## Architecture

```text
UI → SQLite source of truth
  ├── pure gross, trend, overtime, and withholding calculations
  └── CSV and JSON file boundaries
```

The app does not need a global state store, a cache layer, a network client,
or a service mesh.

## Release standard

Static checks are necessary but insufficient. The iOS release also needs the
physical-device checklist in [`acceptance.md`](acceptance.md), a hosted privacy
policy, App Store metadata and screenshots, and a signed TestFlight/App Store
build.
