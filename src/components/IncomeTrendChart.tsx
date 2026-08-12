import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { formatCents, formatHours } from '../lib/format';
import type { CalendarTrend, TrendChartRange, TrendSeries } from '../lib/trends';

const GRAPH_HEIGHT = 194;
const GRAPH_TOP = 12;
const GRAPH_BOTTOM = 12;
const GRAPH_SIDE_PADDING = 9;
// Everything vertical is measured against this, so it is worked out once here
// rather than in both the point math and the gridline math.
const PLOT_HEIGHT = GRAPH_HEIGHT - GRAPH_TOP - GRAPH_BOTTOM;

// Where the horizontal gridlines sit, as a fraction of the way down the plot.
// 0 is the top, which is the largest gross in the window; there is no line at 1
// because the bottom edge is always zero and drawing it says nothing.
const AXIS_FRACTIONS = [0, 0.25, 0.5, 0.75];

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

const ranges: { label: string; value: TrendChartRange }[] = [
  { label: '1W', value: 'week' },
  { label: '1M', value: 'month' },
  { label: '3M', value: 'quarter' },
  { label: '1Y', value: 'year' },
  { label: 'YTD', value: 'ytd' },
  { label: 'All', value: 'all' },
];

const rangeAccessibilityLabels: Record<TrendChartRange, string> = {
  week: '1 week',
  month: '1 month',
  quarter: '3 months',
  year: '1 year',
  ytd: 'Year to date',
  all: 'All time',
};

// How precisely to name the window under the dollar figure. Ranges measured in
// months read better as "March 2024 - August 2026" than as exact days, since
// their edges land on month boundaries anyway. Year to date is month-bucketed
// but starts on a day everyone recognises, so it keeps day precision.
const rangeLabelPrecision: Record<TrendChartRange, 'day' | 'month'> = {
  week: 'day',
  month: 'day',
  quarter: 'day',
  year: 'month',
  ytd: 'day',
  all: 'month',
};

type Props = {
  range: TrendChartRange;
  scopeLabel: string;
  series: TrendSeries;
  lines: IncomeTrendLine[];
  selectionDismissKey: number;
  estimated: boolean;
  hasUntimedEstimate: boolean;
  onRangeChange: (range: TrendChartRange) => void;
};

type IncomeTrendLine = {
  key: string;
  label: string;
  color: string;
  dash?: string;
  points: CalendarTrend[];
};

type ChartTotals = Pick<CalendarTrend, 'durationSeconds' | 'tipsCents' | 'grossCents'>;

type ChartPosition = { x: number; y: number };

// fallow-ignore-next-line complexity -- Exercised on-device; the repo has no component coverage reporter for Fallow's estimated CRAP score.
export default function IncomeTrendChart({
  range,
  scopeLabel,
  series,
  lines,
  selectionDismissKey,
  estimated,
  hasUntimedEstimate,
  onRangeChange,
}: Props) {
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const total = useMemo(() => totalPoints(series.points), [series.points]);
  const selectedPoint = selectedIndex === null ? null : series.points[selectedIndex] ?? null;
  const displayed = selectedPoint ?? total;
  const pointWindowKey = `${series.bucket}:${series.points[0]?.period}:${series.points.at(-1)?.period}:${series.points.length}`;
  // Null means there is nothing to scale against. That is also the signal not to
  // print dollar figures up the side of an empty chart.
  const maxGross = useMemo(() => {
    const values = lines.flatMap((line) => line.points.map((point) => point.grossCents));
    return values.length === 0 ? null : Math.max(1, ...values);
  }, [lines]);
  const drawnLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        positions: pointPositions(line.points, chartWidth, maxGross ?? 1),
      })),
    [chartWidth, lines, maxGross]
  );

  useEffect(() => {
    setSelectedIndex(null);
  }, [range, scopeLabel, series.anchorDate, pointWindowKey, selectionDismissKey]);

  const selectPointAt = useCallback(
    (x: number) => {
      if (chartWidth === 0 || series.points.length === 0) return;
      const progress = Math.max(0, Math.min(1, x / chartWidth));
      setSelectedIndex(Math.round(progress * (series.points.length - 1)));
    },
    [chartWidth, series.points.length]
  );

  // Whether this gesture has become a real scrub. A touch starts as neither a
  // scrub nor a scroll: the chart claims it immediately so a tap lands, and
  // hands it to the scroll view if it turns out to be vertical. Once the finger
  // has travelled horizontally the question is settled, and the gesture stops
  // being available to the scroller -- otherwise drifting up or down mid-drag
  // handed the scrub away and dropped the selection.
  const scrubbing = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch as soon as a finger lands so a plain tap jumps
        // straight to that point, instead of only responding once a drag
        // starts. Still worth keeping the move check below: if the scroll view
        // steals a touch, a later horizontal drag can take it back.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event) => {
          scrubbing.current = false;
          selectPointAt(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event, gesture) => {
          // Deliberately generous. Fingers are not straight lines, and the
          // point of this is that a scrub survives the wobble.
          if (Math.abs(gesture.dx) > 6) scrubbing.current = true;
          selectPointAt(event.nativeEvent.locationX);
        },
        // Claiming on touch-down would otherwise trap vertical scrolling that
        // happens to start on the chart, so a gesture that has not become a
        // scrub is still surrendered, and clearing the point on the way out
        // stops a scroll from leaving a stray selection behind. A gesture that
        // has become a scrub is kept until the finger lifts.
        onPanResponderTerminationRequest: () => !scrubbing.current,
        onPanResponderTerminate: () => setSelectedIndex(null),
        onPanResponderRelease: () => {
          scrubbing.current = false;
        },
      }),
    [selectPointAt]
  );

  function handleLayout(event: LayoutChangeEvent) {
    setChartWidth(event.nativeEvent.layout.width);
  }

  function handleAccessibilityAction(event: AccessibilityActionEvent) {
    if (series.points.length === 0) return;

    const latestIndex = series.points.length - 1;
    if (selectedIndex === null) {
      setSelectedIndex(latestIndex);
      return;
    }

    const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    setSelectedIndex(Math.max(0, Math.min(latestIndex, selectedIndex + direction)));
  }

  const context = selectedPoint
    ? pointLabel(selectedPoint.period, series.bucket)
    : rangeLabel(range, series);
  const lineValues = drawnLines
    .map((line) => {
      const value = selectedIndex === null ? totalPoints(line.points) : line.points[selectedIndex];
      return value ? `${line.label} ${formatCents(value.grossCents)}` : null;
    })
    .filter(Boolean)
    .join(', ');
  const accessibilityValue = `${context}. ${formatCents(displayed.grossCents)} ${estimated ? 'estimated gross income' : 'gross income'}, ${formatCents(displayed.grossCents - displayed.tipsCents)} ${estimated ? 'estimated wages' : 'wages'}, ${formatCents(displayed.tipsCents)} tips, ${formatHours(displayed.durationSeconds)}.${drawnLines.length > 1 ? ` By job: ${lineValues}.` : ''}`;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.eyebrow}>{estimated ? 'Estimated gross income' : 'Gross income'}</Text>
        <Text numberOfLines={1} style={styles.scope}>{scopeLabel}</Text>
      </View>
      <Text selectable adjustsFontSizeToFit numberOfLines={1} style={styles.value}>
        {formatCents(displayed.grossCents)}
      </Text>
      <Text style={styles.context}>{context}</Text>
      <Text selectable style={styles.breakdown}>
        {estimated ? 'Est. ' : ''}{formatCents(displayed.grossCents - displayed.tipsCents)} wages ·{' '}
        {formatCents(displayed.tipsCents)} tips · {formatHours(displayed.durationSeconds)}
      </Text>
      {estimated ? (
        <Text style={styles.estimateNote}>
          Uses configured overtime.
          {hasUntimedEstimate
            ? ' Shifts without times count wholly on their logged date.'
            : ''}
        </Text>
      ) : null}

      <View
        accessible
        accessibilityActions={[
          { name: 'decrement', label: 'Previous income point' },
          { name: 'increment', label: 'Next income point' },
        ]}
        accessibilityHint="Swipe up or down to move between dates."
        accessibilityLabel={estimated ? 'Estimated gross income chart' : 'Gross income chart'}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: series.points.length === 0 }}
        accessibilityValue={{ text: accessibilityValue }}
        style={styles.chart}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={handleLayout}
        onTouchStart={(event) => event.stopPropagation()}
        {...panResponder.panHandlers}
      >
        {chartWidth > 0 ? (
          <IncomeLines
            width={chartWidth}
            lines={drawnLines}
            maxGross={maxGross}
            selectedIndex={selectedIndex}
          />
        ) : null}
        {series.points.length === 0 ? (
          <Text style={styles.empty}>Log a shift to start your income trend.</Text>
        ) : null}
      </View>

      <ChartAxisLabels series={series} />
      {drawnLines.length > 1 ? (
        <ChartLegend lines={drawnLines} selectedIndex={selectedIndex} />
      ) : null}
      <Text style={styles.hint}>Swipe across the line for exact values.</Text>

      <RangePicker
        selectedRange={range}
        onSelect={(nextRange) => {
          setSelectedIndex(null);
          onRangeChange(nextRange);
        }}
      />
    </View>
  );
}

type DrawnLine = IncomeTrendLine & { positions: ChartPosition[] };

// fallow-ignore-next-line complexity -- Drawing only; every branch here is an empty-data guard, and the repo has no component coverage reporter.
function IncomeLines({
  width,
  lines,
  maxGross,
  selectedIndex,
}: {
  width: number;
  lines: DrawnLine[];
  maxGross: number | null;
  selectedIndex: number | null;
}) {
  const selectedX = selectedIndex === null
    ? null
    : lines[0]?.positions[selectedIndex]?.x ?? null;

  return (
    <Svg pointerEvents="none" width={width} height={GRAPH_HEIGHT}>
      {AXIS_FRACTIONS.map((fraction) => {
        const y = GRAPH_TOP + fraction * PLOT_HEIGHT;
        return (
          <Fragment key={fraction}>
            <Line x1="0" x2={width} y1={y} y2={y} stroke="#e5e7eb" />
            {/* The figure sits below its line rather than above it. The top
                line is only GRAPH_TOP from the edge of the SVG, so a label
                above that one would be cut off. */}
            {maxGross === null ? null : (
              <SvgText x="0" y={y + 12} fill="#9ca3af" fontSize="10">
                {axisMoneyLabel(maxGross * (1 - fraction))}
              </SvgText>
            )}
          </Fragment>
        );
      })}
      {lines.map((line) => {
        const path = svgPath(line.positions);
        return path ? (
          <Path
            key={line.key}
            d={path}
            fill="none"
            stroke={line.color}
            strokeDasharray={line.dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : null;
      })}
      {lines.map((line) => {
        const latest = line.positions.at(-1);
        return latest ? (
          <Circle key={`${line.key}-latest`} cx={latest.x} cy={latest.y} fill={line.color} r="3" />
        ) : null;
      })}
      {selectedX === null ? null : (
        <>
          <Line
            x1={selectedX}
            x2={selectedX}
            y1={GRAPH_TOP}
            y2={GRAPH_HEIGHT - GRAPH_BOTTOM}
            stroke="#9ca3af"
            strokeDasharray="3 4"
          />
          {lines.map((line) => {
            const selected = line.positions[selectedIndex ?? -1];
            return selected ? (
              <Circle
                key={`${line.key}-selected`}
                cx={selected.x}
                cy={selected.y}
                fill="#fff"
                r="6"
                stroke={line.color}
                strokeWidth="3"
              />
            ) : null;
          })}
        </>
      )}
    </Svg>
  );
}

function ChartAxisLabels({ series }: { series: TrendSeries }) {
  const first = series.points[0]?.period;
  const last = series.points.at(-1)?.period;

  if (series.points.length === 1) {
    return (
      <View style={styles.axisLabels}>
        <Text style={[styles.axisText, styles.singleAxisText]}>
          {axisLabel(first, series.bucket)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.axisLabels}>
      <Text style={styles.axisText}>{axisLabel(first, series.bucket)}</Text>
      <Text style={styles.axisText}>{axisLabel(last, series.bucket)}</Text>
    </View>
  );
}

function ChartLegend({
  lines,
  selectedIndex,
}: {
  lines: DrawnLine[];
  selectedIndex: number | null;
}) {
  return (
    <View style={styles.legend}>
      {lines.map((line) => {
        const value = selectedIndex === null
          ? totalPoints(line.points)
          : line.points[selectedIndex];
        return (
          <View key={line.key} style={styles.legendItem}>
            <Svg width="16" height="4">
              <Line
                x1="0"
                x2="16"
                y1="2"
                y2="2"
                stroke={line.color}
                strokeDasharray={line.dash}
                strokeLinecap="round"
                strokeWidth="3"
              />
            </Svg>
            <Text selectable style={styles.legendText}>
              {line.label} {formatCents(value?.grossCents ?? 0)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RangePicker({
  selectedRange,
  onSelect,
}: {
  selectedRange: TrendChartRange;
  onSelect: (range: TrendChartRange) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.ranges}>
      {ranges.map((option) => {
        const selected = option.value === selectedRange;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={rangeAccessibilityLabels[option.value]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.rangeButton, selected && styles.rangeButtonSelected]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={[styles.rangeText, selected && styles.rangeTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function totalPoints(points: CalendarTrend[]): ChartTotals {
  return points.reduce<ChartTotals>(
    (total, point) => ({
      durationSeconds: total.durationSeconds + point.durationSeconds,
      tipsCents: total.tipsCents + point.tipsCents,
      grossCents: total.grossCents + point.grossCents,
    }),
    { durationSeconds: 0, tipsCents: 0, grossCents: 0 }
  );
}

function pointPositions(
  points: CalendarTrend[],
  width: number,
  maxGross: number
): ChartPosition[] {
  const availableWidth = Math.max(0, width - 2 * GRAPH_SIDE_PADDING);

  return points.map((point, index) => ({
    x:
      points.length === 1
        ? width / 2
        : GRAPH_SIDE_PADDING + (index / (points.length - 1)) * availableWidth,
    y: GRAPH_TOP + (1 - point.grossCents / maxGross) * PLOT_HEIGHT,
  }));
}

// Axis ticks only need a magnitude. formatCents is right for the exact figures
// above the chart and far too wide here: "$4,515.46" laid over a gridline
// covers the gridline. Cents go, and thousands abbreviate.
function axisMoneyLabel(cents: number): string {
  const dollars = Math.round(cents / 100);
  return dollars >= 1000 ? `$${(dollars / 1000).toFixed(1)}k` : `$${dollars}`;
}

function svgPath(positions: ChartPosition[]): string {
  return positions
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

// The window runs from where the range starts to the newest shift in it. Using
// the newest shift as the end, rather than the end of the last bucket, keeps the
// label honest: it names the last day there is actually data for.
//
// Exported because the summary card below the chart is scoped to this same
// window and has to name it identically. Two copies of this would drift.
export function rangeLabel(range: TrendChartRange, series: TrendSeries): string {
  if (!series.anchorDate || !series.startDate) return 'No shifts yet';
  return rangeLabelPrecision[range] === 'month'
    ? monthRangeLabel(series.startDate, series.anchorDate)
    : dayRangeLabel(series.startDate, series.anchorDate);
}

function dayRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDay(endDate);
  // The year only needs saying once when both ends share it.
  const start = startDate.slice(0, 4) === endDate.slice(0, 4)
    ? shortDayFormatter.format(new Date(`${startDate}T00:00:00Z`))
    : formatDay(startDate);
  return `${start} – ${formatDay(endDate)}`;
}

function monthRangeLabel(startDate: string, endDate: string): string {
  const start = formatMonth(startDate.slice(0, 7));
  const end = formatMonth(endDate.slice(0, 7));
  return start === end ? start : `${start} – ${end}`;
}

function pointLabel(period: string, bucket: TrendSeries['bucket']): string {
  if (bucket === 'month') return formatMonth(period);
  if (bucket === 'week') return `Week of ${formatDay(period)}`;
  return formatDay(period);
}

function axisLabel(period: string | undefined, bucket: TrendSeries['bucket']): string {
  if (!period) return '';
  if (bucket === 'month') return shortMonthFormatter.format(new Date(`${period}-01T00:00:00Z`));
  return shortDayFormatter.format(new Date(`${period}T00:00:00Z`));
}

function formatDay(period: string): string {
  return dayFormatter.format(new Date(`${period}T00:00:00Z`));
}

function formatMonth(period: string): string {
  return monthFormatter.format(new Date(`${period}-01T00:00:00Z`));
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff' },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: { color: '#374151', fontSize: 15, fontWeight: '600' },
  scope: { flexShrink: 1, color: '#6b7280', fontSize: 13 },
  value: {
    color: '#111827',
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: 6,
  },
  context: { color: '#374151', fontSize: 15, marginTop: 2 },
  breakdown: { color: '#6b7280', fontSize: 13, fontVariant: ['tabular-nums'], marginTop: 4 },
  estimateNote: { color: '#6b7280', fontSize: 12, lineHeight: 18, marginTop: 4 },
  chart: { height: GRAPH_HEIGHT, justifyContent: 'center', marginTop: 18 },
  empty: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisText: { color: '#9ca3af', fontSize: 11, fontVariant: ['tabular-nums'] },
  singleAxisText: { flex: 1, textAlign: 'center' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: '#4b5563', fontSize: 12, fontWeight: '600' },
  hint: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 8 },
  ranges: { flexDirection: 'row', gap: 6, marginTop: 12 },
  rangeButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  rangeButtonSelected: { backgroundColor: '#2563eb' },
  rangeText: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  rangeTextSelected: { color: '#fff' },
});
