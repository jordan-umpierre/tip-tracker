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
