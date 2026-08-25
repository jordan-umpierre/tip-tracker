# Production candidate preparation

This pass removed the known code and release-link blockers before replacing
the stale iOS production build. It did not begin the deferred architecture
work or restore accounts, cloud sync, Android production, Postgres, or AWS.

## `3070d89` — align Expo SDK 57 packages

`npx expo install --fix` moved Expo and the packages Expo Doctor identified to
their SDK 57-compatible patch versions. Expo Doctor then passed all 21 checks,
TypeScript passed, and the iOS bundle exported.

The dependency audit could safely patch `nanoid`. Remaining npm advisories are
inside Expo and React Native build tooling. npm's proposed complete fix would
downgrade Expo to SDK 46, so it was rejected instead of breaking the supported
SDK contract.

## `3ffb5b0` — make local-data failures recoverable

The database opener used to retain a rejected promise for the process lifetime.
The shared retry helper now keeps one in-flight or successful open but clears a
failed attempt. A focused test proves that concurrent callers still share one
successful open and that a later attempt can recover after failure.

Shift deletion now routes rejected writes to a visible alert without refreshing
the list. The job picker and saved-shift confirmation screen show retryable read
errors instead of an empty picker or a misleading success screen. The retry and
deletion tests were run red before the fixes and green afterward.

## `a9e2cc9` — make EAS input deterministic

The local `Visual-Inspiration/` directory remains on the Mac but is ignored by
Git and EAS. A tracked `.easignore` also keeps local environment and credential
files out of cloud build uploads. `eas build:inspect` confirmed the archive has
no files from the visual-reference directory and no local environment file.

## `0e8330a`, `24f4808`, and `a47610a` — publish release links

GitHub Pages publishes the tracked policy and a support page at stable HTTPS
routes. The workflow builds the privacy page from `docs/privacy-policy.md`, so
the hosted policy does not become a second copy that can drift. The first build
exposed an old Sass-compiler limitation; the follow-up changed the small site to
plain CSS, and the deployment then passed.

Settings links to:

- https://jordan-umpierre.github.io/tip-tracker/privacy/
- https://jordan-umpierre.github.io/tip-tracker/support/

Both routes returned HTTP 200 with the expected policy and support content.
The app's release-link test pins HTTPS, host, and route values. TypeScript, the
repository hook, iOS export, and changed-file Fallow audit passed after wiring
the links.

## `4fb1350` — verify and prepare the replacement candidate

The exact clean commit passed the Expo dependency check, all 21 Expo Doctor
checks, TypeScript, the repository hook, an iOS export, and an inspected
production archive. The archive contained no files from `Visual-Inspiration/`,
local environment files, or the static website source. Both public release
links returned the expected content.

The full Fallow run reported no dead code and no duplication. Its 25 health
findings are inherited architecture hotspots already assigned to post-release
work; the changed-file audit passed. The npm audit still reports 15 transitive
Expo and React Native build-tool advisories. npm's only complete proposal is a
breaking Expo SDK 46 downgrade, so those advisories remain documented rather
than forcing an unsupported dependency graph.

## iOS production candidate 7

EAS created the signed iOS 1.0.0 build 7 from commit `4fb1350`:

- build ID: `3c241984-17ff-4bd0-98db-b2b5461cea23`
- build status: `FINISHED`
- profile and distribution: `production`, App Store
- Expo SDK: `57.0.0`
- submission ID: `6198cb77-98f8-43fa-b5fd-838cc451dce8`
- submission status: `FINISHED`
- App Store Connect app: `6800162471`

Apple accepted the binary on 2026-08-25 and began TestFlight processing. This
upload did not submit the app for App Review. The remaining release gate is the
hands-on iOS acceptance pass, followed by store metadata and an explicit App
Review submission.
