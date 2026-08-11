import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AccountPanel from '../components/AccountPanel';
import BackupRestore from '../components/BackupRestore';
import CreateJobForm from '../components/CreateJobForm';
import ExportCsvButton from '../components/ExportCsvButton';
import FederalWithholdingForm from '../components/FederalWithholdingForm';
import ImportCsvForm from '../components/ImportCsvForm';
import OvertimeSettingsForm from '../components/OvertimeSettingsForm';
import { archiveJob, Job } from '../data/jobs';
import { useShiftScreenData } from '../hooks/useShiftScreenData';
import { formatCents } from '../lib/format';

// Optional tools are intentionally gathered here. The landing screen should
// remain useful to someone who never creates an account or configures tax data.
export default function SettingsScreen() {
  const { loading, error, jobs, allJobs, shifts, refresh } = useShiftScreenData('Settings');

  if (loading) return <CenteredMessage message="Loading..." />;
  if (error) {
    return (
      <CenteredMessage message={error}>
        <Pressable accessibilityRole="button" style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </CenteredMessage>
    );
  }

  async function removeJob(job: Job) {
    const shiftCount = shifts.filter((shift) => shift.job_id === job.id).length;
    const historyText = shiftCount === 0
      ? 'No shifts are attached to it.'
      : `${shiftCount} ${shiftCount === 1 ? 'shift' : 'shifts'} and their trend history will stay.`;

    Alert.alert(
      `Remove ${job.name}?`,
      `You won't be able to log or import new shifts for this job. ${historyText}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove job',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveJob(job.id);
              await refresh();
            } catch (cause) {
              console.error('Could not remove the job.', cause);
              Alert.alert('Job not removed', 'Nothing changed. Try again.');
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Your shifts stay on this device. These tools are optional and can be ignored.
          </Text>
        </View>

        <Section title="Jobs">
          <CreateJobForm onJobCreated={refresh} />
          {jobs.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Active jobs</Text>
              {jobs.map((job) => (
                <View key={`${job.id}:${job.updated_at}`} style={styles.jobBlock}>
                  <View style={styles.jobRow}>
                    <View style={styles.jobText}>
                      <Text style={styles.jobName}>{job.name}</Text>
                      <Text style={styles.jobRate}>{formatCents(job.hourly_rate_cents)}/hr</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${job.name}`}
                      hitSlop={8}
                      style={styles.removeJobButton}
                      onPress={() => void removeJob(job)}
                    >
                      <Text style={styles.removeJobText}>Remove</Text>
                    </Pressable>
                  </View>
                  <OvertimeSettingsForm job={job} onSaved={refresh} />
                </View>
              ))}
            </>
          ) : null}
        </Section>

        {jobs.length > 0 ? (
          <Section title="Import and export">
            <ImportCsvForm jobs={jobs} existingShifts={shifts} onImported={refresh} />
            <ExportCsvButton shifts={shifts} jobs={allJobs} />
          </Section>
        ) : null}

        {jobs.length > 0 ? (
          <Section title="Federal withholding estimate">
            <FederalWithholdingForm jobs={jobs} />
          </Section>
        ) : null}

        <Section title="Device backup">
          <BackupRestore onRestored={refresh} />
        </Section>

        <Section title="Cloud account">
          <AccountPanel />
        </Section>

        <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back to shifts</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function CenteredMessage({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.centered} edges={['bottom']}>
      <Text style={styles.errorText}>{message}</Text>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  heading: { gap: 6 },
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#4b5563', lineHeight: 20 },
  section: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
  },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  sectionLabel: { color: '#374151', fontWeight: '600', marginTop: 4 },
  jobBlock: { gap: 4 },
  jobRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobText: { flex: 1 },
  jobName: { color: '#111827', fontWeight: '600' },
  jobRate: { color: '#6b7280', marginTop: 2 },
  removeJobButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 16 },
  removeJobText: { color: '#dc2626', fontWeight: '600' },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: { color: '#444', fontSize: 16, textAlign: 'center' },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  backButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
  },
  backButtonText: { color: '#2563eb', fontWeight: '600' },
});
