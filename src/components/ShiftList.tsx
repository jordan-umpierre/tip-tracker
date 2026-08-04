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
import { parseCalendarDate } from '../lib/dates';
import { formatCents, formatHours } from '../lib/format';
import { flattenShifts, groupShifts, ShiftGroupRow } from '../lib/shiftGroups';
import { calculateShiftGrossCents } from '../lib/totals';
import { Job } from '../data/jobs';
import { deleteShift, Shift } from '../data/shifts';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
};

export default function ShiftList({ shifts, jobs, onShiftDeleted, onShiftPress, header }: Props) {
  // Shifts only store job_id, not the job's name. Build the lookup once per
  // render instead of scanning the jobs array for every row.
  const jobNameById = new Map(jobs.map((job) => [job.id, job.name]));

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
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
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
            onPress={() => onShiftPress(item.shift)}
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

const DELETE_ACTION_WIDTH = 88;

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
        // FlatList, so concealing Delete does not make the history harder to scroll.
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          (gesture.dx < 0 || dragStart.current < 0),
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            dragStart.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(Math.max(
            -DELETE_ACTION_WIDTH,
            Math.min(0, dragStart.current + gesture.dx)
          ));
        },
        onPanResponderRelease: (_, gesture) => {
          const position = Math.max(
            -DELETE_ACTION_WIDTH,
            Math.min(0, dragStart.current + gesture.dx)
          );
          const open =
            gesture.vx < -0.3 ||
            (Math.abs(gesture.vx) < 0.3 && position <= -DELETE_ACTION_WIDTH / 2);
          animateTo(open ? -DELETE_ACTION_WIDTH : 0);
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

  return (
    <View style={styles.swipeable}>
      <Pressable
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.deleteAction}
        onPress={handleDelete}
      >
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
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
    flexGrow: 1,
    justifyContent: 'center',
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
  deleteText: {
    color: '#fff',
    fontWeight: '600',
  },
  deleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
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
