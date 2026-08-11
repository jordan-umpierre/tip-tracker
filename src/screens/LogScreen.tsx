import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateJobForm from '../components/CreateJobForm';
import ShiftList from '../components/ShiftList';
import { useShiftScreenData } from '../hooks/useShiftScreenData';
import { calculateEstimatedGrossByShift, overtimeScope } from '../lib/overtime';

// This is the landing screen, so it has one job: show history and make logging
// a new shift obvious. Job management, imports, tax estimates, account access,
// and backup live in Settings instead of competing with the main action.
export default function LogScreen() {
  const { loading, error, jobs, allJobs, shifts, refresh } = useShiftScreenData('Log screen');

  const estimatedJobIds = useMemo(
    () => new Set(allJobs.filter((job) => job.overtime_enabled === 1).map((job) => job.id)),
    [allJobs]
  );
  const grossByShift = useMemo(
    () => calculateEstimatedGrossByShift(shifts, allJobs),
    [allJobs, shifts]
  );
  const estimateScope = useMemo(
    () => overtimeScope(shifts, allJobs, null),
    [allJobs, shifts]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text>Loading...</Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  function startLoggingShift() {
    if (jobs.length === 1) {
      router.push({ pathname: '/log-shift/date', params: { jobId: jobs[0].id } });
      return;
    }
    router.push('/log-shift/job');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ShiftList
        shifts={shifts}
        jobs={allJobs}
        grossByShift={grossByShift}
        estimatedJobIds={estimatedJobIds}
        onShiftDeleted={refresh}
        onShiftPress={(shift) =>
          router.push({ pathname: '/log-shift/details', params: { shiftId: shift.id } })
        }
        header={
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.historyTitle}>Logged shifts</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Settings"
                style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
                onPress={() => router.push('/settings')}
              >
                <Text style={styles.settingsButtonText}>Settings</Text>
              </Pressable>
            </View>
            {jobs.length === 0 ? (
              <CreateJobForm onJobCreated={refresh} />
            ) : (
              <Pressable
                accessibilityRole="button"
                style={styles.logShiftButton}
                onPress={startLoggingShift}
              >
                <Text style={styles.logShiftButtonText}>Log a shift</Text>
              </Pressable>
            )}
            {estimateScope.estimated && shifts.length > 0 ? (
              <Text style={styles.estimateNote}>
                Est. gross includes configured overtime.
                {estimateScope.hasUntimedEstimate
                  ? ' Shifts without times count wholly on their logged date.'
                  : ''}
              </Text>
            ) : null}
          </View>
        }
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
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
  headerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
  },
  historyTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  settingsButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#eaf1ff',
    paddingHorizontal: 14,
  },
  settingsButtonPressed: { backgroundColor: '#dbe7ff' },
  settingsButtonText: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  logShiftButton: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#2563eb',
    marginHorizontal: 16,
  },
  logShiftButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  estimateNote: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
