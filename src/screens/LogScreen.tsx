import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateJobForm from '../components/CreateJobForm';
import { useShiftScreenData } from '../hooks/useShiftScreenData';

// Logging is the primary task. History and Settings are separate destinations
// so neither competes with the form the user opened this tab to complete.
export default function LogScreen() {
  const { loading, error, jobs, refresh } = useShiftScreenData('Log screen');

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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Log income</Text>
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

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.historyButton, pressed && styles.historyButtonPressed]}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.historyButtonText}>Browse history</Text>
        </Pressable>
      </ScrollView>
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
  content: { flexGrow: 1, justifyContent: 'center', gap: 16, paddingBottom: 24 },
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
  title: { color: '#111827', fontSize: 18, fontWeight: '700' },
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
  historyButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#2563eb',
    borderRadius: 10,
    borderWidth: 1,
    marginHorizontal: 16,
  },
  historyButtonPressed: { backgroundColor: '#eff6ff' },
  historyButtonText: { color: '#2563eb', fontSize: 16, fontWeight: '700' },
});
