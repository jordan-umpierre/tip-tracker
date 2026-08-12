import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCents } from '../lib/format';

export type JobIncome = {
  id: string;
  name: string;
  color: string;
  grossCents: number;
  shiftCount: number;
};

export default function JobIncomeChart({
  jobs,
  window,
  estimated,
  onSelectJob,
}: {
  jobs: JobIncome[];
  window: string;
  estimated: boolean;
  onSelectJob: (jobId: string) => void;
}) {
  const visibleJobs = jobs.filter((job) => job.shiftCount > 0);
  if (visibleJobs.length < 2) return null;

  const maxGross = Math.max(...visibleJobs.map((job) => job.grossCents), 1);
  const totalGross = visibleJobs.reduce((total, job) => total + job.grossCents, 0);

  return (
    <View style={styles.section}>
      <Text selectable style={styles.title}>
        {estimated ? 'Estimated gross income by job' : 'Gross income by job'}
      </Text>
      <Text style={styles.note}>{window}. Tap a job to focus the dashboard.</Text>
      <View style={styles.chart}>
        {visibleJobs.map((job) => {
          const percent = totalGross === 0 ? 0 : Math.round((job.grossCents / totalGross) * 100);
          return (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              accessibilityLabel={`${job.name}, ${formatCents(job.grossCents)}, ${percent}% of gross income, ${job.shiftCount} ${job.shiftCount === 1 ? 'shift' : 'shifts'}`}
              accessibilityHint="Focuses every income chart on this job."
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => onSelectJob(job.id)}
            >
              <View style={styles.labelRow}>
                <Text numberOfLines={1} style={styles.jobName}>{job.name}</Text>
                <Text selectable style={styles.amount}>{formatCents(job.grossCents)}</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${(job.grossCents / maxGross) * 100}%`,
                      backgroundColor: job.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.context}>
                {percent}% · {job.shiftCount} {job.shiftCount === 1 ? 'shift' : 'shifts'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, borderRadius: 16, backgroundColor: '#f9fafb', padding: 16 },
  title: { color: '#111827', fontSize: 20, fontWeight: '700' },
  note: { color: '#6b7280', marginTop: -8 },
  chart: { gap: 14 },
  row: { minHeight: 68, justifyContent: 'center', borderRadius: 10, paddingVertical: 4 },
  pressed: { opacity: 0.7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  jobName: { flex: 1, color: '#374151', fontSize: 15, fontWeight: '600' },
  amount: { color: '#111827', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 12, overflow: 'hidden', borderRadius: 6, backgroundColor: '#e5e7eb', marginTop: 6 },
  fill: { height: '100%', minWidth: 2, borderRadius: 6 },
  context: { color: '#6b7280', fontSize: 12, marginTop: 4 },
});
