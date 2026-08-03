import { ReactElement, useMemo, useRef } from 'react';
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
import { formatCents, formatHours } from '../lib/format';
import { Job } from '../data/jobs';
import { deleteShift, Shift } from '../data/shifts';

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

  // FlatList instead of mapping shifts.map(...) inside a View: it only
  // renders the rows currently on screen rather than every row in the
  // array, which matters once there are hundreds or thousands of shifts.
  //
  // The empty state is ListEmptyComponent rather than an early return. An
  // early return here used to be fine, but now that the form arrives as
  // `header`, returning before rendering the list would take the entire form
  // off screen for anyone who hasn't logged a shift yet -- which is everyone,
  // the first time they open the app.
  return (
    <FlatList
      style={styles.list}
      data={shifts}
      keyExtractor={(shift) => shift.id}
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
            <Text style={styles.rowTitle}>
              {jobName} — {shift.shift_date}
            </Text>
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
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontWeight: '600',
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
