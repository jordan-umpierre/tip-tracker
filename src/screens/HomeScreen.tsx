import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateJobForm from '../components/CreateJobForm';
import { Job, listActiveJobs } from '../data/jobs';

export default function HomeScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listActiveJobs()
      .then(setJobs)
      .catch((cause) => console.error('Could not load jobs for Home.', cause))
      .finally(() => setLoading(false));
  }, []);

  function startLogging() {
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
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>TIP TRACKER</Text>
            <Text selectable style={styles.title}>What do you want to do?</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            hitSlop={8}
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.settingsText}>Settings</Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <ActionButton
            title="Log income"
            detail={jobs.length === 0 ? 'Add a job below to get started' : 'Record a shift'}
            symbol="＋"
            disabled={loading || jobs.length === 0}
            onPress={startLogging}
          />
          <ActionButton
            title="View income"
            detail="See trends and shift history"
            symbol="↗"
            onPress={() => router.push('/trends')}
          />
        </View>

        {jobs.length === 0 && !loading ? (
          <View style={styles.setup}>
            <Text style={styles.setupTitle}>Set up your first job</Text>
            <Text style={styles.setupText}>
              Your job rate is saved with each shift, so your past income stays accurate when rates change.
            </Text>
            <CreateJobForm onJobCreated={() => listActiveJobs().then(setJobs)} />
          </View>
        ) : null}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function ActionButton({
  title,
  detail,
  symbol,
  disabled = false,
  onPress,
}: {
  title: string;
  detail: string;
  symbol: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed, disabled && styles.actionDisabled]}
      onPress={onPress}
    >
      <View style={styles.actionIcon}>
        <Text style={styles.actionSymbol}>{symbol}</Text>
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { flexGrow: 1, gap: 24, padding: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 12,
  },
  eyebrow: { color: '#6b7280', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { maxWidth: 270, color: '#111827', fontSize: 30, fontWeight: '700', lineHeight: 36, marginTop: 6 },
  settingsButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  settingsText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  actions: { gap: 12, marginTop: 'auto' },
  action: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  actionPressed: { backgroundColor: '#eef4ff' },
  actionDisabled: { opacity: 0.55 },
  actionIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#eaf1ff',
  },
  actionSymbol: { color: '#2563eb', fontSize: 30, fontWeight: '500', lineHeight: 34 },
  actionCopy: { flex: 1, gap: 3 },
  actionTitle: { color: '#111827', fontSize: 19, fontWeight: '700' },
  actionDetail: { color: '#6b7280', fontSize: 14, lineHeight: 19 },
  chevron: { color: '#9ca3af', fontSize: 30, fontWeight: '300' },
  setup: {
    gap: 4,
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 12,
  },
  setupTitle: { color: '#111827', fontSize: 18, fontWeight: '700', paddingHorizontal: 16 },
  setupText: { color: '#6b7280', fontSize: 14, lineHeight: 20, paddingHorizontal: 16 },
});
