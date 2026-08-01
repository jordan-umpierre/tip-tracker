# Build log — Layer 1 Trends

Implements D7 through D11: Expo Router owns navigation, Log and Trends are
native peer tabs, SQLite remains each screen's source of truth, and the tested
Layer 1 calculations become readable on-device without a chart dependency.

## `341274c` — chore: configure Expo Router (2026-08-01)

Installed the SDK 57-compatible Router packages with Expo's version-aware
installer:

```sh
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

Changed `package.json`'s entry to `expo-router/entry`, registered the Router and
status-bar plugins, added the `tiptracker` deep-link scheme, enabled typed
routes, and removed the old `index.ts` entry. The first `app/` route continued
to render the existing Log screen through a root `Slot`, isolating entrypoint
migration from the later UI change.

The tracked hook, `npx tsc --noEmit`, `npx expo config --type public`,
`git diff --check`, and a fresh iOS export all passed.

## `461ea4e` — fix: align React DOM with Expo SDK (2026-08-01)

Router's optional web peer initially resolved `react-dom@19.2.8` beside Expo
SDK 57's `react@19.2.3`. `npm ls react react-dom` correctly rejected that tree:
React DOM 19.2.8 requires React 19.2.8 or newer.

Used `npx expo install react-dom` to pin Expo's supported 19.2.3 pair. The
online `npx expo install --check` and `npm ls react react-dom` then passed.
React Native Web was not added because this product has no web requirement.

`npm audit` still reports ten moderate findings through Expo's build-time
`@expo/config-plugins -> xcode@3.0.1 -> uuid@7.0.3` path. npm's complete forced
remediation would replace Expo 57 with Expo 46, a breaking downgrade. No forced
fix was applied; recheck after Expo publishes a compatible tooling update.

## `0c7eb92` — feat: add native Trends tab (2026-08-01)

Replaced the temporary root `Slot` with D11's two-trigger `NativeTabs` layout.
The unstable API stays in `app/_layout.tsx`; `app/index.tsx` and
`app/trends.tsx` remain thin mappings to screen components.

Moved the old root wiring into `src/screens/LogScreen.tsx`. It still owns jobs,
shifts, edit selection, and post-write refreshes, and now re-reads through the
existing SQLite functions whenever its tab gains focus. Added a visible load
failure and retry path and replaced the fixed top padding with a safe-area
boundary.

Added `TrendsScreen.tsx` with:

- one All jobs or single-job scope for the entire screen;
- weighted tips per hour as the headline;
- exact gross-per-hour weekday values with proportional native `View` bars;
- shift count and total-time context for every rate;
- newest-first calendar month and year summaries, including "to date" labels;
- explicit no-data and invalid-data states; and
- route-owned SQLite reads on focus, with no Context or external store.

Verification after the dependency alignment:

```text
docs OK
schema OK (19 checks)
dates OK (11 checks)
format OK (1440 round-trips + 11 checks)
totals OK (7 checks)
trends OK (18 checks)
```

`npx tsc --noEmit`, `git diff --check`, Expo's online dependency check, and
fresh iOS and Android exports passed. Those exports prove both platform bundles
compile; physical iPhone inspection remains the next gate, and Android still
needs a device or emulator before release.

## `112e3a5` — chore: include Expo Router route types (2026-08-01)

The first development-server run after enabling typed routes generated
`.expo/types/router.d.ts` and `expo-env.d.ts`, then added their required include
patterns to `tsconfig.json`. Expo's JSON rewrite also removed the existing
teaching comments, so the final change kept Expo's four documented include
entries while restoring the comments around the project's Node test settings.

Confirmed against Expo's SDK 57 typed-route documentation: the generated files
remain gitignored, while `tsconfig.json` must include them for route
autocomplete and compile-time route checking. The tracked hook,
`npx tsc --noEmit`, and `git diff --check` passed before commit.
