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

## `b771c03` — feat: add a year-to-date chart range and name windows by date (2026-08-03)

Device feedback on the shipped dashboard: the line under the gross figure read
"7 days ending Aug 3, 2026", which describes a calculation rather than a window,
and there was no way to see the calendar year so far.

The range strip is now 1W/1M/3M/1Y/YTD/All. Year to date is the only range
anchored to a calendar boundary instead of rolling backwards from the newest
shift, so `seriesKeys` gets its own branch producing January through the newest
shift's month. It shrinks to a single monthly point each January, which the
direct-run assertions cover alongside the three-month case.

Every range now names its window as a date range: "Jul 28 – Aug 3, 2026" for
1W, "September 2025 – August 2026" for 1Y, "Jan 1 – Aug 3, 2026" for YTD. Month-
measured ranges keep month precision because their edges land on month
boundaries anyway; YTD is month-bucketed but keeps day precision because it
starts on a date people recognise. The `endingRangeLabels` table is gone. The
shared year is printed once when both ends fall in the same year.

`TrendSeries` gained `startDate` to support this. The chart could have inferred
the window start from the first bucket key, but only `trends.ts` knows where a
range begins, and week buckets key on a Sunday that is not the window edge for
every range. Handing the date out keeps that knowledge in one module.

## `6de533f` — fix: stop truncating the weekday bar sample labels (2026-08-03)

The label under each weekday bar printed the shift count and the hours on two
lines inside a `Text` capped at `numberOfLines={2}`. A count like "167 shifts"
wrapped on its own and pushed the hours off the end, so hours survived only on
columns whose count fit one line. On the 845-row history that meant Saturday
alone showed "6 shifts / 26.9h" while the other six columns showed no hours,
which read as a deliberate inconsistency rather than the truncation it was.

Hours were dropped instead of the label widened. The bar already encodes dollars
per hour, so hours was a third number competing for roughly 40 points of column
width. The accessibility label still speaks both, where there is no width limit.

Both commits pass the tracked hook: TypeScript, the schema and migration checks,
and all five direct-run test files. Neither has been seen on a physical device.
