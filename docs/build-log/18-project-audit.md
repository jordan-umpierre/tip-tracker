# Whole-project audit

## `f9029dd` — chore: align Expo SDK 57 dependencies (2026-08-04)

`npx expo install --check` found four patch-level mismatches. Expo's own
installer aligned `expo`, `expo-constants`, `expo-linking`, and `expo-router`
with SDK 57. Expo Doctor returned to 20/20, the peer tree stayed deduplicated,
and every tracked test passed.

`npm audit` still reports 11 moderate findings through Expo's build-time
`xcode` -> `uuid` dependency chain. npm offers only `--force`, which would
downgrade this SDK 57 app to Expo 46. That is not a safe fix. Recheck after
future Expo patches; do not add an unverified transitive override.

## `bd492f8` — chore: declare pure test entry points (2026-08-04)

Fallow treated `format.test.ts` as dead while nine sibling tests carried
individual unused-file suppressions. `.fallowrc.json` now declares the existing
`src/lib/*.test.ts` execution contract once. The ten redundant or stale
suppressions and the calculator's duplicate suppression were removed.

Full dead-code and duplication runs now report zero issues and zero clones.
Fallow health still estimates ten complexity/CRAP findings and 18 functions
over its 60-line heuristic, led by `LogShiftForm.tsx`. Those are triage signals,
not stale or failing behavior: pure branches have direct assertions and native
UI paths have current device evidence. Splitting them solely to lower a static
score would be an unrelated, high-risk refactor. `npx fallow audit` remains the
changed-file gate.

## `0288662` — docs: correct current project status (2026-08-04)

The README still said Android was pending and D14 needed confirmation after
both had completed. It now matches the roadmap's iOS/Android evidence,
overtime progress, next step, CSV time limitation, and full pre-commit command
set. The Learning index now describes the version-3 migration ladder instead
of the retired 0/1 guard. The importer copy no longer calls real clock times
supported while it rejects them by contract.

## `b7a7fa1` — fix: restore Expo web bundling (2026-08-04)

A clean `expo export --platform all` exposed that the tracked `npm run web`
script could not resolve `react-native-web`. Adding Expo's SDK-matched package
reached the next missing setup: Expo SQLite's alpha web implementation loads a
WebAssembly engine, but Metro only treated SQL as an asset. `metro.config.js`
now bundles both `sql` and `wasm` assets, following the versioned SDK 57 SQLite
documentation.

The final clean-install export bundled web (including its SQLite worker and
WASM asset), iOS, and Android successfully. This is compile/bundle evidence,
not a hosted-web, signed-native, store-submission, or physical-device claim.

## `6a72b00` / `df72ade` — chore: finish dependency hygiene (2026-08-04)

Fallow cannot see Expo Router's platform-specific implicit import, so it called
the now-required `react-native-web` package unused. The config now carries a
narrow dependency exception, backed by the failed-without-it and
passed-with-it exports. The lockfile's `@types/react` then moved from 19.2.17 to
19.2.18, the only package below its allowed `wanted` version. Packages whose
registry `latest` exceeds `wanted` remain on Expo SDK 57's verified versions.

## Adversarial verification

Broken copies outside the checkout proved the checks fail for the defects they
claim to cover:

- changing the gross-pay divisor made `totals.test.ts` fail;
- allowing negative tips made `test-schema.sh` fail;
- changing the migrated workweek default made `test-migration.sh` fail;
- duplicating a README heading made `check-docs.sh` fail.

The unmodified repository passes all ten pure test files, 36 schema checks,
the preservation/rollback/1-to-3/parity migration suite, documentation checks,
TypeScript, Expo dependency alignment, Expo Doctor 20/20, dead-code analysis,
duplication analysis, and all three platform exports.
