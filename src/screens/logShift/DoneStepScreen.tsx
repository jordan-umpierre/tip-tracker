import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ShiftScreenState from '../../components/ShiftScreenState';
import { listShifts, Shift } from '../../data/shifts';
import { formatCents, formatHours, formatLongDate } from '../../lib/format';
import { calculateShiftGrossCents } from '../../lib/totals';

// The payoff. Logging a shift used to end with a form collapsing and a row
// appearing somewhere in a list; this says what was recorded and what it earned.
//
// It re-reads the shift rather than being handed the figures it should show.
// The numbers on this screen are then the stored row's numbers, so a write that
// landed differently than the form expected shows up here instead of being
// papered over by the form's own arithmetic.
export default function DoneStepScreen() {
  const { shiftId } = useLocalSearchParams<{ shiftId: string }>();
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const shifts = await listShifts();
      const savedShift = shifts.find((entry) => entry.id === shiftId);
      if (!savedShift) throw new Error(`Saved shift ${shiftId ?? '<missing>'} was not found.`);
      setShift(savedShift);
    } catch (cause) {
      console.error('Could not read the saved shift.', cause);
      setShift(null);
      setError('The saved shift could not be read.');
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  useEffect(() => {
    // ponytail: reads every shift to find one. listShifts is the only reader
    // that exists and this screen is shown once per logged shift, so a
    // dedicated by-id query is not worth its own migration of this module --
    // add one if a second caller ever needs it.
    void refresh();
  }, [refresh]);

  if (loading || error || shift === null) {
    return <ShiftScreenState error={error} onRetry={refresh} />;
  }

  const grossCents = calculateShiftGrossCents(shift);
  // Guarded because a zero-duration shift cannot be saved, but this screen
  // should not divide by whatever it happens to be handed.
  const rateCents = shift.duration_seconds === 0
    ? null
    : Math.round((grossCents * 3600) / shift.duration_seconds);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.body}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.tick}>
          <Text style={styles.tickMark}>✓</Text>
        </View>
        <Text selectable style={styles.title}>Shift logged</Text>

        <View style={styles.figures}>
          <Figure label="Date" value={formatLongDate(shift.shift_date)} />
          <Figure label="Hours" value={formatHours(shift.duration_seconds)} />
          <Figure label="Total income" value={formatCents(grossCents)} />
          <Figure label="Earned per hour" value={rateCents === null ? '—' : `${formatCents(rateCents)}/hr`} />
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          // Pops the whole flow rather than stepping back through it, so the
          // user lands on Home with the new row already saved in SQLite.
          onPress={() => router.dismissAll()}
        >
          <Text style={styles.primaryButtonText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figureRow}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text selectable style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  tick: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#2563eb',
  },
  tickMark: { color: '#fff', fontSize: 38, fontWeight: '700' },
  title: { color: '#111827', fontSize: 26, fontWeight: '700' },
  figures: {
    alignSelf: 'stretch',
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  figureRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  figureLabel: { flex: 1, color: '#374151', fontSize: 16 },
  figureValue: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footer: { padding: 20 },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#2563eb',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
