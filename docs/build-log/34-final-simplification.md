# Build log — final simplification

## `e10fa5c` — refactor: share log flow date formatting (2026-08-10)

The final Fallow duplication scan found the same 11-line calendar-date
formatter in the Details and Done screens. The formatter now lives in
`src/lib/format.ts`, preserving its UTC and invalid-date behavior, with direct
assertions added to the formatter test.

Verification: TypeScript check, formatter test, Fallow duplicate scan with zero
clone groups, changed-file Fallow audit, iOS export, and the full pre-commit
hook.
