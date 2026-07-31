# Build log — Layer 1 planning

Part of the [build log](README.md). This phase starts with the architecture
choices required before building the Trends screen.

Companion docs: [../decisions.md](../decisions.md) for the numbered decisions,
[../roadmap.md](../roadmap.md) for what is next, and
[../product.md](../product.md) for Layer 1's product scope.

---

## `8a9d8bf` — docs: correct stale test and rounding references (2026-07-31)

The first Codex handoff found four descriptions left behind by the device-test
work:

1. `README.md`, `.githooks/pre-commit`, and the local `CLAUDE.md` still
   described the hook as running only docs, schema, and `totals.test.ts`.
   The hook actually runs every `src/lib/*.test.ts`, including date and
   editable-value round-trip checks.
2. `totals.test.ts` still gave its pre-restructure command
   (`node totals.test.ts`) instead of its path from the repo root.
3. D5 and its test still claimed each `ShiftList` row displays gross pay.
   Rows display hours, tips, and rate; gross is only in the summary.
4. Code comments cited the gitignored `CLAUDE.md` for tracked data
   conventions. They now cite `src/data/schema.sql`, which exists in every
   clone.

D5's decision did not change. Its reasoning now rests on the actual boundary:
a shift is the smallest earnings record, carries its own historical rate, and
gets one reusable whole-cent gross before totals group those records.

Verified with `check-docs.sh`, all 19 schema checks, all three pure-library
test files, and `tsc --noEmit`.

## `cabf21c` — docs: choose Expo Router for Layer 1 navigation (2026-07-31)

Added D7 before installing anything. Compared the three actual options rather
than treating "navigation" as one choice:

1. An `App.tsx` state toggle is the smallest answer for exactly two views, but
   the written roadmap already names several later screens, so it would be
   knowingly temporary.
2. React Navigation directly is valid in Expo and gives finer control over
   navigation state and link parsing, but this app has no requirement for that
   extra configuration.
3. Expo Router uses React Navigation underneath and adds the route structure
   Expo integrates with SDK 57.

Chose Expo Router at the first real navigation boundary: it would have been
premature during Layer 0, and avoiding it now would create code the existing
roadmap already says to replace.

Also corrected an overbroad statement made during the comparison: SDK 57 does
not prohibit React Navigation in Expo. The external `@react-navigation/*`
import restriction applies to application code already using Expo Router.

No package or application code changed. `roadmap.md` now points at the next
decision—pure TypeScript versus SQLite aggregation—before the router migration
begins.

## `d2b603c` — docs: choose pure TypeScript for Layer 1 aggregation (2026-07-31)

Added D8 after tracing the actual read path:

1. `listShifts()` already selects every non-deleted shift.
2. `App.tsx` already keeps that complete array in memory for the Log screen.
3. `totals.ts` already establishes and tests the boundary where SQLite owns
   stored facts and `src/lib/` owns derived arithmetic.

At the expected few-thousand-row ceiling, a linear TypeScript pass is not a
meaningful cost. Adding SQLite `GROUP BY` queries would create a second data
path without eliminating the existing full read. The decision is deliberately
reversible: move aggregation toward SQLite when shifts are paginated, a
measurement finds a bottleneck, or an API needs summaries without transferring
raw rows.

Corrected one stale `totals.ts` comment found during the trace. It still said
gross values were visible in each `ShiftList` row; they are not. No runtime
behavior changed.

Attempted the repository's Fallow completion workflow before editing, but
Fallow is not installed and running `npx --yes fallow` was blocked because it
would download and execute an unpinned package outside the sandbox. It was not
added as a project dependency or bypassed. Verification used the tracked
checks instead: docs, 19 schema checks, all three pure-library test files,
`tsc --noEmit`, and `git diff --check`.

## `46f5576` — docs: choose native bars for Layer 1 Trends (2026-07-31)

Added D9 after comparing numbers-only, a general chart dependency, and a
bounded native visualization.

Exact text values remain the accessible source of truth. The fixed
seven-weekday comparison may supplement them with horizontal bars made from
ordinary React Native `View`s. Month and year summaries start as numeric rows
or cards. A chart package would add its own rendering, responsive-layout,
compatibility, and accessibility surface for requirements Layer 1 does not
have.

The deliberate ceiling is part of the decision: one fixed comparison
component, not a home-grown chart framework. A real chart dependency becomes
justified by many chronological points, multiple series, touch inspection,
zooming, or panning.

`roadmap.md` now points at the semantic work exposed by the comparison—job
scope, weighted formulas, weekday metric, sample context, and calendar-period
outputs. No package or runtime code changed.

## `ccbf5ab` — docs: define Layer 1 Trends semantics (2026-07-31)

Added D10 before writing the aggregation module. The screen defaults to all
jobs, with one optional job filter applying to every result. Tips per hour is
the headline; gross per hour is the weekday comparison.

Both rates divide aggregate cents by aggregate minutes, so time weights the
answer. Gross first follows D5's per-shift wage rounding. Every rate carries
shift count and total time, while empty groups remain `null` rather than
claiming a measured `$0.00/hr`.

Month and year summaries use calendar periods and expose gross, tips, time,
and shift count. The current partial period remains visible as a to-date
result. Rolling windows, remembered filters, dual weekday metrics, and
confidence scoring were left out until real use justifies them.

Updated the Layer 1 learning note from an open question to a settled D10
reference. `roadmap.md` now starts implementation with one pure Trends module
and one dependency-free test file before Expo Router or UI work.
