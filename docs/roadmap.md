# Roadmap

Last updated: 2026-08-27

## NEXT

1. Wait for build 7 to finish TestFlight processing.
2. Run [acceptance.md](acceptance.md) on that iOS build.
3. Fix only failures found in that pass and repeat the focused checks.
4. Complete the App Store listing and submit the accepted build for review.

## Current status

iOS production candidate build 7 is uploaded to App Store Connect for
TestFlight processing. It contains the standalone history flow, income
exploration, Expo SDK 57 dependency updates, and release-recovery fixes through
commit `4fb1350`.

The shipping app is local-only under [D33](decisions.md). Account, sync,
Postgres, AWS, and Android production work remain deferred.

## Shipping scope

- create jobs and preserve historical rates
- log, edit, and delete shifts
- review gross income by job and date range
- open the shifts behind a chart point
- import and export CSV data
- create and restore a lossless JSON backup
- use optional overtime and federal withholding estimates

The primary navigation is the native Log and Trends tabs under
[D11](decisions.md). Settings contains jobs, file tools, backup, and optional
estimate settings.

## Planned follow-up

The [restaurant roles and estimated net pay map](https://github.com/jordan-umpierre/tip-tracker/issues/1)
plans a later refinement. Its implementation is not part of build 7 or the
current `NEXT` release work.

## Release evidence

- Expo Doctor passed 21 of 21 checks on 2026-08-25.
- Expo dependencies, TypeScript, and the iOS bundle export passed.
- SQLite schema, migration, backup, and pure calculation checks passed.
- Failed database opens can retry, and release-flow read failures are visible.
- The EAS archive excludes local environment and visual-reference files.
- The public privacy and support pages are live and linked from Settings.
- A local shift survived force-quit and relaunch on an iOS preview build.
- Production build 7 came from commit `4fb1350`.
- EAS build `3c241984-17ff-4bd0-98db-b2b5461cea23` finished.
- Submission `6198cb77-98f8-43fa-b5fd-838cc451dce8` finished.
- Apple accepted the binary for App Store Connect processing.
- The build has not been submitted for App Review.

Automated checks and exports do not prove the physical-device flow,
accessibility, signing, store review, or production behavior.

## Data contract

SQLite is the local source of truth. Money is integer cents, duration is integer
seconds, dates are date-only ISO strings, and each shift stores the rate that
applied when it was worked.

Historical migrations retain old sync tables so existing databases can upgrade
without data loss. The shipping app does not read or write that deferred state.
