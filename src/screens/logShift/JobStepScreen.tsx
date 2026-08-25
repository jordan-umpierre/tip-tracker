import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ShiftScreenState from '../../components/ShiftScreenState';
import { useShiftScreenData } from '../../hooks/useShiftScreenData';
import { formatCents } from '../../lib/format';

// Step zero, and only when it is a real question. Home sends the user straight
// past this to the date step when there is exactly one active job,
// because asking "which job?" of someone who has one is a tap that can only
// have one answer.
export default function JobStepScreen() {
  const { loading, error, jobs, refresh } = useShiftScreenData('job picker');

  if (loading || error) return <ShiftScreenState error={error} onRetry={refresh} />;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text selectable style={styles.title}>Which job?</Text>
        <Text style={styles.subtitle}>The rate below starts this shift off; you can change it on the next screen.</Text>

        {jobs.map((job) => (
          <Pressable
            key={job.id}
            accessibilityRole="button"
            accessibilityLabel={`${job.name}, ${formatCents(job.hourly_rate_cents)} per hour`}
            style={({ pressed }) => [styles.jobRow, pressed && styles.jobRowPressed]}
            onPress={() =>
              router.push({ pathname: '/log-shift/date', params: { jobId: job.id } })
            }
          >
            <View style={styles.jobText}>
              <Text style={styles.jobName}>{job.name}</Text>
              <Text style={styles.jobRate}>{formatCents(job.hourly_rate_cents)}/hr</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { flexGrow: 1, gap: 12, padding: 20, paddingTop: 24 },
  title: { color: '#111827', fontSize: 30, fontWeight: '700', lineHeight: 36 },
  subtitle: { color: '#6b7280', fontSize: 15, lineHeight: 20, marginBottom: 8 },
  jobRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  jobRowPressed: { backgroundColor: '#eef4ff' },
  jobText: { flex: 1, gap: 2 },
  jobName: { color: '#111827', fontSize: 17, fontWeight: '600' },
  jobRate: { color: '#6b7280', fontSize: 14, fontVariant: ['tabular-nums'] },
  chevron: { color: '#9ca3af', fontSize: 26 },
});
