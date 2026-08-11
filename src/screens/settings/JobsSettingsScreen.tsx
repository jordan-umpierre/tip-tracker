import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateJobForm from '../../components/CreateJobForm';
import OvertimeSettingsForm from '../../components/OvertimeSettingsForm';
import { archiveJob, Job } from '../../data/jobs';
import { useShiftScreenData } from '../../hooks/useShiftScreenData';
import { formatCents } from '../../lib/format';

export default function JobsSettingsScreen() {
  const { loading, error, jobs, shifts, refresh } = useShiftScreenData('Jobs settings');
  const [saving, setSaving] = useState(false);

  if (loading) return <Message text="Loading..." />;
  if (error) return <Message text={error} />;

  async function removeJob(job: Job) {
    const shiftCount = shifts.filter((shift) => shift.job_id === job.id).length;
    Alert.alert(
      `Remove ${job.name}?`,
      `You won't be able to log or import new shifts for this job. ${shiftCount === 0 ? 'No shifts are attached to it.' : `${shiftCount} shift${shiftCount === 1 ? '' : 's'} and their trend history will stay.`}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove job',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await archiveJob(job.id);
              await refresh();
            } catch (cause) {
              console.error('Could not remove the job.', cause);
              Alert.alert('Job not removed', 'Nothing changed. Try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <CreateJobForm onJobCreated={refresh} />
        {jobs.map((job) => (
          <View key={`${job.id}:${job.updated_at}`} style={styles.job}>
            <View style={styles.jobHeader}>
              <View>
                <Text style={styles.jobName}>{job.name}</Text>
                <Text style={styles.jobRate}>{formatCents(job.hourly_rate_cents)}/hr</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void removeJob(job)}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            <OvertimeSettingsForm job={job} onSaved={refresh} />
          </View>
        ))}
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Message({ text }: { text: string }) {
  return <SafeAreaView style={styles.message}><Text>{text}</Text></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  job: { gap: 8, borderRadius: 16, backgroundColor: '#fff', padding: 16 },
  jobHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobName: { color: '#111827', fontSize: 17, fontWeight: '700' },
  jobRate: { color: '#6b7280', marginTop: 2 },
  remove: { color: '#dc2626', fontWeight: '600' },
  back: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2563eb' },
  backText: { color: '#fff', fontWeight: '700' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
