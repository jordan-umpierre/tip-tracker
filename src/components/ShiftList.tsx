import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MONTH_NAMES, parseCalendarDate, WEEKDAY_NAMES } from '../lib/dates';
import { formatCents, formatHours } from '../lib/format';
import { groupShifts } from '../lib/shiftGroups';
import { calculateShiftGrossCents } from '../lib/totals';
import { Job } from '../data/jobs';
import { deleteShift, Shift } from '../data/shifts';
type Props = {
  shifts: Shift[];
  jobs: Job[];
  grossByShift: ReadonlyMap<string, number>;
  onShiftDeleted: () => void;
  browseHistory?: boolean;
  emptyMessage?: string;
};

// fallow-ignore-next-line complexity -- List layout, period selection, and swipe actions are one device-tested interaction surface; the repo has no component coverage reporter for estimated CRAP scoring.
export default function ShiftList({
  shifts,
  jobs,
  grossByShift,
  onShiftDeleted,
  browseHistory = true,
  emptyMessage = 'No shifts logged yet.',
}: Props) {
  // Shifts only store job_id, not the job's name. Build the lookup once per
  // render instead of scanning the jobs array for every row.
  const jobNameById = new Map(jobs.map((job) => [job.id, job.name]));
  const estimatedJobIds = new Set(
    jobs.filter((job) => job.overtime_enabled === 1).map((job) => job.id)
  );

  const years = useMemo(
    () => groupShifts(shifts, grossByShift, estimatedJobIds),
    [estimatedJobIds, grossByShift, shifts]
  );
  const [selectedYearKey, setSelectedYearKey] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const selectedYear = years.find((year) => year.key === selectedYearKey) ?? years[0];
  const selectedMonth = selectedYear?.months.find((month) => month.key === selectedMonthKey)
    ?? selectedYear?.months[0];
  const visibleShifts = browseHistory ? selectedMonth?.shifts ?? [] : shifts;

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
  return (
    <FlatList
      style={styles.list}
      data={visibleShifts}
      keyExtractor={(shift) => shift.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        browseHistory && years.length > 0 ? (
          <HistoryBrowser
            years={years}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onYearPress={(yearKey) => {
              setSelectedYearKey(yearKey);
              setSelectedMonthKey(null);
            }}
            onMonthPress={setSelectedMonthKey}
          />
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      }
      renderItem={({ item }) =>
        <SwipeableShiftRow
          jobName={jobNameById.get(item.job_id) ?? 'Unknown job'}
          shift={item}
          grossCents={grossByShift.get(item.id) ?? calculateShiftGrossCents(item)}
          estimated={estimatedJobIds.has(item.job_id)}
          dateLabel={browseHistory
            ? formatRowDate(item.shift_date)
            : formatFullRowDate(item.shift_date)}
          onDelete={() => handleDeletePress(item)}
          onPress={() =>
            router.push({ pathname: '/log-shift/details', params: { shiftId: item.id } })
          }
        />
      }
    />
  );
}

// fallow-ignore-next-line complexity -- The year and month controls deliberately expose their visible states together; the repo has no component coverage reporter for estimated CRAP scoring.
function HistoryBrowser({
  years,
  selectedYear,
  selectedMonth,
  onYearPress,
  onMonthPress,
}: {
  years: ReturnType<typeof groupShifts>;
  selectedYear: ReturnType<typeof groupShifts>[number] | undefined;
  selectedMonth: ReturnType<typeof groupShifts>[number]['months'][number] | undefined;
  onYearPress: (yearKey: string) => void;
  onMonthPress: (monthKey: string) => void;
}) {
  return (
    <View style={styles.browser}>
      <View style={styles.browserHeading}>
        <View>
          <Text style={styles.browserTitle}>Browse history</Text>
          <Text style={styles.browserSubtitle}>
            {selectedMonth ? `${monthName(selectedMonth.period)} ${selectedYear?.period ?? ''}` : ''}
          </Text>
        </View>
        {selectedMonth ? (
          <Text style={styles.browserSummary}>
            {selectedMonth.shiftCount} {selectedMonth.shiftCount === 1 ? 'shift' : 'shifts'}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={styles.yearChips}
        showsHorizontalScrollIndicator={false}
      >
        {years.map((year) => (
          <YearChip
            key={year.key}
            year={year}
            selected={year.key === selectedYear?.key}
            onPress={() => onYearPress(year.key)}
          />
        ))}
      </ScrollView>
      {selectedYear ? (
        <View style={styles.monthGrid}>
          {selectedYear.months.map((month) => (
            <MonthCard
              key={month.key}
              year={selectedYear.period}
              month={month}
              selected={month.key === selectedMonth?.key}
              onPress={() => onMonthPress(month.key)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function monthName(period: string): string {
  return MONTH_NAMES[Number(period.slice(5, 7)) - 1] ?? period;
}

function YearChip({
  year,
  selected,
  onPress,
}: {
  year: ReturnType<typeof groupShifts>[number];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${year.period}, ${year.shiftCount} shifts`}
      style={({ pressed }) => [
        styles.yearChip,
        selected && styles.yearChipSelected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.yearChipText, selected && styles.yearChipTextSelected]}>
        {year.period}
      </Text>
    </Pressable>
  );
}

function MonthCard({
  year,
  month,
  selected,
  onPress,
}: {
  year: string;
  month: ReturnType<typeof groupShifts>[number]['months'][number];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${monthName(month.period)} ${year}, ${month.shiftCount} shifts, ${formatCents(month.grossCents)}`}
      style={({ pressed }) => [
        styles.monthCard,
        selected && styles.monthCardSelected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.monthName, selected && styles.monthNameSelected]}>
        {monthName(month.period)}
      </Text>
      <Text style={styles.monthMeta}>
        {month.shiftCount} {month.shiftCount === 1 ? 'shift' : 'shifts'}
      </Text>
      <Text style={styles.monthGross}>
        {month.estimated ? 'Est. ' : ''}{formatCents(month.grossCents)}
      </Text>
    </Pressable>
  );
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

const fullRowDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatFullRowDate(shiftDate: string): string {
  return parseCalendarDate(shiftDate)
    ? fullRowDateFormatter.format(new Date(`${shiftDate}T00:00:00Z`))
    : shiftDate;
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
  grossCents,
  estimated,
  dateLabel,
  onDelete,
  onPress,
}: {
  jobName: string;
  shift: Shift;
  grossCents: number;
  estimated: boolean;
  dateLabel: string;
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
                <Text style={styles.rowDate}>
                  {dateLabel}
                </Text>
                {'   '}
                {jobName}
              </Text>
              {/* Gross on the right, matching how Trends lists a period. It is
                  what the app exists to show, so it should be the number the
                  eye lands on when scanning a month. */}
              <Text
                selectable
                accessibilityLabel={`${formatCents(grossCents)} ${estimated ? 'estimated gross' : 'gross'}`}
                style={styles.rowGross}
              >
                {estimated ? 'Est. ' : ''}{formatCents(grossCents)}
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
    paddingBottom: 24,
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
  browser: {
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  browserHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  browserTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  browserSubtitle: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 2,
  },
  browserSummary: {
    color: '#6b7280',
    fontSize: 13,
  },
  yearChips: {
    gap: 8,
    paddingBottom: 12,
  },
  yearChip: {
    alignItems: 'center',
    borderColor: '#d1d5db',
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 68,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  yearChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  yearChipText: {
    color: '#374151',
    fontWeight: '600',
  },
  yearChipTextSelected: {
    color: '#fff',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthCard: {
    backgroundColor: '#f3f4f6',
    borderColor: '#f3f4f6',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: '31.5%',
    flexGrow: 1,
    minHeight: 82,
    padding: 10,
  },
  monthCardSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  monthName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  monthNameSelected: {
    color: '#1d4ed8',
  },
  monthMeta: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
  },
  monthGross: {
    color: '#111827',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
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
