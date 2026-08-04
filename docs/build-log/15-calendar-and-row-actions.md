# Build log — Calendar picker and shift row actions

Layer 0 work, all of it driven by using the app on a device rather than by the
roadmap: the Log screen's controls were in the wrong place for a thumb, picking
a date meant typing one, and a swiped row offered only Delete.

## `b04649a` — feat: move the Log screen controls below the shift history (2026-08-04)

Log a shift and the data tools were the first thing on the tab, which put the
primary action up by the status bar on a phone held one-handed. They now render
below the rows, so on a cold open — every group collapsed, per D15 — they sit
near the bottom of the screen.

`ShiftList` grew a `footer` prop beside `header`; the screen's heading stays
above the rows and everything else moved down. A footer is not a bar pinned to
the screen, so expanding a year until the content overflows puts the controls a
scroll away. Pinning was rejected for now: it would cover rows and could not
hold the expanding form.

The centred short-history layout is nudged down so those controls sit lower.
That nudge is padding, and padding does not stop applying when the content
outgrows the viewport the way `justifyContent` does — unconditionally it left a
band of blank space above the first row of an expanded year and pushed an open
form off the bottom. It is now measured: `onLayout` gives the viewport,
`onContentSizeChange` the content, and the nudge applies only while the content
fits. The measured height includes whatever nudge is already applied, so that
is subtracted back out before comparing; without it, applying the nudge makes
the content stop fitting, which removes the nudge, which makes it fit again.

## `3a8d481` — feat: add a calendar picker to the shift date field (2026-08-04)

Typing a date still works and remains the primary path. The calendar is an
alternative, reached by an icon beside the field, and it dots the days that
already have a shift — which is the feature that decided how it got built.

`react-native-calendars` was spiked first rather than argued about: installed,
wired to real data, and run on the device. It rendered, dotted and selected
correctly on RN 0.86 with React 19. Its month swipe did not work. D17 records
why that settled it and what the library would have had to be worth.

Removing it left `buildMonthGrid` in `src/lib/monthGrid.ts`, a pure function
from a year and month to the cells of a grid, and `CalendarPicker` to render
them. Thirty assertions at this point, chosen for shape rather than invented:
February 2026 starts on a Sunday with 28 days, the shortest a month can lay
out; August 2026 starts on a Saturday with 31, the longest. February 2100 is
there because it divides by four and is not a leap year, which is the rule a
hand-written leap check gets wrong — verified by replacing the day-0 trick with
exactly that naive rule and watching the assertion fail.

Picking a day that already has a shift asks rather than silently duplicating:
Add new shift, Edit existing shift, Cancel. Doubles are legitimate and the data
already contains one, so the prompt informs instead of blocking. Edit is
offered only when exactly one shift exists on the date; with several, "the
existing shift" has no referent. The shift being edited is excluded from the
check, or opening the calendar while editing and tapping the date already in
the field would warn that the shift collides with itself.

Month and weekday names moved from `ShiftList` into `lib/dates.ts`, since the
history and the calendar label the same calendar.

## `2ed8544` — feat: animate the calendar picker and add a month and year chooser (2026-08-04)

Three things: the grid pages with an animation, `expo-haptics` gives feedback,
and the header opens a month and year chooser so a date a year back is two taps
rather than a dozen swipes.

The animation took three attempts and the two failures are the useful part.
Both rendered three months side by side and re-centred the strip after every
page, which requires moving the strip and swapping its contents at the same
instant. Done from the animation callback, it showed a frame of the month being
left behind. Moving it into `useLayoutEffect` did not help — and the reason is
worth keeping: with `useNativeDriver` the transform runs on the native thread,
so ordering JavaScript operations cannot fix a race between two threads. That
was diagnosed from frame-by-frame screenshots, where the flashed month was
identifiably the outgoing one rather than the incoming one.

The fix removes the re-centre instead of sequencing it. `monthIndex` and
`monthFromIndex` turn a month into a single integer, each rendered month is
positioned by its distance from an anchor, and paging animates to a different
offset. A month's pane never moves, so there is nothing left to race. The test
file round-trips every month of a decade, since an off-by-one there renders the
wrong month silently. 168 checks.

Cell height is pinned at 52 rather than left to the contents. A blank padding
cell has no circle and no dot, so a row's height depended on what landed in it
and the sheet changed size as months were paged. The chooser panel matches the
weekday row plus six grid rows for the same reason.

## `d3d077e` — feat: reveal Edit beside Delete when swiping a shift row (2026-08-04)

Edit sits inboard of Delete, so the destructive action stays the further reach.

Both Edit and a plain row tap now scroll to the form. It renders in the footer
below every row, so opening a shift changed something off the bottom of the
screen and read as nothing happening. The scroll waits for the next content
size change, which is when the form has laid out, and then one more frame:
inside `onContentSizeChange` the new size is measured but not yet committed to
the scroll view, so `scrollToEnd` measures against the old extent and does
nothing. A plain `ScrollView` tolerates the synchronous call, which is why the
pattern looks like it should work and does not.

The gesture was retuned after it felt, in use, like it had to be performed
exactly right. It required horizontal movement to strictly exceed vertical, so
any diagonal drift read as a scroll; horizontal now only has to beat 60% of
vertical, and the trigger distance dropped from 6pt to 4pt. It also allowed the
`FlatList` to reclaim the gesture mid-drag, which collapsed the row whenever a
finger wandered toward its neighbour — `onPanResponderTerminationRequest` now
refuses. Travel is 144pt rather than 176, and a third of it holds the row open
instead of a half.

TypeScript, the tracked hook, 21 schema checks and all nine direct-run test
files pass. Every behaviour above was confirmed on a physical iPhone before its
commit, which is the practice the export work earlier the same day argued for.
