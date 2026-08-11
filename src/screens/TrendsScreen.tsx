import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IncomeTrendChart, { rangeLabel } from '../components/IncomeTrendChart';
import { getDb } from '../data/db';
import { Job, listJobs } from '../data/jobs';
import { listShifts, Shift } from '../data/shifts';
import { formatCents, formatHours } from '../lib/format';
import { calculateEstimatedGrossByShift, overtimeScope } from '../lib/overtime';
import {
  calculateTrends,
  calculateTrendSeries,
  HeadlineTrend,
  shiftsInWindow,
  TrendChartRange,
  WeekdayTrend,
} from '../lib/trends';

// fallow-ignore-next-line complexity -- Route-level coordinator: calculation branches are tested below the UI and its flows are device-checked; the repo has no component coverage reporter for CRAP scoring.
export default function TrendsScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<TrendChartRange>('quarter');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await getDb();
      const [allJobs, allShifts] = await Promise.all([listJobs(), listShifts()]);
      const jobIdsWithHistory = new Set(allShifts.map((shift) => shift.job_id));
      const visibleJobs = allJobs.filter(
        (job) => job.archived_at === null || jobIdsWithHistory.has(job.id)
      );
      setJobs(visibleJobs);
      setShifts(allShifts);
      setSelectedJobId((current) =>
        current !== null && !visibleJobs.some((job) => job.id === current) ? null : current
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

  if (shifts.length === 0) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.emptyTitle}>Your income story starts here.</Text>
        <Text style={styles.emptyText}>
          Log a shift and Trends will show your earnings, hours, and patterns over time.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => router.navigate('/')}
        >
          <Text style={styles.primaryButtonText}>Log your first shift</Text>
        </Pressable>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  let weekdays: WeekdayTrend[];
  let trendSeries: ReturnType<typeof calculateTrendSeries>;
  let rangeHeadline: HeadlineTrend;
  let grossByShift: Map<string, number>;
  try {
    grossByShift = calculateEstimatedGrossByShift(shifts, jobs);
    weekdays = calculateTrends(shifts, selectedJobId, grossByShift).weekdays;
    trendSeries = calculateTrendSeries(shifts, chartRange, selectedJobId, grossByShift);
    // The totals table describes the window the chart is showing, so it runs
    // the same calculation over just the shifts the chart drew. The weekday
    // bars below deliberately keep using every shift -- see D10.
    rangeHeadline = calculateTrends(
      shiftsInWindow(shifts, trendSeries),
      selectedJobId,
      grossByShift
    ).headline;
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

  const selectedJob = selectedJobId === null
    ? null
    : jobs.find((job) => job.id === selectedJobId);
  const estimateScope = overtimeScope(shifts, jobs, selectedJobId);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text selectable style={styles.title}>Trends</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.historyLink}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.historyLinkText}>View shift history</Text>
          <Text style={styles.historyLinkChevron}>›</Text>
        </Pressable>

        <IncomeTrendChart
          range={chartRange}
          scopeLabel={selectedJob ? selectedJob.name : 'All jobs'}
          series={trendSeries}
          estimated={estimateScope.estimated}
          hasUntimedEstimate={estimateScope.hasUntimedEstimate}
          onRangeChange={setChartRange}
        />

        <JobFilters jobs={jobs} selectedJobId={selectedJobId} onChange={setSelectedJobId} />
        <TotalsTable
          headline={rangeHeadline}
          estimated={estimateScope.estimated}
          window={rangeLabel(chartRange, trendSeries)}
        />
        <WeekdayBars weekdays={weekdays} estimated={estimateScope.estimated} />
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function JobFilters({
  jobs,
  selectedJobId,
  onChange,
}: {
  jobs: Job[];
  selectedJobId: string | null;
  onChange: (jobId: string | null) => void;
}) {
  return (
    <>
      <Text style={styles.filterLabel}>Job</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <FilterChip
          label="All jobs"
          selected={selectedJobId === null}
          onPress={() => onChange(null)}
        />
        {jobs.map((job) => (
          <FilterChip
            key={job.id}
            label={`${job.name}${job.archived_at ? ' (removed)' : ''}`}
            selected={selectedJobId === job.id}
            onPress={() => onChange(job.id)}
          />
        ))}
      </ScrollView>
    </>
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

// One label-and-value line. Every row in the table is this shape, so the
// divider lives here rather than being repeated per row -- which also gives the
// last row one, and that reads as the bottom edge of the table.
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      {/* selectable so a figure can be copied out, same as the old summary card */}
      <Text selectable style={styles.statValue}>{value}</Text>
    </View>
  );
}

// This replaced a two-mode summary card and a three-mode breakdown behind chips.
// Nothing here is hidden behind a toggle: every figure the old modes could show
// is a row, and the ones that were month and year lists are gone because the
// Log tab's shift list already groups history by year and month.
function TotalsTable({
  headline,
  estimated,
  window,
}: {
  headline: HeadlineTrend;
  estimated: boolean;
  // The chart's own window label. The chart prints this too, but it swaps to a
  // single date while a finger is scrubbing the line, so these figures would
  // otherwise be left unattributed exactly when someone is reading them.
  window: string;
}) {
  return (
    <View style={styles.section}>
      <Text selectable style={styles.sectionTitle}>
        {estimated ? 'Estimated totals' : 'Totals'}
      </Text>
      <Text style={styles.sectionNote}>{window}</Text>
      <View>
        <StatRow label="From Wage" value={money(headline.grossCents - headline.tipsCents)} />
        <StatRow label="From Tips" value={money(headline.tipsCents)} />
        <StatRow label="Hours Worked" value={formatHours(headline.durationSeconds)} />
        <StatRow label="Average Income" value={money(headline.grossPerHourCents, '/hr')} />
        <StatRow label="Average Per Week" value={money(headline.grossPerWorkedWeekCents, '/wk')} />
      </View>
      <Text style={styles.statNote}>
        Per week uses weeks with at least one logged shift.
      </Text>
    </View>
  );
}

// A table cell has to keep its shape, so a missing figure is a dash. rateLabel
// below says "No shifts" instead, which is right for a screen reader reading
// one weekday bar aloud and wrong for a column of numbers.
function money(cents: number | null, suffix = ''): string {
  return cents === null ? '—' : `${formatCents(cents)}${suffix}`;
}

function WeekdayBars({ weekdays, estimated }: { weekdays: WeekdayTrend[]; estimated: boolean }) {
  const maxRate = Math.max(0, ...weekdays.map((day) => day.grossPerHourCents ?? 0));

  return (
    <View style={styles.section}>
      <Text selectable style={styles.sectionTitle}>
        {estimated ? 'Estimated gross per hour by weekday' : 'Gross per hour by weekday'}
      </Text>
      <Text style={styles.sectionNote}>
        Hourly wages plus tips, weighted by time. Rates above; samples below.
      </Text>
      <View style={styles.weekdayChart}>
        {/* fallow-ignore-next-line complexity -- Each visible bar state needs its matching accessibility text. */}
        {weekdays.map((day) => {
          const height =
            day.grossPerHourCents === null || maxRate === 0
              ? '0%'
              : (`${(day.grossPerHourCents / maxRate) * 100}%` as `${number}%`);

          return (
            <View
              key={day.weekday}
              accessible
              accessibilityLabel={`${day.weekday}: ${estimated ? 'estimated ' : ''}${rateLabel(day.grossPerHourCents)}, ${sampleLabel(day.shiftCount, day.durationSeconds)}`}
              style={styles.weekdayColumn}
            >
              <Text
                selectable
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                numberOfLines={1}
                style={styles.chartRate}
              >
                {day.grossPerHourCents === null ? '—' : formatCents(day.grossPerHourCents)}
              </Text>
              <View style={styles.verticalBarTrack}>
                <View style={[styles.verticalBarFill, { height }]} />
              </View>
              <Text style={styles.weekdayName}>{day.weekday.slice(0, 3)}</Text>
              {/* Always two lines, broken explicitly -- see
                  stackedShiftCountLabel. Hours used to sit here too, but the
                  count ate the second line and silently truncated them on most
                  columns. They stay in the accessibility label above, where
                  there is no width limit. */}
              <Text
                selectable
                numberOfLines={2}
                style={styles.weekdayContext}
              >
                {stackedShiftCountLabel(day.shiftCount)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function rateLabel(cents: number | null): string {
  return cents === null ? 'No shifts' : `${formatCents(cents)}/hr`;
}

function shiftCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'shift' : 'shifts'}`;
}

// The same thing broken across two lines on purpose. Under the weekday bars
// the count wrapped only when it was too wide to fit, so "167 shifts" took two
// lines and "6 shifts" took one, and that column's caption sat higher than its
// neighbours. Putting the break in rather than letting width decide it keeps
// every column the same height whatever the number is.
function stackedShiftCountLabel(count: number): string {
  return `${count}\n${count === 1 ? 'shift' : 'shifts'}`;
}

function sampleLabel(shiftCount: number, durationSeconds: number): string {
  return `${shiftCountLabel(shiftCount)} · ${formatHours(durationSeconds)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { gap: 24, padding: 20, paddingBottom: 40 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#fff',
    padding: 24,
  },
  title: { color: '#111827', fontSize: 32, fontWeight: '700' },
  historyLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  historyLinkText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  historyLinkChevron: { color: '#9ca3af', fontSize: 26 },
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
  section: { gap: 12, borderRadius: 16, backgroundColor: '#f9fafb', padding: 16 },
  sectionTitle: { color: '#111827', fontSize: 20, fontWeight: '700' },
  sectionNote: { color: '#6b7280', marginTop: -8 },
  statRow: {
    // 44 is the same tap-target floor the chips use. Nothing here is tappable,
    // but it is also the height at which a list of figures stops feeling
    // cramped, and matching it keeps one number in the stylesheet.
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statLabel: { flex: 1, color: '#374151', fontSize: 16 },
  statValue: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statNote: { color: '#6b7280', fontSize: 12, marginTop: -4 },
  weekdayChart: { height: 230, flexDirection: 'row', gap: 4 },
  weekdayColumn: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  chartRate: {
    width: '100%',
    color: '#111827',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  verticalBarTrack: {
    flex: 1,
    width: '68%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  verticalBarFill: { width: '100%', borderRadius: 6, backgroundColor: '#2563eb' },
  weekdayName: { color: '#374151', fontSize: 11, fontWeight: '600' },
  weekdayContext: {
    width: '100%',
    // Two lines' worth, always, whether the text needs them or not. The bar
    // track above is flex: 1, so a column whose label happens to fit on one
    // line would otherwise donate the spare line to its bar -- which made a
    // short "6 shifts" render taller and lower than the wrapped ones beside
    // it, comparing rates against a baseline that was not shared.
    height: 36,
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
    textAlign: 'center',
  },
  errorText: { color: '#444', fontSize: 16, textAlign: 'center' },
  emptyTitle: { color: '#111827', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: '#4b5563', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
