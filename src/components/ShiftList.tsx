import { ReactElement, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { parseCalendarDate } from '../lib/dates';
import { formatCents, formatHours } from '../lib/format';
import { groupShiftsByMonth } from '../lib/shiftGroups';
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
  // and totals go here rather than sitting above this component, so the whole
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

  // Only months the user has actually tapped land in here. Everything else
  // falls back to "newest month open, the rest closed", which means the default
  // follows the data instead of needing an effect to re-seed itself whenever
  // the list reloads after a log, an edit, or an import.
  const [toggledMonths, setToggledMonths] = useState<Record<string, boolean>>({});
  const months = useMemo(() => groupShiftsByMonth(shifts), [shifts]);

  function toggleMonth(period: string, expanded: boolean) {
    setToggledMonths((current) => ({ ...current, [period]: !expanded }));
  }

  // A collapsed section is one with no data rows. The header still renders, so
  // collapsing costs nothing extra and SectionList keeps virtualizing the rows
  // that remain -- which is the whole reason this is not a plain map().
  const sections = months.map((month, index) => {
    const expanded = toggledMonths[month.period] ?? index === 0;
    return { ...month, expanded, data: expanded ? month.shifts : [] };
  });

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

  // SectionList instead of mapping shifts.map(...) inside a View: it only
  // renders the rows currently on screen rather than every row in the array,
  // which matters once there are hundreds or thousands of shifts. Sections
  // came later, when an imported history turned the flat list into a scroll
  // with no landmarks in it.
  //
  // The empty state is ListEmptyComponent rather than an early return. An
  // early return here used to be fine, but now that the form arrives as
  // `header`, returning before rendering the list would take the entire form
  // off screen for anyone who hasn't logged a shift yet -- which is everyone,
  // the first time they open the app.
  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(shift) => shift.id}
      // Android defaults this off. The header is what tells you where you are
      // mid-scroll, so it is worth having on both platforms rather than
      // accepting whichever default each one ships.
      stickySectionHeadersEnabled
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
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No shifts logged yet.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <MonthHeader
          expanded={section.expanded}
          grossCents={section.grossCents}
          period={section.period}
          shiftCount={section.shiftCount}
          onPress={() => toggleMonth(section.period, section.expanded)}
        />
      )}
      renderItem={({ item }) => (
        <SwipeableShiftRow
          jobName={jobNameById.get(item.job_id) ?? 'Unknown job'}
          shift={item}
          onDelete={() => handleDeletePress(item)}
          onPress={() => onShiftPress(item)}
        />
      )}
    />
  );
}

function MonthHeader({
  expanded,
  grossCents,
  period,
  shiftCount,
  onPress,
}: {
  expanded: boolean;
  grossCents: number;
  period: string;
  shiftCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={expanded ? 'Collapses this month.' : 'Expands this month.'}
      accessibilityRole="button"
      // Screen readers announce expanded/collapsed from this, so the triangle
      // is not the only thing carrying that state.
      accessibilityState={{ expanded }}
      style={styles.monthHeader}
      onPress={onPress}
    >
      <Text style={styles.monthChevron}>{expanded ? '▾' : '▸'}</Text>
      <Text style={styles.monthName}>{formatMonth(period)}</Text>
      <Text selectable style={styles.monthGross}>
        {formatCents(grossCents)}
      </Text>
      <Text style={styles.monthCount}>
        {shiftCount} {shiftCount === 1 ? 'shift' : 'shifts'}
      </Text>
    </Pressable>
  );
}

function formatMonth(period: string): string {
  const month = MONTH_NAMES[Number(period.slice(5, 7)) - 1];
  return month ? `${month} ${period.slice(0, 4)}` : period;
}

// The month header above a row already says the month and the year, so the row
// only needs the day. The weekday goes with it because which day of the week a
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
  monthHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    // Opaque, not transparent: these headers stick to the top of the list while
    // the rows scroll under them.
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  monthChevron: {
    width: 12,
    color: '#6b7280',
    fontSize: 12,
  },
  monthName: {
    flex: 1,
    color: '#111827',
    fontWeight: '700',
  },
  monthGross: {
    color: '#111827',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  monthCount: {
    width: 66,
    color: '#6b7280',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
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
