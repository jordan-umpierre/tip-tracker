import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Job } from '../jobs';
import { Shift } from '../shifts';

type Props = {
  shifts: Shift[];
  jobs: Job[];
};

export default function ShiftList({ shifts, jobs }: Props) {
  // Shifts only store job_id, not the job's name. Build the lookup once per
  // render instead of scanning the jobs array for every row.
  const jobNameById = new Map(jobs.map((job) => [job.id, job.name]));

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
          <Text style={styles.rowTitle}>
            {jobNameById.get(item.job_id) ?? 'Unknown job'} — {item.shift_date}
          </Text>
          <Text style={styles.rowDetail}>
            {(item.minutes / 60).toFixed(1)}h · ${(item.tips_cents / 100).toFixed(2)} tips · $
            {(item.hourly_rate_cents / 100).toFixed(2)}/hr
          </Text>
          {item.note ? <Text style={styles.rowNote}>{item.note}</Text> : null}
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
});
