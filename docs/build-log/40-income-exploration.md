# Build log — income exploration

## `97201c7` — feat: clarify income chart controls (2026-08-11)

The screen title now says View income. The job filter sits above the chart and
disappears when only one job has history. The weekday chart states that it uses
all logged shifts, and large Dynamic Type sizes get a horizontally scrollable
layout rather than seven crushed columns. Per-job lines pair color with distinct
dash patterns so color is not the only identifier.

## `7096930` — feat: add income date navigation (2026-08-11)

Preset ranges gained visible Older and Newer buttons. Horizontal chart gestures
remain dedicated to point inspection; paging does not compete for the same
gesture. Paging stops when no earlier scoped shift exists and never moves beyond
the latest window.

Custom opens the existing calendar in a native form sheet. The user selects an
exact start and end date, with malformed or reversed deep-link parameters
rejected before calculation. The pure trend layer owns every window boundary.
Custom selections use daily points through 31 days, weekly points through 366
days, and monthly points after that, keeping long histories legible without a
zoom system or date library.

Direct assertions cover no-gap week and quarter pages, rolling years, prior
calendar years, exact custom boundaries, adaptive buckets, and invalid ranges.

## `3543022` — feat: compare income by job bars (2026-08-11)

All jobs now adds one horizontal gross-income comparison when at least two jobs
earned income in the visible window. Each labeled bar states its money, share,
and shift count; tapping one reuses the existing job scope for the whole
dashboard. The chart stays absent for one-job windows, where it would add no
comparison.

## `777cac5` — feat: drill into income shifts (2026-08-11)

The graph exposes a View shifts action. With no inspected point it opens the
whole visible period. After tapping or scrubbing a point it opens only that
day, week, or month. Week and month endpoints are clamped to the chart window,
so a partial latest bucket cannot include dates the graph did not show.

The detail screen reuses the virtualized shift rows, shows unambiguous full
dates, and preserves edit and soft-delete actions. Its estimate uses all shifts
for overtime calculation before filtering the displayed dates, avoiding a
period-boundary undercount.

## `ad13533` — feat: animate income chart changes (2026-08-11)

Changing job, range, or page fades the graph in over 180 ms. Reanimated 4.5.1
and Worklets 0.10.1 are the Expo SDK 57 versions, and the transition follows the
system Reduce Motion setting. Stack pushes and the custom-range form sheet keep
their native navigation motion.

TypeScript, the tracked repository hook, Expo dependency validation, three iOS
bundle exports, and the final changed-file Fallow audit passed. These checks do
not prove appearance, touch targets, motion, VoiceOver, or large-text behavior
on a physical iPhone; those remain replacement-build acceptance items.
