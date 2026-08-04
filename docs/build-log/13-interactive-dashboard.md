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

## `3dc3013` — feat: select a chart point on tap, not only on drag (2026-08-03)

Device feedback: tapping a spot on the income line did nothing, and the point
only moved once a drag was already underway. The pan responder returned false
from `onStartShouldSetPanResponder`, which was how it avoided trapping vertical
scrolling, so a touch had to become a horizontal gesture before it counted.

It now claims the touch on press-down and selects from the grant event, matching
the reference behavior in Robinhood's chart. Vertical scrolling still works
because the responder agrees to termination requests: the surrounding scroll view
takes the gesture back, and `onPanResponderTerminate` clears the selection so a
scroll cannot leave a stray point highlighted behind it.

## `d2a28d1` — feat: group the shift history into collapsible months (2026-08-03)

The 845-row import made the Log an unbroken scroll. Virtualization had already
solved the rendering cost, but every row looked alike and nothing indicated
where in five years the scroll had landed.

`FlatList` became a `SectionList` grouped by month. Each sticky header shows the
month, its gross, and its shift count; all months except the newest start
collapsed. Collapsing is implemented as a section with an empty `data` array, so
the header still renders and the visible rows stay virtualized. Expansion state
records only the months the user has tapped and falls back to index zero, which
means the default follows the data with no effect re-seeding it after a log, an
edit, or an import. D15 records why collapsed rather than merely sectioned.

Rows dropped the ISO date the header now carries and lead with weekday and day
("Mon 3"), with the shift's gross right-aligned the way Trends already lists a
period. `src/lib/shiftGroups.ts` holds the grouping as a pure function with its
own direct-run assertions: order across a year boundary, ordering within a
month, and subtotals using the same D5 per-shift gross the other tab uses, since
a header disagreeing with Trends would be visible to the user.

TypeScript, the tracked hook, and all six direct-run test files pass. Neither
commit has run on a physical device.

## `5f95282` — fix: give every weekday bar the same baseline (2026-08-03)

Removing hours from the weekday labels exposed a layout bug that the truncation
had been hiding. The label under each column wraps at a different number of
lines depending on its text: "27 shifts" takes two, "6 shifts" takes one. The
bar track above it is `flex: 1` inside a fixed-height chart, so a column with a
shorter label handed the spare line back to its own bar. Saturday rendered
taller than its rate justified and sat on a lower baseline than the six columns
beside it, which is disqualifying for a chart whose whole job is comparing
those rates.

The label now has a fixed height of two lines regardless of what it contains,
so every track resolves to the same height. Worth noting for any future column
added below a flexible bar: anything of variable height under a `flex: 1`
sibling silently changes that sibling's size.

## `561bbd7` — refactor: move the Sunday week-start rule into dates.ts (2026-08-03)

Trends kept the Sunday-Saturday week boundary D10 pins as a private helper. The
Log needed the same rule to group by week, and two copies would drift apart with
nothing failing — a change to one would move shifts between groups on the other
screen. `dates.ts` already owns the stored date format, so the week boundary
moved beside it as `weekStartString`, with direct assertions added on the way:
a Sunday is its own start, and the start reaches back across a month, a year,
and a leap day rather than clamping to the 1st.

## `2e134d0` — feat: nest the shift history by year, month, and week (2026-08-03)

One level of month sections fixed the distance between months but not within
them. An open month of thirty shifts is still a long list, and it was still the
first thing on the tab.

The history is now a year > month > week tree, each level carrying its own gross
and shift count, with only the newest branch open: newest year, newest month
inside it, newest week inside that. The current week is on screen with no taps
and five years of history is a handful of rows.

`groupShifts` builds the tree and `flattenShifts` turns it plus the expansion
map back into one array of typed rows, so the whole thing still renders through
a single virtualized `FlatList`. Nested lists were never an option: scrollers
inside scrollers fight over the gesture and the inner one loses virtualization.
A week crossing a month boundary belongs to both months, holding only that
month's shifts in each, so a month's rows always add up to its own header; the
two halves share a week start but get distinct keys so collapsing one leaves the
other alone. Assertions cover ordering across a year boundary, the straddling
week, the untouched default, collapsing a year, and expanding an older group
without closing the newest. D15 is revised to record the level change and what
sticky headers cost.

## `4825557` — feat: open the log form and data tools from buttons (2026-08-03)

The tab opened onto seven input boxes and a CSV importer before any history was
visible. The form now sits behind one filled "Log a shift" button and the job
manager and importer behind a "Manage data" toggle, so the default state of the
screen is the history it exists to show.

Tapping a shift row still opens the form directly, since editing sets the same
state the button does. `LogShiftForm`'s Cancel stopped being gated on editing:
with the form always on screen a new entry never needed a way out, and behind a
button it does.

TypeScript, the tracked hook, the schema and migration checks, and all six
direct-run test files pass. None of these three have run on a physical device.

## `9958a4f` — feat: default the Trends summary to all time (2026-08-03)

Trends landed on the weekly average. All time answers "what has this work
earned" without the worked-week denominator needing explaining first, so it is
now the default, and it moved to the left of Weekly average to match — a
selected chip that is not the leftmost one reads as though a default was turned
off.

D10 is revised for the swap. The same revision fixes a gap left by `b771c03`:
D10's chart bullet still listed five ranges and had never been updated for YTD
or for the date-range window labels, so the decision log had been describing a
screen that no longer existed for several commits.

## `559ebc7` — feat: default the Trends breakdown to weekday (2026-08-03)

Weekday is the only breakdown that compares like periods against each other;
Month and Year list history in order, which the chart above already does better.
It becomes the default and moves to the left, with Month and Year widening to
the right so the row reads default-first like the summary chips now do.

## `2b5fbc1` — feat: scope the Trends summary to the selected chart range (2026-08-03)

The summary card described all history no matter what the chart above it was
showing, so selecting 1W changed the graph and left the number underneath
unchanged — which reads as the range buttons being broken rather than as two
different questions.

Both summaries now cover exactly the shifts the chart drew. `shiftsInWindow`
filters on `shift_date` between the series' start date and anchor date, both of
which are already date-only strings in the same format, so the comparison needs
no parsing and introduces no second definition of where a window begins. It sits
in `trends.ts` rather than in the screen specifically so it can be asserted
against the series it has to agree with: for all six ranges, the gross it selects
equals the sum of that series' points. A card contradicting the graph directly
above it is the failure worth a test.

The chips became Per hour and Per week. "All time" stopped being true once the
card followed the range, and naming the metric leaves the window to be stated
once, inside the card, where it is printed on every render.

The weekday, month, and year breakdown deliberately stays on all history. D10
originally required one scope for the whole screen; that is amended rather than
quietly broken, with the reason recorded — under a 1W range the Month and Year
views collapse to one row and the weekday bars drop to whichever days that week
contained, which is a worse chart than the one it would replace. The amendment
also records the cost: two date scopes on one screen, distinguished only by a
label the user has to read.

## `fc9e4d8` — fix: center the Manage data button (2026-08-03)

It inherited left alignment from the outlined buttons it replaced. One
`alignItems` on a button that now stands alone between the log button and the
history.

## `53e4764` — refactor: remove the lifetime totals strip from the Log screen (2026-08-03)

Hours, tips, and gross pay across every shift ever logged sat between the Log a
shift button and the history. Trends' All range shows the same three figures
with a chart around them, and the year rows in the history give them per period,
so nothing on this screen acted on it.

Removing it left `ShiftTotals.tsx` and `calculateTotals` with no callers, so
both went too rather than sitting as dead code. The D5 rounding assertions those
tests carried were the valuable part and are kept, re-pointed at
`calculateShiftGrossCents` — still the single place rounding happens for every
caller that groups shifts, which is the property the tests exist to pin.

## `976bedd` — feat: export every shift as a CSV file (2026-08-03)

Sits under the importer inside Manage data. `Directory.pickDirectoryAsync` puts
the file wherever the user chooses through the system's own picker on both
platforms, and adds no dependency — `expo-file-system` was already here for the
import side. React Native's built-in `Share` was considered first and rejected:
it carries a file URI on iOS but ignores it on Android.

The format is not D13's nine-column import contract. That contract stores Hours
to two decimals, so a shift held as 27300 seconds rounds to 7.58 hours and loses
30 seconds on the way out — unacceptable for the first half of a backup story.
The export writes what the app stores, with `Duration Seconds` beside a
human-readable `Hours`. D16 records the tradeoff, including the part given up:
an exported file cannot currently be re-imported.

`shiftExportCsv.ts` is pure and asserted directly: empty input still produces a
header row, ordering is oldest-first and byte-stable across runs, sub-dollar
amounts keep both decimals, gross comes from exact seconds rather than the
rounded hours column, and commas, quotes, and newlines inside a note or job name
are escaped so they cannot shift every following column.

A canceled picker and a failed write are indistinguishable to the caller, so the
alert states only what is certain of both: no file was written, nothing on the
device changed.

TypeScript, the tracked hook, and all seven direct-run test files pass. None of
this has run on a physical device, and the export in particular has never had a
real file written by it — the picker and the write are exactly the parts
assertions cannot reach.

## `33352ad` — feat: inset the shift history into one panel that fills the screen (2026-08-03)

Device screenshot with every year collapsed: the history ran edge to edge while
the Log a shift button and Manage data both sat in a 16pt gutter, and the rows
stopped partway down the screen against plain white.

Rows are now wrapped individually in a card style sharing that gutter, with only
the first row rounded at the top, so the stack reads as one inset panel. A
`ListFooterComponent` with `flex: 1`, under a `contentContainerStyle` of
`flexGrow: 1`, takes whatever height is left and closes the panel's bottom
corners. It collapses to zero as soon as the rows overflow, so a long history
behaves exactly as before.

The footer uses the panel's base tone rather than copying whichever row happens
to be last. Rows tint lighter the deeper they sit in the tree, so a neutral base
reads as the surface they are stacked on; matching the last row instead would
make the empty space look like one more row of unexplained height.
