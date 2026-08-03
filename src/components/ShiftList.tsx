import { ReactElement } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
        <View style={styles.row}>
          {/* Tapping the text column opens this shift for editing. Kept as
              its own Pressable rather than wrapping the whole row, so it
              stays a sibling of the Delete button below instead of a
              parent of it -- no ambiguity about which handler a tap on
              Delete fires. */}
          <Pressable style={styles.rowText} onPress={() => onShiftPress(item)}>
            <Text style={styles.rowTitle}>
              {jobNameById.get(item.job_id) ?? 'Unknown job'} — {item.shift_date}
            </Text>
            <Text style={styles.rowDetail}>
              {formatHours(item.duration_seconds)} · {formatCents(item.tips_cents)} tips ·{' '}
              {formatCents(item.hourly_rate_cents)}/hr
            </Text>
            {item.note ? <Text style={styles.rowNote}>{item.note}</Text> : null}
          </Pressable>
          <Pressable onPress={() => handleDeletePress(item)} hitSlop={8}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      )}
    />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
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
    color: '#dc2626',
    fontWeight: '600',
    marginLeft: 12,
  },
});
