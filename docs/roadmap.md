# Roadmap

This file answers one question: what is true now, what blocks release, and
what should happen next? Historical implementation detail belongs in the
[`build log`](build-log/README.md); product scope belongs in
[`product.md`](product.md); technical rationale belongs in
[`decisions.md`](decisions.md).

Last updated: 2026-08-10

## Verdict

**NOT READY for public App Store or Google Play release.** The local product
core is implemented and the code checks pass. Release still requires physical
acceptance, store evidence, production infrastructure decisions, and a hosted
privacy policy.

## What is shipping as V1

Tip Tracker is a local-first income tracker:

- create multiple jobs and preserve each shift's historical rate
- log, edit, and delete shifts
- review gross income and trends
- import/export CSV data
- create and restore a lossless JSON device backup
- use optional, clearly labeled overtime and federal withholding estimates
- connect an account for cloud backup and cross-device sync

The primary flow is `Open → Log income → finish the task`, with View income as
the second persistent tab. Job management, account access, tax settings,
import/export, and backup live behind separate Settings screens so they do not
compete with the recurring logging task.

## Deferred

Do not market these as V1 features:

- one-time purchases or entitlement enforcement
- 1099 mileage, expenses, or quarterly-tax calculations
- state/local tax calculations or tax advice
- payroll, bank, employer, social, or tax-filing integrations

The account and sync implementation is in the first-release scope, but local
logging must remain useful when the account or network is unavailable.

## Next work, in order

1. Complete [`acceptance.md`](acceptance.md) on the iOS preview build and an
   Android build. Record failures inline. This includes local logging,
   editing, deletion, overtime labels, backup/restore, accessibility, and
   offline behavior.
2. Complete cloud account/sync evidence: provider, SMTP, cross-device,
   conflict, privacy, and deletion behavior.
3. Before deploying the API build that uses it, apply
   [`003_rate_limit.sql`](../server/migrations/003_rate_limit.sql) to the live
   Postgres database.
4. Fill and verify production authentication/API configuration together. The
   current production EAS environment is intentionally empty, so a production
   build would silently remove the cloud features now in release scope.
5. Publish the privacy policy at a hosted URL, confirm the app name, prepare
   store metadata/screenshots, and verify the final binary on both platforms.

## Evidence already captured

- Expo Doctor: 20/20 checks passed.
- Expo dependencies: up to date.
- TypeScript: passed.
- Server suite: 18 tests passed.
- Local sync suite: 15 tests passed.
- Auth/account/transport/lib checks: passed.
- Fallow dead-code scan: zero issues.
- Fallow duplication scan: zero clone groups.
- iOS and Android bundle exports: passed.
- First iOS preview build: local shift survived force-quit and relaunch on
  2026-08-07.

Exports and automated tests prove code paths and bundle generation. They do not
prove a physical device flow, provider behavior, accessibility, signing,
store review, or production deployment.

## Technical boundary

SQLite is the local source of truth. Money is integer cents, duration is
integer seconds, dates are date-only ISO strings, and a shift stores the rate
that applied when it was worked. Calculations are pure TypeScript modules
covered by direct tests. The server is Node/Express/Postgres behind
authenticated sync and is not needed to log a shift.

## History

Use the [build log](build-log/README.md) for the chronological implementation
record. Use [decisions.md](decisions.md) only when the reason behind a choice
matters.
