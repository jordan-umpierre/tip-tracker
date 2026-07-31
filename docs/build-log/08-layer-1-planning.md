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
