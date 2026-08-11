import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ShiftList from '../components/ShiftList';
import { useShiftScreenData } from '../hooks/useShiftScreenData';
import { calculateEstimatedGrossByShift } from '../lib/overtime';

export default function HistoryScreen() {
  const { loading, error, allJobs, shifts, refresh } = useShiftScreenData('Shift history');
  const estimatedJobIds = useMemo(
    () => new Set(allJobs.filter((job) => job.overtime_enabled === 1).map((job) => job.id)),
    [allJobs]
  );
  const grossByShift = useMemo(
    () => calculateEstimatedGrossByShift(shifts, allJobs),
    [allJobs, shifts]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Text>Loading...</Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <ShiftList
        shifts={shifts}
        jobs={allJobs}
        grossByShift={grossByShift}
        estimatedJobIds={estimatedJobIds}
        onShiftDeleted={refresh}
        onShiftPress={(shift) =>
          router.push({ pathname: '/log-shift/details', params: { shiftId: shift.id } })
        }
      />
      <StatusBar style="auto" />
    </View>
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
});
