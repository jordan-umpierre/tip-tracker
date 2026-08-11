# Roadmap

This file answers what is true now, what blocks the iOS release, and what
should happen next. Historical implementation detail belongs in the
[`build log`](build-log/README.md); product scope belongs in
[`product.md`](product.md); technical rationale belongs in
[`decisions.md`](decisions.md).

Last updated: 2026-08-11

## Verdict

**The iOS production build is submitted to App Store Connect** ([D33](decisions.md)). The account,
sync, Postgres, and AWS work is sidelined. The remaining work is TestFlight
processing, iOS acceptance, store metadata, privacy hosting, and App Review.

## What is shipping

- create multiple jobs and preserve each shift's historical rate
- log, edit, and delete shifts
- review gross income and trends
- import/export CSV data
- create and restore a lossless JSON device backup
- use optional, clearly labeled overtime and federal withholding estimates

The primary flow is `Open → Log income → finish the task` ([D32](decisions.md)). Settings contains
jobs, import/export, backup, and optional estimate tools.

## Deferred

- Android production release and Android-specific acceptance
- accounts, cloud backup, cross-device sync, and the API
- Postgres, Supabase, AWS, Lambda, and deployment automation
- one-time purchases and entitlement enforcement
- 1099 mileage, expenses, quarterly-tax calculations, state/local taxes,
  payroll, bank, employer, social, or tax-filing integrations

## Next work, in order

1. Wait for build 5 to finish TestFlight processing, then complete
   [`acceptance.md`](acceptance.md) on the iOS build.
2. Fix only failures found in that pass and repeat the focused checks.
3. Host [`privacy-policy.md`](privacy-policy.md) at a public HTTPS URL.
4. Complete App Store Connect name, description, support URL, privacy URL,
   screenshots, age rating, and App Privacy answers.
5. Submit the processed build for App Store review.

## Evidence already captured

- Expo Doctor: 20/20 checks passed.
- Expo dependencies: up to date.
- TypeScript: passed after the local-only cut.
- SQLite schema, migration, backup, and pure calculation checks exist.
- iOS and Android bundle exports previously passed.
- First iOS preview build: local shift survived force-quit and relaunch on
  2026-08-07.
- iOS production build 5 completed from commit `53d4b56` on 2026-08-11.
- Build 5 submission is queued for App Store Connect processing under ASC app
  `6800162471`.

Exports and automated tests prove code paths and bundle generation. They do not
prove a physical device flow, accessibility, signing, store review, or
production deployment.

## Technical boundary

SQLite is the local source of truth. Money is integer cents, duration is
integer seconds, dates are date-only ISO strings, and a shift stores the rate
that applied when it was worked. Historical SQLite migrations still contain
the old sync tables so existing databases can be upgraded safely; the launch
app no longer reads or writes that deferred state.

## History

Use the [build log](build-log/README.md) for the chronological implementation
record. Use [decisions.md](decisions.md) only when the reason behind a choice
matters.
