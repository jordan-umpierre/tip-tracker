import { StyleSheet, Text, View } from 'react-native';
import { formatCents, formatHours } from '../format';
import { Shift } from '../shifts';
import { calculateTotals } from '../totals';

type Props = {
  shifts: Shift[];
};

// Takes the raw shifts rather than a pre-computed totals object, so App.tsx
// stays wiring -- it hands components the state it already holds and doesn't
// do arithmetic of its own. The math itself still lives outside this file, in
// totals.ts, which is what keeps it testable without rendering anything.
export default function ShiftTotals({ shifts }: Props) {
  // Runs on every render, which is every time a shift is added, edited, or
  // deleted. That's fine at this size -- it's one pass over an array the app
  // already has in memory. If it ever shows up as slow, useMemo is the fix,
  // but measuring first beats guessing.
  const totals = calculateTotals(shifts);

  return (
    <View style={styles.container}>
      <Stat label="Hours" value={formatHours(totals.minutes)} />
      <Stat label="Tips" value={formatCents(totals.tipsCents)} />
      <Stat label="Gross pay" value={formatCents(totals.grossCents)} />
    </View>
  );
}

// Not exported and not in its own file: three identical blocks of JSX in one
// component is worth naming, but nothing outside this file needs it. It moves
// when something else does.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fafafa',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  statLabel: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
});
