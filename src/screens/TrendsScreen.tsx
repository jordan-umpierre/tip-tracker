import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../data/db';
import { Job, listActiveJobs } from '../data/jobs';
import { listShifts, Shift } from '../data/shifts';
import { localDateString } from '../lib/dates';
import { formatCents, formatHours } from '../lib/format';
import { calculateTrends, CalendarTrend, WeekdayTrend } from '../lib/trends';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function TrendsScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await getDb();
      const [activeJobs, allShifts] = await Promise.all([listActiveJobs(), listShifts()]);
      setJobs(activeJobs);
      setShifts(allShifts);
      // An archived job disappears from the filter. Returning to All jobs is
      // clearer than leaving an invisible selection active.
      setSelectedJobId((current) =>
        current !== null && !activeJobs.some((job) => job.id === current) ? null : current
      );
    } catch (cause) {
      console.error('Could not load the Trends screen.', cause);
      setError('Your trends could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  if (loading || error) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={error ? styles.errorText : undefined}>{error ?? 'Loading...'}</Text>
        {error ? (
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  let trends: ReturnType<typeof calculateTrends>;
  try {
    trends = calculateTrends(shifts, selectedJobId);
  } catch (cause) {
    console.error('Could not calculate trends.', cause);
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.errorText}>
          A shift contains invalid data. Check its date on the Log tab.
        </Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  const today = localDateString(new Date());

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text selectable style={styles.title}>Trends</Text>
        <Text style={styles.intro}>All recorded history for the selected job scope.</Text>

        <Text style={styles.filterLabel}>Job</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <FilterChip
            label="All jobs"
            selected={selectedJobId === null}
            onPress={() => setSelectedJobId(null)}
          />
          {jobs.map((job) => (
            <FilterChip
              key={job.id}
              label={job.name}
              selected={selectedJobId === job.id}
              onPress={() => setSelectedJobId(job.id)}
            />
          ))}
        </ScrollView>

        <View style={styles.headlineCard}>
          <Text style={styles.eyebrow}>Tips per hour</Text>
          <Text selectable style={styles.headlineValue}>
            {rateLabel(trends.headline.tipsPerHourCents)}
          </Text>
          <Text style={[styles.context, styles.headlineContext]}>
            {sampleLabel(trends.headline.shiftCount, trends.headline.minutes)}
          </Text>
        </View>

        <WeekdayBars weekdays={trends.weekdays} />
        <CalendarSection
          title="By month"
          rows={trends.months}
          currentPeriod={today.slice(0, 7)}
          formatPeriod={formatMonth}
        />
        <CalendarSection
          title="By year"
          rows={trends.years}
          currentPeriod={today.slice(0, 4)}
          formatPeriod={(period) => period}
        />
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function WeekdayBars({ weekdays }: { weekdays: WeekdayTrend[] }) {
  const maxRate = Math.max(0, ...weekdays.map((day) => day.grossPerHourCents ?? 0));

  return (
    <View style={styles.section}>
      <Text selectable style={styles.sectionTitle}>Gross per hour by weekday</Text>
      <Text style={styles.sectionNote}>Hourly wages plus tips, weighted by time.</Text>
      {weekdays.map((day) => {
        const width =
          day.grossPerHourCents === null || maxRate === 0
            ? '0%'
            : (`${(day.grossPerHourCents / maxRate) * 100}%` as `${number}%`);

        return (
          <View
            key={day.weekday}
            accessible
            accessibilityLabel={`${day.weekday}: ${rateLabel(day.grossPerHourCents)}, ${sampleLabel(day.shiftCount, day.minutes)}`}
            style={styles.weekdayRow}
          >
            <View style={styles.weekdayHeading}>
              <Text style={styles.weekdayName}>{day.weekday}</Text>
              <Text selectable style={styles.rate}>{rateLabel(day.grossPerHourCents)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width }]} />
            </View>
            <Text style={styles.context}>{sampleLabel(day.shiftCount, day.minutes)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CalendarSection({
  title,
  rows,
  currentPeriod,
  formatPeriod,
}: {
  title: string;
  rows: CalendarTrend[];
  currentPeriod: string;
  formatPeriod: (period: string) => string;
}) {
  return (
    <View style={styles.section}>
      <Text selectable style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.emptyText}>No shifts yet.</Text> : null}
      {rows.map((row) => (
        <View key={row.period} style={styles.periodRow}>
          <View style={styles.periodHeading}>
            <Text style={styles.periodLabel}>
              {formatPeriod(row.period)}{row.period === currentPeriod ? ' · to date' : ''}
            </Text>
            <Text selectable style={styles.periodGross}>{formatCents(row.grossCents)}</Text>
          </View>
          <Text style={styles.context}>
            {formatCents(row.tipsCents)} tips · {formatHours(row.minutes)} ·{' '}
            {shiftCountLabel(row.shiftCount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function rateLabel(cents: number | null): string {
  return cents === null ? 'No shifts' : `${formatCents(cents)}/hr`;
}

function shiftCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'shift' : 'shifts'}`;
}

function sampleLabel(shiftCount: number, minutes: number): string {
  return `${shiftCountLabel(shiftCount)} · ${formatHours(minutes)}`;
}

function formatMonth(period: string): string {
  const month = MONTH_NAMES[Number(period.slice(5, 7)) - 1];
  return month ? `${month} ${period.slice(0, 4)}` : period;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { gap: 20, padding: 16, paddingBottom: 32 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#fff',
    padding: 24,
  },
  title: { color: '#111827', fontSize: 32, fontWeight: '700' },
  intro: { color: '#6b7280', fontSize: 15, marginTop: -14 },
  filterLabel: { color: '#374151', fontSize: 14, fontWeight: '600', marginBottom: -12 },
  filters: { gap: 8 },
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  filterChipSelected: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  filterText: { color: '#374151', fontWeight: '600' },
  filterTextSelected: { color: '#fff' },
  headlineCard: {
    borderRadius: 16,
    backgroundColor: '#1d4ed8',
    padding: 20,
  },
  eyebrow: { color: '#dbeafe', fontSize: 14, fontWeight: '600' },
  headlineValue: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  headlineContext: { color: '#dbeafe' },
  section: { gap: 12, borderRadius: 16, backgroundColor: '#fff', padding: 16 },
  sectionTitle: { color: '#111827', fontSize: 20, fontWeight: '700' },
  sectionNote: { color: '#6b7280', marginTop: -8 },
  weekdayRow: { gap: 6, paddingTop: 4 },
  weekdayHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  weekdayName: { color: '#374151', fontWeight: '600' },
  rate: { color: '#111827', fontWeight: '600', fontVariant: ['tabular-nums'] },
  barTrack: { height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: '#e5e7eb' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: '#2563eb' },
  context: { color: '#6b7280', fontSize: 13, fontVariant: ['tabular-nums'] },
  periodRow: { gap: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12 },
  periodHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  periodLabel: { flex: 1, color: '#374151', fontWeight: '600' },
  periodGross: { color: '#111827', fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyText: { color: '#6b7280' },
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
