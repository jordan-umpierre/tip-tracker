import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCents, formatHours } from '../format';
import { Job } from '../jobs';
import { deleteShift, Shift } from '../shifts';

type Props = {
  shifts: Shift[];
  jobs: Job[];
  onShiftDeleted: () => void;
  onShiftPress: (shift: Shift) => void;
};

export default function ShiftList({ shifts, jobs, onShiftDeleted, onShiftPress }: Props) {
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

  if (shifts.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No shifts logged yet.</Text>
      </View>
    );
  }

  // FlatList instead of mapping shifts.map(...) inside a View: it only
  // renders the rows currently on screen rather than every row in the
  // array, which matters once there are hundreds or thousands of shifts.
  return (
    <FlatList
      style={styles.list}
      data={shifts}
      keyExtractor={(shift) => shift.id}
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
              {formatHours(item.minutes)} · {formatCents(item.tips_cents)} tips ·{' '}
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
