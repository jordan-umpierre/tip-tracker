# Build log — Product revision after Android acceptance

Android acceptance and the first full CSV history exposed navigation, action
visibility, and information-density problems that a small test dataset did not.
This phase fixed those observed problems before expanding money calculations.

## `46e13bd` — feat: make Trends the home tab (2026-08-03)

Swapped the two thin route mappings so `index` renders Trends and `log` renders
Log, then reordered the static native triggers to match. The native tab bar now
disables scroll-edge transparency, which fixes the Log actions appearing under
the bar without hard-coding a platform-specific height.

The tracked hook and TypeScript passed before commit. Android later confirmed
that Trends opens selected and the opaque bar leaves both destinations clear.

## `a98ddcc` — feat: let users remove jobs safely (2026-08-03)

Added the first user-facing job manager. Remove sets the existing D3
`archived_at` timestamp after a native confirmation; it never deletes shifts.
Active job lists feed new-shift and import choices, while all jobs feed history
labels and Trends filters. Removing the last active job therefore leaves totals
and old rows visible instead of replacing the screen with an empty form.

The job and CSV controls moved to outlined actions above the shift form. Form
keys reset any stale job selection after archival, and automatic list insets
remain enabled. The schema test now proves that archival hides the active job
while all four related shift rows survive. The tracked hook, TypeScript, and
Fallow changed-file audit passed.

## `84ea1a4` — feat: add focused Trends summaries (2026-08-03)

Replaced the headline's full-history shift/hour sample with two explicit modes.
Weekly average divides total gross cents and duration seconds by unique active
Sunday-Saturday weeks; All time keeps weighted gross per hour and shows total
gross/time. "Worked week" is visible in the label because unlogged weeks are
not assumed to be zero-income employment.

Only one Year, Month, or Weekday breakdown renders at a time, with Year as the
compact default for multi-year imports. The existing native chips and chart are
reused; no selector or chart dependency was added. Twenty-six pure assertions
cover empty data, job scope, overlapping weeks, rounding, and year boundaries.

Running the supplied CSV through the parser and calculation produced 845 rows,
198 worked weeks, $127,831.15 total gross, $32.14/hr, $645.61 per worked week,
and 20.1 hours per worked week. The tracked hook, TypeScript, Expo dependency
check, Fallow changed-file audit, and Android interactions passed.

The request also raised overtime and taxes. D14 keeps both profile-driven:
overtime needs the employer's workweek and known pay arrangement; federal tax
needs current-year W2/W-4 inputs. Neither is folded into recorded gross with a
guessed universal percentage.
