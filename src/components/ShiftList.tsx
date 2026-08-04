import { ReactElement, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MONTH_NAMES, parseCalendarDate, WEEKDAY_NAMES } from '../lib/dates';
import { formatCents, formatHours } from '../lib/format';
import { flattenShifts, groupShifts, ShiftGroupRow, ShiftListRow } from '../lib/shiftGroups';
import { calculateShiftGrossCents } from '../lib/totals';
import { Job } from '../data/jobs';
import { deleteShift, Shift } from '../data/shifts';


// How far below centered the short-history layout sits, in points. See the
// `content` style for why the padding is twice this and what it costs on a
// long history.
const CONTENT_NUDGE_DOWN = 56;

type Props = {
  shifts: Shift[];
  jobs: Job[];
  onShiftDeleted: () => void;
  onShiftPress: (shift: Shift) => void;

  // Rendered above the rows, inside the same scroll view. The screen's form
  // and buttons go here rather than sitting above this component, so the whole
  // screen scrolls as one surface instead of squeezing the list into whatever
  // vertical space the form leaves behind.
  //
  // A FlatList cannot be nested inside a ScrollView -- two scrollers fighting
  // over the same gesture, and the inner one loses the virtualization that is
  // the entire reason to use a FlatList. Handing the header to the list is the
  // standard way out of that.
  header?: ReactElement;

  // Rendered below the rows, in the same scroller. This is where the Log a
  // shift button and the data tools live, so that on a cold open -- every group
  // collapsed, which is the default -- they sit near the bottom of the screen
  // within reach of a thumb rather than up by the status bar.
  //
  // The cost of a footer rather than a bar pinned to the screen: it is below
  // the rows, not above the tab bar, so expanding a year until the content
  // outgrows the screen puts it a scroll away. Pinning it would always be in
  // reach, but it would cover rows and could not hold the expanding form.
  footer?: ReactElement;
};

export default function ShiftList({
  shifts,
  jobs,
  onShiftDeleted,
  onShiftPress,
  header,
  footer,
}: Props) {
  // Shifts only store job_id, not the job's name. Build the lookup once per
  // render instead of scanning the jobs array for every row.
  const jobNameById = new Map(jobs.map((job) => [job.id, job.name]));

  // The short-history layout is centered and then nudged down, so the controls
  // below the rows sit near the thumb. The nudge is padding, and padding does
  // not stop applying when the content outgrows the screen the way
  // justifyContent does -- expanding a year left a band of blank space above
  // the first row, and pushed an open form down off the bottom.
  //
  // So it is applied only while the content actually fits. Both numbers come
  // from the list: onLayout for the viewport, onContentSizeChange for the
  // content.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [naturalContentHeight, setNaturalContentHeight] = useState(0);

  // Opening a shift for editing renders the form in the footer, below every
  // row. Without scrolling there the user taps Edit and nothing appears to
  // happen, because the thing that changed is off the bottom of the screen.
  //
  // The scroll cannot happen in the same breath as the tap: the form does not
  // exist yet, so there is nothing to scroll to. Instead the intent is
  // recorded and acted on the next time the content changes size, which is
  // exactly the moment the form has laid out.
  const listRef = useRef<FlatList<ShiftListRow>>(null);
  const scrollToFormPending = useRef(false);

  function openShift(shift: Shift) {
    scrollToFormPending.current = true;
    onShiftPress(shift);
  }

  const nudgeContentDown =
    viewportHeight > 0 &&
    naturalContentHeight > 0 &&
    naturalContentHeight + CONTENT_NUDGE_DOWN * 2 <= viewportHeight;

  // Only groups the user has actually tapped land in here; everything else is
  // shut. See flattenShifts for why nothing seeds this.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const years = useMemo(() => groupShifts(shifts), [shifts]);
  // The tree is flattened back into one list of rows, so a three-level history
  // still renders through a single virtualized FlatList. Nesting scrollers or
  // mapping the whole tree into Views would give up virtualization, which is
  // the thing keeping 845 shifts cheap.
  const rows = useMemo(() => flattenShifts(years, toggled), [years, toggled]);

  function toggleGroup(row: ShiftGroupRow) {
    setToggled((current) => ({ ...current, [row.key]: !row.expanded }));
  }

  // Alert.alert is React Native's built-in native confirmation dialog --
  // no extra dependency for something this common. Delete is destructive
  // from the user's point of view even though it's a soft delete under the
  // hood (they don't know or care that the row technically still exists),
  // so a stray tap shouldn't be able to lose a shift with no way back.
  function handleDeletePress(shift: Shift) {
    Alert.alert('Delete this shift?', `${shift.shift_date} — this can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteShift(shift.id);
          onShiftDeleted();
        },
      },
    ]);
  }

  // FlatList instead of mapping rows into Views: it only renders what is
  // currently on screen rather than every row in the array, which matters once
  // there are hundreds or thousands of shifts.
  //
  // The empty state is ListEmptyComponent rather than an early return. An
  // early return here used to be fine, but now that the form arrives as
  // `header`, returning before rendering the list would take the entire form
  // off screen for anyone who hasn't logged a shift yet -- which is everyone,
  // the first time they open the app.
  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      data={rows}
      keyExtractor={(row) => row.key}
      contentInsetAdjustmentBehavior="automatic"
      // Two ways out of the keyboard, because the number fields use
      // keyboardType="decimal-pad" and iOS gives that pad no return key --
      // so there was previously no way to dismiss it except tapping the date
      // field, which has a normal keyboard, and hitting return there.
      //
      // "handled" means a tap that some child already dealt with keeps the
      // keyboard up, and any other tap closes it. That gets both behaviors
      // right: tapping empty space dismisses, and tapping Log shift or Delete
      // fires on the first tap instead of being swallowed by the dismissal.
      // The default, "never", would eat that first tap.
      keyboardShouldPersistTaps="handled"
      // Dragging the list closes the keyboard too, which is what the rest of
      // iOS does and costs nothing here now that the screen is one scroller.
      keyboardDismissMode="on-drag"
      // Centers the whole screen vertically while it is short enough to fit --
      // groups collapsed, form closed -- so the content sits in the middle with
      // space above and below instead of stacked against the status bar.
      //
      // flexGrow makes the content area at least as tall as the list; once the
      // rows are taller than that, there is no spare height for justifyContent
      // to distribute and this stops having any effect. So an expanded history
      // still starts at the top and scrolls normally.
      contentContainerStyle={[styles.content, nudgeContentDown && styles.contentNudged]}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      // The measured content already includes whatever nudge is currently
      // applied, so it is subtracted back out before being stored. Without
      // that, applying the nudge would make the content "not fit", which would
      // remove the nudge, which would make it fit again -- a layout that
      // flickers between two states forever.
      onContentSizeChange={(_, height) => {
        setNaturalContentHeight(height - (nudgeContentDown ? CONTENT_NUDGE_DOWN * 2 : 0));
        if (scrollToFormPending.current) {
          scrollToFormPending.current = false;
          // One frame later, not now. Inside onContentSizeChange the new size
          // has been measured but not yet committed to the underlying scroll
          // view, so scrollToEnd computes against the old extent and does
          // nothing. A plain ScrollView tolerates the synchronous call, which
          // is why the pattern looks like it should work here.
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        }
      }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No shifts logged yet.</Text>
        </View>
      }
      renderItem={({ item }) =>
        item.kind === 'shift' ? (
          <SwipeableShiftRow
            jobName={jobNameById.get(item.shift.job_id) ?? 'Unknown job'}
            shift={item.shift}
            onDelete={() => handleDeletePress(item.shift)}
            onPress={() => openShift(item.shift)}
          />
        ) : (
          <GroupRow row={item} onPress={() => toggleGroup(item)} />
        )
      }
    />
  );
}

function GroupRow({ row, onPress }: { row: ShiftGroupRow; onPress: () => void }) {
  const group = GROUP_STYLES[row.kind];

  return (
    <Pressable
      accessibilityHint={row.expanded ? 'Collapses this group.' : 'Expands this group.'}
      accessibilityRole="button"
      // Screen readers announce expanded/collapsed from this, so the triangle
      // is not the only thing carrying that state.
      accessibilityState={{ expanded: row.expanded }}
      style={[styles.groupRow, group.row]}
      onPress={onPress}
    >
      <Text style={styles.groupChevron}>{row.expanded ? '▾' : '▸'}</Text>
      <Text numberOfLines={1} style={[styles.groupLabel, group.label]}>
        {formatGroupLabel(row)}
      </Text>
      <Text selectable style={[styles.groupGross, group.label]}>
        {formatCents(row.grossCents)}
      </Text>
      <Text style={styles.groupCount}>{row.shiftCount}</Text>
    </Pressable>
  );
}

// Each level only names the part its parent has not already said: the year row
// carries the year, so a month underneath it is just "August", and a week
// under that is just its start date.
function formatGroupLabel(row: ShiftGroupRow): string {
  if (row.kind === 'year') return row.period;
  if (row.kind === 'month') return MONTH_NAMES[Number(row.period.slice(5, 7)) - 1] ?? row.period;

  const date = parseCalendarDate(row.period);
  return date
    ? `Week of ${MONTH_NAMES[date.month - 1].slice(0, 3)} ${date.day}`
    : row.period;
}

// The group rows above already say the year and the month, so a shift only
// needs the day. The weekday goes with it because which day of the week a
// shift fell on is the thing a service worker actually recognises it by.
function formatRowDate(shiftDate: string): string {
  const date = parseCalendarDate(shiftDate);
  if (!date) {
    return shiftDate;
  }

  return `${WEEKDAY_NAMES[date.weekdayIndex]} ${date.day}`;
}

// One action's width. Two are revealed -- Edit and Delete -- so the row slides
// by twice this. Tapping a row still opens it for editing; the swipe action is
// a second route to the same thing, for people who have already started the
// gesture and would rather not close it to tap.
const ACTION_WIDTH = 72;
const REVEAL_WIDTH = ACTION_WIDTH * 2;

// How far the row has to be dragged before releasing opens it rather than
// springing shut. A third rather than a half: with two actions the full travel
// is 144pt, and needing to drag 72 of them before the row would even stay open
// made the gesture feel like it had to be done exactly right.
const OPEN_AT = REVEAL_WIDTH / 3;

function SwipeableShiftRow({
  jobName,
  shift,
  onDelete,
  onPress,
}: {
  jobName: string;
  shift: Shift;
  onDelete: () => void;
  onPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);

  function animateTo(value: number) {
    dragStart.current = value;
    Animated.timing(translateX, {
      toValue: value,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim a clearly horizontal gesture. Vertical drags stay with
        // FlatList, so revealing the actions does not make the history harder
        // to scroll.
        //
        // The horizontal component has to beat the vertical one, but only by
        // a little: requiring dx to be strictly greater than dy meant a swipe
        // with any drift in it was read as a scroll and the row did not move.
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.6 &&
          (gesture.dx < 0 || dragStart.current < 0),
        // Once this row owns the gesture it keeps it. Without this the
        // FlatList could take the gesture back as soon as the finger drifted
        // vertically -- which is what made a drag collapse halfway through if
        // it wandered towards another row.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            dragStart.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(Math.max(
            -REVEAL_WIDTH,
            Math.min(0, dragStart.current + gesture.dx)
          ));
        },
        onPanResponderRelease: (_, gesture) => {
          const position = Math.max(
            -REVEAL_WIDTH,
            Math.min(0, dragStart.current + gesture.dx)
          );
          // A flick opens it regardless of distance; otherwise a third of the
          // travel is enough. A flick back closes it from anywhere.
          const open =
            gesture.vx < -0.3 || (Math.abs(gesture.vx) < 0.3 && position <= -OPEN_AT);
          animateTo(open ? -REVEAL_WIDTH : 0);
        },
        onPanResponderTerminate: () => {
          animateTo(0);
        },
      }),
    [translateX]
  );

  function handleDelete() {
    animateTo(0);
    onDelete();
  }

  // Closes the revealed actions before opening the form, so the row is not
  // still slid open underneath when the user comes back from editing.
  function handleEdit() {
    animateTo(0);
    onPress();
  }

  return (
    <View style={styles.swipeable}>
      {/* Behind the row, revealed as it slides. Hidden from assistive tech
          because both actions are already reachable without the gesture: the
          row itself opens the editor, and Delete is an accessibility action on
          it. */}
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.rowActions}
      >
        <Pressable style={[styles.rowAction, styles.editAction]} onPress={handleEdit}>
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable style={[styles.rowAction, styles.deleteAction]} onPress={handleDelete}>
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens this shift for editing. Use the Delete shift action to delete."
          accessibilityActions={[{ name: 'delete', label: 'Delete shift' }]}
          style={styles.row}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') handleDelete();
          }}
          onLongPress={handleDelete}
          onPress={onPress}
        >
          <View style={styles.rowText}>
            <View style={styles.rowHeading}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                <Text style={styles.rowDate}>{formatRowDate(shift.shift_date)}</Text>
                {'   '}
                {jobName}
              </Text>
              {/* Gross on the right, matching how Trends lists a period. It is
                  what the app exists to show, so it should be the number the
                  eye lands on when scanning a month. */}
              <Text selectable style={styles.rowGross}>
                {formatCents(calculateShiftGrossCents(shift))}
              </Text>
            </View>
            <Text style={styles.rowDetail}>
              {formatHours(shift.duration_seconds)} · {formatCents(shift.tips_cents)} tips ·{' '}
              {formatCents(shift.hourly_rate_cents)}/hr
            </Text>
            {shift.note ? <Text style={styles.rowNote}>{shift.note}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    // Centers the whole screen while it is short enough to fit. Once the rows
    // are taller than the viewport there is no spare height to distribute and
    // this stops having any effect on its own, so a long history starts at the
    // top and scrolls normally.
    flexGrow: 1,
    justifyContent: 'center',
    // The controls are the last thing in the scroller now, so without this the
    // bottom one sits flush against the tab bar when scrolled to the end.
    // Nothing needed it while the rows were last.
    paddingBottom: 24,
  },
  // Applied only while the content fits -- see nudgeContentDown above.
  //
  // Padding on a centered container moves content down by half of what is
  // added: the top inset pushes it down, and the centering hands half of that
  // back by shrinking the space below. So the visible shift is
  // CONTENT_NUDGE_DOWN and the padding is twice it.
  contentNudged: {
    paddingTop: CONTENT_NUDGE_DOWN * 2,
  },
  empty: {
    padding: 16,
  },
  emptyText: {
    color: '#666',
  },
  row: {
    minHeight: 68,
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 12,
  },
  swipeable: {
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  groupRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingRight: 12,
  },
  groupChevron: {
    width: 12,
    color: '#6b7280',
    fontSize: 12,
  },
  groupLabel: {
    flex: 1,
    color: '#111827',
  },
  groupGross: {
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  // A bare count, since the column is always shift counts and the word costs a
  // third of the row's width to say so seven times over.
  groupCount: {
    width: 34,
    color: '#6b7280',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  // Depth reads as indentation plus weight: each level is lighter and further
  // in than its parent, so the nesting is visible without drawing lines.
  yearRow: { backgroundColor: '#e5e7eb', paddingLeft: 12 },
  yearLabel: { fontSize: 16, fontWeight: '700' },
  monthRow: { backgroundColor: '#f3f4f6', paddingLeft: 26 },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  weekRow: { minHeight: 38, backgroundColor: '#f9fafb', paddingLeft: 40 },
  weekLabel: { color: '#374151', fontSize: 13, fontWeight: '500' },
  rowText: {
    flex: 1,
  },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    fontWeight: '600',
  },
  rowDate: {
    color: '#6b7280',
    fontVariant: ['tabular-nums'],
  },
  rowGross: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowDetail: {
    color: '#444',
    marginTop: 2,
  },
  rowNote: {
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  actionText: {
    color: '#fff',
    fontWeight: '600',
  },
  rowActions: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  rowAction: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAction: {
    backgroundColor: '#2563eb',
  },
  deleteAction: {
    backgroundColor: '#dc2626',
  },
});

// Declared after `styles` because it reads from it: a const referencing another
// const higher in the file would blow up at import time, not at render.
const GROUP_STYLES = {
  year: { row: styles.yearRow, label: styles.yearLabel },
  month: { row: styles.monthRow, label: styles.monthLabel },
  week: { row: styles.weekRow, label: styles.weekLabel },
} as const;
