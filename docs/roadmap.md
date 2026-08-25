# Roadmap

This file answers what is true now, what blocks the iOS release, and what
should happen next. Historical implementation detail belongs in the
[`build log`](build-log/README.md); product scope belongs in
[`product.md`](product.md); technical rationale belongs in
[`decisions.md`](decisions.md).

Last updated: 2026-08-25

## Verdict

**iOS production candidate build 7 is built and uploaded to App Store Connect
for TestFlight processing** ([D33](decisions.md)). It contains the standalone
history flow, income exploration, Expo SDK 57 dependency updates, and
release-recovery fixes through commit `4fb1350`. The account, sync, Postgres,
and AWS work remains sidelined. The remaining work is Apple processing, iOS
acceptance, store metadata, and App Review.

## What is shipping

- create multiple jobs and preserve each shift's historical rate
- log, edit, and delete shifts
- review gross income by job, page through preset periods, choose a custom
  range, and open the shifts behind a chart point ([D34](decisions.md))
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

1. Wait for build 7 to finish TestFlight processing, then complete
   [`acceptance.md`](acceptance.md) on the iOS build.
2. Fix only failures found in that pass and repeat the focused checks.
3. Complete App Store Connect name, description, support URL, privacy URL,
   screenshots, age rating, and App Privacy answers.
4. Submit the accepted build for App Store review.

## Evidence already captured

- Expo Doctor: 21/21 checks passed on 2026-08-25.
- Expo dependencies: up to date.
- TypeScript and the iOS bundle export pass on current `main`.
- SQLite schema, migration, backup, and pure calculation checks exist.
- Failed database opens can retry, and failed shift deletion or release-flow
  reads now show recoverable errors. Focused regression tests cover the retry
  and deletion paths.
- The production EAS archive excludes local environment files and the preserved
  `Visual-Inspiration/` references.
- The public [privacy policy](https://jordan-umpierre.github.io/tip-tracker/privacy/)
  and [support page](https://jordan-umpierre.github.io/tip-tracker/support/)
  are live and linked from Settings.
- First iOS preview build: local shift survived force-quit and relaunch on
  2026-08-07.
- iOS production build 6 completed from commit `149e4ae` on 2026-08-11.
- Build 6 submission finished for App Store Connect under ASC app
  `6800162471`.
- Build 6 does not contain the standalone history changes through `d210480` or
  the income exploration changes through `ad13533`; do not use it as acceptance
  evidence for either workflow.
- iOS production build 7 (`3c241984-17ff-4bd0-98db-b2b5461cea23`) completed as
  an Expo SDK 57 store build from commit `4fb1350` on 2026-08-25.
- EAS submission `6198cb77-98f8-43fa-b5fd-838cc451dce8` finished, and Apple
  accepted build 7 for App Store Connect processing. It has not been submitted
  for App Review.

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
