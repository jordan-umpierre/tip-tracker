# Build log — Interactive income dashboard

The first full-history import made the remaining Trends and Log interaction
problems concrete: Trends needed a visual hook that did not render years of
daily rows, and permanent Delete labels made a common list feel destructive.

## `5bf1375` — feat: add interactive income dashboard (2026-08-03)

Added a pure chronological series beside the existing summaries. It anchors to
the newest shift in the selected job scope and produces five bounded views: 7
days, 30 days, 13 Sunday-start weeks, 12 months, or every month. Missing periods
remain zero points so spacing keeps its calendar meaning. The existing D5
per-shift gross calculation stays canonical. Direct-run assertions cover scope,
leap day, boundaries, empty buckets, exact rounding, and all five ranges.

Trends now starts with one blue gross-income line and oversized exact text.
Dragging horizontally selects the nearest point and updates gross, wages, tips,
hours, and date. Screen readers get the same values through an adjustable
control, and the abbreviated range tabs have full spoken labels. One
`react-native-svg` dependency supplies the path primitives; React Native owns
the gestures. D9 and D10 record the product and calculation boundaries.

Log now orders its content as form, totals, management, then history. Job
management and CSV import therefore sit low in the logging workflow without
being stranded after hundreds of rows. A shift row reveals its red Delete
action only after a left swipe. Long press and a custom accessibility action
reach the same existing native confirmation and D4 soft-delete path. React
Native's built-in `PanResponder` and `Animated` were sufficient; no second
gesture or animation dependency was added.

The supplied CSV still parses as 845 rows from 2022-06-29 through 2026-08-03.
Its All chart is 51 monthly points. TypeScript, the tracked hook, Expo's
dependency check, Fallow's changed-file audit, and fresh iOS and Android exports
pass. An Android cold run confirmed range selection, graph scrubbing, vertical
scrolling, the reordered management section, swipe reveal, and confirmation
without deleting the test row. The current iOS evidence is bundle-only;
physical-iPhone gesture, VoiceOver, and CSV picker checks remain open.
