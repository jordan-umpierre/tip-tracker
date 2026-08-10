import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Calendar from '../../components/Calendar';
import { listShifts, Shift } from '../../data/shifts';
import { localDateString } from '../../lib/dates';

// Step one of logging a shift: which day was it. The job was either the only
// one there is or was picked on the step before, and it rides along in the
// params so this screen never has to ask the database for it.
export default function DateStepScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [shifts, setShifts] = useState<Shift[]>([]);
  // Today is the overwhelmingly common answer -- someone logging a shift has
  // usually just finished it -- so it starts selected and Enter is one tap.
  const [selectedDate, setSelectedDate] = useState(() => localDateString(new Date()));

  // A plain effect rather than useFocusEffect: this screen is a step in a flow
  // that is walked once, not a tab returned to. The dots only have to be right
  // when it opens.
  useEffect(() => {
    listShifts()
      .then(setShifts)
      // The dots are a convenience, not the point of the screen. If the read
      // fails the calendar still works, so this refuses to block the flow on it.
      .catch((cause) => console.error('Could not read shifts for the calendar dots.', cause));
  }, []);

  const datesWithShifts = useMemo(
    () => new Set(shifts.map((shift) => shift.shift_date)),
    [shifts]
  );

  // Days that already have a shift are not blocked. Two shifts in one day is a
  // real thing -- a double -- and the dot plus the legend under the grid say
  // so without an alert interrupting the tap.
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.heading}>
        <Text selectable style={styles.title}>Select a date</Text>
        <Text style={styles.subtitle}>Which day was this shift?</Text>
      </View>

      {/* No horizontal padding on the calendar's container: it pages by the
          full window width, so side padding would leave the swipe misaligned
          with the month it lands on. */}
      <Calendar
        selectedDate={selectedDate}
        datesWithShifts={datesWithShifts}
        onSelect={setSelectedDate}
      />

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() =>
            router.push({ pathname: '/log-shift/details', params: { jobId, date: selectedDate } })
          }
        >
          <Text style={styles.primaryButtonText}>Next</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  heading: { gap: 4, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title: { color: '#111827', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#6b7280', fontSize: 15 },
  // Pushed to the bottom of whatever space the calendar leaves, so the button
  // sits under a thumb rather than directly beneath the grid on a tall screen.
  footer: { marginTop: 'auto', padding: 20 },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
