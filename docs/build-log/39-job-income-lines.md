# Build log — per-job income lines

## `a4b8df0` — feat: compare gross income by job (2026-08-11)

The View income chart no longer draws wage, tips, and total as three overlapping
lines. A selected job draws one gross-income line. All jobs draws one gross line
for every job with income in the selected window, while the large figure above
the chart remains the combined total.

Every job line uses the aggregate chart's existing dates and one shared vertical
scale. This matters when two jobs have different latest shifts: their points
still line up on the same calendar buckets. The legend shows each job's exact
gross for the range and updates all of those figures while the chart is scrubbed.
The adjustable accessibility value announces the same per-job amounts.

The pure trend check proves that per-job buckets share the aggregate window and
add back to the aggregate gross. TypeScript, the repository hook, Expo dependency
check, iOS bundle export, and the changed-file Fallow audit passed. Repository-wide
Fallow health still reports the 25 inherited complexity findings present before
this change. Physical-device appearance and touch behavior remain part of the
replacement-build acceptance pass.
