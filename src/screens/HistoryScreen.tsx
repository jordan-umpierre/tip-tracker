import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import ShiftList from '../components/ShiftList';
import ShiftScreenState from '../components/ShiftScreenState';
import { useShiftScreenData } from '../hooks/useShiftScreenData';
import { calculateEstimatedGrossByShift } from '../lib/overtime';

export default function HistoryScreen() {
  const { loading, error, allJobs, shifts, refresh } = useShiftScreenData('Shift history');
  const grossByShift = useMemo(
    () => calculateEstimatedGrossByShift(shifts, allJobs),
    [allJobs, shifts]
  );

  if (loading || error) return <ShiftScreenState error={error} onRetry={refresh} />;

  return (
    <View style={styles.screen}>
      <ShiftList
        shifts={shifts}
        jobs={allJobs}
        grossByShift={grossByShift}
        onShiftDeleted={refresh}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
});
