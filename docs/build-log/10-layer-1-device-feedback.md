# Build log — Layer 1 device feedback

The first physical-iPhone pass confirmed that Trends calculations matched the
logged shifts. It also found four problems compilation could not answer:

- supporting text on the blue headline card was hard to read;
- the UI stopped offering job creation after the first job;
- tips per hour was not a satisfying headline metric; and
- horizontal weekday bars were harder to scan than a vertical comparison.

The chart report originally cut off after `exep`. The user clarified that they
meant vertical bars would improve the user experience before D9 or the UI was
revised. D9 and D10 now preserve both the original reasoning and the new device
evidence.

## `d9341fa` — fix: improve Trends headline contrast (2026-08-03)

The generic gray `context` style worked on white sections but was also reused
inside the dark-blue headline card. Added one card-specific light-blue color
instead of changing every context label in the screen.

The foreground/background pair measures 5.49:1. `npx tsc --noEmit`,
`git diff --check`, and the tracked pre-commit checks passed.

## `02a7120` — feat: allow adding multiple jobs (2026-08-03)

The schema, `createJob()`, `CreateJobForm`, and shift job chips already handled
multiple jobs. `LogScreen` was the missing boundary: it rendered the creation
form only when the job list was empty.

Added one **Add another job** toggle to the existing `FlatList` header and
reused `CreateJobForm`. Creating a job collapses the form and refreshes the
SQLite-backed job list. No schema, route, state store, modal, or dependency was
needed. `npx tsc --noEmit`, `git diff --check`, and the tracked checks passed.

## `4714516` — feat: make gross per hour the Trends headline (2026-08-03)

Replaced the headline field and UI label rather than displaying two competing
rates. The formula is:

```text
round(total gross cents * 60 / total minutes)
```

This is a time-weighted ratio of totals, not an average of each shift's rate.
The latter would let a short shift influence the result as much as a long one.
The pure Trends check now pins empty data, one-job scope, all-job scope, and
D5's per-shift cent rounding against the gross headline. All 18 Trends checks,
TypeScript, and the tracked checks passed.

## `ac65e6a` — refactor: show weekday trends as vertical bars (2026-08-03)

Replaced seven horizontal rows with seven fixed native columns. Every column
keeps the exact rate above the bar, the abbreviated weekday below it, and its
shift count and hours underneath. A full accessibility label still exposes the
weekday, rate, and sample context. The bars remain ordinary React Native
`View`s; a general chart dependency is still not justified for seven values.

TypeScript, all 18 Trends checks, `git diff --check`, the tracked checks, and
fresh iOS and Android exports passed. A Playwright preview could not bundle
because this mobile-only checkout intentionally does not install
`react-native-web`; adding a production dependency solely for a test preview
would have expanded scope. The physical iPhone remains the authoritative
visual check, and the revised four-item flow still needs that recheck.

The repository's Fallow completion workflow remains unavailable. There is no
`node_modules/.bin/fallow`, and `npx --no-install fallow` did not complete; no
new analysis dependency was added for this correction pass. The final fallback
is the tracked hook, TypeScript, stale-name/dead-style searches, Expo's
dependency check, the React peer tree, and fresh native exports.

The online Expo SDK check and React 19.2.3 peer tree pass. `npm audit` still
reports the same ten moderate transitive build-tool findings through
`@expo/config-plugins -> xcode -> uuid`; its only complete proposed fix would
downgrade Expo 57 to Expo 46. No forced breaking downgrade was applied.

## `0b5b8aa` — fix: validate job creation input (2026-08-03)

The final comment audit found that `CreateJobForm` still described silent
validation as a deferred first-pass gap. That was stale once the same form
became the public entry point for every additional job.

Replaced `parseFloat()` with `Number()` plus explicit empty and finite checks,
matching `LogShiftForm`: pasted text can no longer be partially accepted, a
negative rate is rejected, and zero remains valid for tip-only work. Invalid
input now produces a native **Check job details** alert instead of making the
button appear broken. Updated the completion comment so it describes both the
first-job and additional-job parent flows.

TypeScript, `git diff --check`, an adversarial input matrix, and every tracked
pre-commit check passed.

## `4f1408d` — chore: harden cold-agent handoff (2026-08-03)

The tracked `AGENTS.md` previously contained only the SDK 57 documentation
rule, while the detailed baton instructions lived in ignored local
`CLAUDE.md`. Added a short tracked pointer to `docs/roadmap.md`'s `NEXT`
section plus the required Git and hooks checks, without duplicating current
status into another file.

Updated `check-docs.sh`'s own comment to reference tracked guidance instead of
ignored `CLAUDE.md`. Added `.fallow/` and `.playwright-cli/` to the root ignore
rules so local analysis artifacts cannot dirty a cold agent's worktree.

The documentation checker, `git diff --check`, the configured `.githooks`
path, and every tracked pre-commit check passed.

The final terminology sweep also narrowed `centsPerHour()`'s old "tips or
gross" no-data comment to the gross rate its current callers actually derive.
That comment-only correction ships with the handoff documentation commit.

## `1035266` — refactor: remove unused LogScreen import (2026-08-03)

Fallow remained unavailable, so the fallback added a stricter TypeScript pass
with `--noUnusedLocals --noUnusedParameters`. It found one dead React Native
`View` import left in `LogScreen` after its layout moved into `ShiftList`.
Removed that import and reran the strict check successfully.
