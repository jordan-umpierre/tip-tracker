import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Calendar from '../components/Calendar';
import { localDateString, parseCalendarDate } from '../lib/dates';

const NO_SHIFT_DATES = new Set<string>();

function validDate(value: string | undefined, fallback: string): string {
  return value && parseCalendarDate(value) ? value : fallback;
}

export default function IncomeRangeScreen() {
  const params = useLocalSearchParams<{ startDate?: string; endDate?: string }>();
  const today = localDateString(new Date());
  const initialStart = validDate(params.startDate, today);
  const initialEnd = validDate(params.endDate, initialStart);
  const [startDate, setStartDate] = useState(
    initialStart <= initialEnd ? initialStart : initialEnd
  );
  const [endDate, setEndDate] = useState(
    initialStart <= initialEnd ? initialEnd : initialStart
  );
  const [activeBoundary, setActiveBoundary] = useState<'start' | 'end'>('start');

  function selectDate(date: string) {
    if (activeBoundary === 'start') {
      setStartDate(date);
      if (date > endDate) setEndDate(date);
      setActiveBoundary('end');
      return;
    }

    setEndDate(date);
    if (date < startDate) setStartDate(date);
  }

  function applyRange() {
    router.dismissTo({
      pathname: '/(tabs)/trends',
      params: { customStart: startDate, customEnd: endDate },
    });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Custom range',
          headerLeft: () => (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={applyRange}>
              <Text style={[styles.headerAction, styles.applyAction]}>Apply</Text>
            </Pressable>
          ),
        }}
      />

      <Text style={styles.instructions}>
        Choose a start date, then an end date. You can tap either field to adjust it.
      </Text>
      <View style={styles.boundaries}>
        <BoundaryButton
          label="Start"
          date={startDate}
          selected={activeBoundary === 'start'}
          onPress={() => setActiveBoundary('start')}
        />
        <BoundaryButton
          label="End"
          date={endDate}
          selected={activeBoundary === 'end'}
          onPress={() => setActiveBoundary('end')}
        />
      </View>
      <Calendar
        selectedDate={activeBoundary === 'start' ? startDate : endDate}
        datesWithShifts={NO_SHIFT_DATES}
        onSelect={selectDate}
      />
    </SafeAreaView>
  );
}

function BoundaryButton({
  label,
  date,
  selected,
  onPress,
}: {
  label: string;
  date: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.boundary, selected && styles.boundarySelected]}
      onPress={onPress}
    >
      <Text style={[styles.boundaryLabel, selected && styles.boundaryLabelSelected]}>
        {label}
      </Text>
      <Text style={[styles.boundaryDate, selected && styles.boundaryDateSelected]}>
        {date}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 16 },
  instructions: { color: '#4b5563', lineHeight: 20, paddingHorizontal: 20 },
  boundaries: { flexDirection: 'row', gap: 12, padding: 20 },
  boundary: {
    minHeight: 64,
    flex: 1,
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  boundarySelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  boundaryLabel: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  boundaryLabelSelected: { color: '#1d4ed8' },
  boundaryDate: { color: '#111827', fontSize: 16, fontWeight: '700' },
  boundaryDateSelected: { color: '#1d4ed8' },
  headerAction: { color: '#374151', fontSize: 16 },
  applyAction: { color: '#2563eb', fontWeight: '700' },
});
