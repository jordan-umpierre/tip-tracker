import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ShiftList from '../components/ShiftList';
import ShiftScreenState from '../components/ShiftScreenState';
import type { Job } from '../data/jobs';
import type { Shift } from '../data/shifts';
import { useShiftScreenData } from '../hooks/useShiftScreenData';
import { parseCalendarDate } from '../lib/dates';
import { formatCents, formatLongDate } from '../lib/format';
import { calculateEstimatedGrossByShift } from '../lib/overtime';
import { calculateShiftGrossCents } from '../lib/totals';

type IncomeWindow = { startDate: string; endDate: string };

// fallow-ignore-next-line complexity -- Missing, malformed, and reversed route dates are separate trust-boundary failures.
function incomeWindow(startDate: string | undefined, endDate: string | undefined): IncomeWindow | null {
  if (!startDate || !endDate) return null;
  if (!parseCalendarDate(startDate) || !parseCalendarDate(endDate)) return null;
  return startDate <= endDate ? { startDate, endDate } : null;
}

// fallow-ignore-next-line complexity -- Loading, database failure, and invalid deep-link states each have a distinct recovery surface.
export default function IncomeShiftsScreen() {
  const { startDate, endDate, jobId } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    jobId?: string;
  }>();
  const { loading, error, allJobs, shifts, refresh } = useShiftScreenData('Income shifts');

  if (loading || error) return <ShiftScreenState error={error} onRetry={refresh} />;

  const window = incomeWindow(startDate, endDate);
  if (!window) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Text style={styles.errorText}>This income period is not valid.</Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <IncomeShiftResults
      window={window}
      jobId={typeof jobId === 'string' ? jobId : null}
      jobs={allJobs}
      shifts={shifts}
      refresh={refresh}
    />
  );
}

// fallow-ignore-next-line complexity -- Job scope, estimate label, date label, and plural branches are visible states checked on the drill-down screen.
function IncomeShiftResults({
  window,
  jobId,
  jobs,
  shifts,
  refresh,
}: {
  window: IncomeWindow;
  jobId: string | null;
  jobs: Job[];
  shifts: Shift[];
  refresh: () => void;
}) {
  const grossByShift = useMemo(
    () => calculateEstimatedGrossByShift(shifts, jobs),
    [jobs, shifts]
  );
  const visibleShifts = shifts.filter(
    (shift) =>
      shift.shift_date >= window.startDate &&
      shift.shift_date <= window.endDate &&
      (jobId === null || shift.job_id === jobId)
  );
  const grossCents = visibleShifts.reduce(
    (total, shift) =>
      total + (grossByShift.get(shift.id) ?? calculateShiftGrossCents(shift)),
    0
  );
  const selectedJob = jobId === null ? null : jobs.find((job) => job.id === jobId);
  const estimated = visibleShifts.some((shift) =>
    jobs.some((job) => job.id === shift.job_id && job.overtime_enabled === 1)
  );

  return (
    <View style={styles.screen}>
      <View style={styles.summary}>
        <Text selectable style={styles.range}>
          {window.startDate === window.endDate
            ? formatLongDate(window.startDate)
            : `${formatLongDate(window.startDate)} – ${formatLongDate(window.endDate)}`}
        </Text>
        <Text style={styles.scope}>{selectedJob?.name ?? 'All jobs'}</Text>
        <Text selectable style={styles.total}>
          {estimated ? 'Est. ' : ''}{formatCents(grossCents)}
        </Text>
        <Text style={styles.count}>
          {visibleShifts.length} {visibleShifts.length === 1 ? 'shift' : 'shifts'}
        </Text>
      </View>
      <ShiftList
        shifts={visibleShifts}
        jobs={jobs}
        grossByShift={grossByShift}
        browseHistory={false}
        emptyMessage="No shifts in this period."
        onShiftDeleted={refresh}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  summary: {
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  range: { color: '#374151', fontSize: 14 },
  scope: { color: '#6b7280', fontSize: 13 },
  total: { color: '#111827', fontSize: 28, fontWeight: '700', marginTop: 6 },
  count: { color: '#6b7280', fontSize: 13 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  errorText: { color: '#444', fontSize: 16, textAlign: 'center' },
});
