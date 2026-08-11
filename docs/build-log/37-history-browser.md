# Build log — shift history browser

## `d37e005` — feat: simplify shift history browsing (2026-08-11)

The Log no longer presents years and months as nested disclosure rows. It now
selects the newest year and month by default, shows years as a horizontal chip
row, and shows the selected year's months as cards with shift counts and gross.
Only the selected month's shifts render below the browser. Existing edit, delete,
overtime labels, and one virtualized `FlatList` remain unchanged.

The old expansion flattener and its tests were deleted because nothing uses the
disclosure interaction now. `groupShifts` remains the source for sorted periods,
month shifts, and subtotals. D15 records the tradeoffs and the known ceiling.

Verification: repository hook, TypeScript, all pure-library checks, iOS bundle
export, Fallow dead-code and duplication scans, and the changed-file Fallow
audit passed. The queued App Store Connect build 5 predates this commit; a new
production build is required before this browser reaches TestFlight or App
Review.
