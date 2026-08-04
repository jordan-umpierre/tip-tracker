import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IncomeTrendChart, { rangeLabel } from '../components/IncomeTrendChart';
import { getDb } from '../data/db';
import { Job, listJobs } from '../data/jobs';
import { listShifts, Shift } from '../data/shifts';
import { localDateString, MONTH_NAMES } from '../lib/dates';
import { formatCents, formatHours } from '../lib/format';
import {
  calculateTrends,
  calculateTrendSeries,
  CalendarTrend,
  HeadlineTrend,
  shiftsInWindow,
  TrendChartRange,
  Trends,
  WeekdayTrend,
} from '../lib/trends';

type SummaryMode = 'weekly' | 'allTime';
type Breakdown = 'year' | 'month' | 'weekday';

// This route-level component coordinates loading and the screen's independent
// controls. Its calculation branches are tested below the UI and its flows are
// device-checked; the repo has no component coverage reporter for CRAP scoring.
// fallow-ignore-next-line complexity
export default function TrendsScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<TrendChartRange>('quarter');
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('allTime');
  const [breakdown, setBreakdown] = useState<Breakdown>('weekday');

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

  let trends: ReturnType<typeof calculateTrends>;
  let trendSeries: ReturnType<typeof calculateTrendSeries>;
  let rangeHeadline: HeadlineTrend;
  try {
    trends = calculateTrends(shifts, selectedJobId);
    trendSeries = calculateTrendSeries(shifts, chartRange, selectedJobId);
    // The summary card describes the window the chart is showing, so it runs
    // the same calculation over just the shifts the chart drew. The breakdown
    // below deliberately keeps using the unfiltered `trends` -- see D10.
    rangeHeadline = calculateTrends(
      shiftsInWindow(shifts, trendSeries),
      selectedJobId
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

  const today = localDateString(new Date());
  const selectedJob = selectedJobId === null
    ? null
    : jobs.find((job) => job.id === selectedJobId);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text selectable style={styles.title}>Trends</Text>

        <IncomeTrendChart
          range={chartRange}
          scopeLabel={selectedJob ? selectedJob.name : 'All jobs'}
          series={trendSeries}
          onRangeChange={setChartRange}
        />

        <JobFilters jobs={jobs} selectedJobId={selectedJobId} onChange={setSelectedJobId} />
        <SummaryControls value={summaryMode} onChange={setSummaryMode} />
        <HeadlineCard
          mode={summaryMode}
          headline={rangeHeadline}
          window={rangeLabel(chartRange, trendSeries)}
        />
        <BreakdownControls value={breakdown} onChange={setBreakdown} />
        <BreakdownSection breakdown={breakdown} trends={trends} today={today} />
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

function SummaryControls({
  value,
  onChange,
}: {
  value: SummaryMode;
  onChange: (mode: SummaryMode) => void;
}) {
  return (
    <>
      <Text style={styles.filterLabel}>Summary</Text>
      {/* Per hour first because it is the default: a selected chip that is not
          the leftmost one reads as though something else was turned off.
          These name the metric rather than the window -- they were "All time"
          and "Weekly average" when the card covered all history regardless of
          the chart range, and now that both follow the range, the window is
          stated once inside the card instead. */}
      <View style={styles.choiceRow}>
        <FilterChip
          label="Per hour"
          selected={value === 'allTime'}
          onPress={() => onChange('allTime')}
        />
        <FilterChip
          label="Per week"
          selected={value === 'weekly'}
          onPress={() => onChange('weekly')}
        />
      </View>
    </>
  );
}

function BreakdownControls({
  value,
  onChange,
}: {
  value: Breakdown;
  onChange: (breakdown: Breakdown) => void;
}) {
  return (
    <>
      <Text style={styles.filterLabel}>Breakdown</Text>
      {/* Ordered like the summary chips: default first, then widening periods
          to the right. */}
      <View style={styles.choiceRow}>
        <FilterChip
          label="Weekday"
          selected={value === 'weekday'}
          onPress={() => onChange('weekday')}
        />
        <FilterChip label="Month" selected={value === 'month'} onPress={() => onChange('month')} />
        <FilterChip label="Year" selected={value === 'year'} onPress={() => onChange('year')} />
      </View>
    </>
  );
}

type HeadlineContent = {
  eyebrow: string;
  value: string;
  context: string;
  note?: string;
};

function weeklyHeadline(headline: HeadlineTrend): HeadlineContent {
  const grossPerWeek = headline.grossPerWorkedWeekCents;
  const durationPerWeek = headline.durationPerWorkedWeekSeconds;
  if (grossPerWeek === null || durationPerWeek === null) {
    return {
      eyebrow: 'Average gross per worked week',
      value: 'No shifts',
      // The range can now be empty for a reason other than logging nothing:
      // a job filter whose shifts all fall outside the selected window.
      context: 'No shifts in this range.',
    };
  }

  return {
    eyebrow: 'Average gross per worked week',
    value: `${formatCents(grossPerWeek)}/week`,
    context: `${rateLabel(headline.grossPerHourCents)} · ${formatHours(durationPerWeek)}/week`,
    note: 'Uses weeks with at least one logged shift.',
  };
}

function allTimeHeadline(headline: HeadlineTrend): HeadlineContent {
  return {
    eyebrow: 'Gross per hour',
    value: rateLabel(headline.grossPerHourCents),
    context: headline.durationSeconds === 0
      ? 'No shifts in this range.'
      : `${formatCents(headline.grossCents)} gross · ${formatHours(headline.durationSeconds)}`,
  };
}

function HeadlineCard({
  mode,
  headline,
  window,
}: {
  mode: SummaryMode;
  headline: HeadlineTrend;
  // The chart's own window label, repeated here because this card is scoped to
  // the same range and the number would otherwise be unattributed.
  window: string;
}) {
  const content = mode === 'weekly' ? weeklyHeadline(headline) : allTimeHeadline(headline);

  return (
    <View style={styles.headlineCard}>
      <Text style={styles.eyebrow}>{content.eyebrow}</Text>
      <Text style={styles.headlineWindow}>{window}</Text>
      <Text selectable style={styles.headlineValue}>{content.value}</Text>
      <Text style={[styles.context, styles.headlineContext]}>{content.context}</Text>
      {content.note ? <Text style={styles.headlineNote}>{content.note}</Text> : null}
    </View>
  );
}

function BreakdownSection({
  breakdown,
  trends,
  today,
}: {
  breakdown: Breakdown;
  trends: Trends;
  today: string;
}) {
  if (breakdown === 'weekday') {
    return <WeekdayBars weekdays={trends.weekdays} />;
  }

  if (breakdown === 'month') {
    return (
      <CalendarSection
        title="By month"
        rows={trends.months}
        currentPeriod={today.slice(0, 7)}
        formatPeriod={formatMonth}
      />
    );
  }

  return (
    <CalendarSection
      title="By year"
      rows={trends.years}
      currentPeriod={today.slice(0, 4)}
      formatPeriod={(period) => period}
    />
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
      <Text style={styles.sectionNote}>
        Hourly wages plus tips, weighted by time. Rates above; samples below.
      </Text>
      <View style={styles.weekdayChart}>
        {weekdays.map((day) => {
          const height =
            day.grossPerHourCents === null || maxRate === 0
              ? '0%'
              : (`${(day.grossPerHourCents / maxRate) * 100}%` as `${number}%`);

          return (
            <View
              key={day.weekday}
              accessible
              accessibilityLabel={`${day.weekday}: ${rateLabel(day.grossPerHourCents)}, ${sampleLabel(day.shiftCount, day.durationSeconds)}`}
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
                adjustsFontSizeToFit
                minimumFontScale={0.75}
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
            {formatCents(row.tipsCents)} tips · {formatHours(row.durationSeconds)} ·{' '}
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

function formatMonth(period: string): string {
  const month = MONTH_NAMES[Number(period.slice(5, 7)) - 1];
  return month ? `${month} ${period.slice(0, 4)}` : period;
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
  filterLabel: { color: '#374151', fontSize: 14, fontWeight: '600', marginBottom: -12 },
  filters: { gap: 8 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    backgroundColor: '#f3f4f6',
    padding: 20,
  },
  eyebrow: { color: '#4b5563', fontSize: 14, fontWeight: '600' },
  headlineValue: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  headlineWindow: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  headlineContext: { color: '#4b5563' },
  headlineNote: { color: '#6b7280', fontSize: 12, marginTop: 6 },
  section: { gap: 12, borderRadius: 16, backgroundColor: '#f9fafb', padding: 16 },
  sectionTitle: { color: '#111827', fontSize: 20, fontWeight: '700' },
  sectionNote: { color: '#6b7280', marginTop: -8 },
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
    height: 24,
    color: '#6b7280',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    lineHeight: 12,
    textAlign: 'center',
  },
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
