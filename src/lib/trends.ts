// Layer 1 calculations. Like totals.ts, this module only turns Shift values
// into other values: no SQLite, React, formatting, or device clock.
import type { Shift } from '../data/shifts';
import { parseCalendarDate, weekStartString } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

const NO_GROSS_OVERRIDES: ReadonlyMap<string, number> = new Map();

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type HeadlineTrend = {
  grossPerHourCents: number | null;
  grossCents: number;
  // Tips are carried separately so a caller can split gross into wage and
  // tips without re-walking the shifts. The totals below already track it;
  // this used to drop it on the floor.
  tipsCents: number;
  durationSeconds: number;
  workedWeekCount: number;
  grossPerWorkedWeekCents: number | null;
  durationPerWorkedWeekSeconds: number | null;
};

export type WeekdayTrend = {
  weekday: (typeof WEEKDAYS)[number];
  grossPerHourCents: number | null;
  shiftCount: number;
  durationSeconds: number;
};

type TrendTotals = {
  shiftCount: number;
  durationSeconds: number;
  tipsCents: number;
  grossCents: number;
};

export type CalendarTrend = TrendTotals & {
  // "2026-07" for a month or "2026" for a year. ISO order is also
  // chronological order, which lets the results sort without date parsing.
  period: string;
};

export type TrendChartRange =
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'ytd'
  | 'all'
  | 'custom';

export type TrendSeriesOptions = {
  // Zero is the latest window. Negative values move to earlier windows and
  // positive values move forward by one whole range at a time.
  pageOffset?: number;
  customStartDate?: string;
  customEndDate?: string;
};

export type TrendSeries = {
  anchorDate: string | null;
  // First calendar day the window covers. The chart labels the window with
  // real dates, and this module is the only place that knows where each
  // range starts, so it hands the date out rather than making the UI re-derive it.
  startDate: string | null;
  bucket: 'day' | 'week' | 'month';
  points: CalendarTrend[];
};

export type Trends = {
  headline: HeadlineTrend;
  weekdays: WeekdayTrend[];
};

function emptyTotals(): TrendTotals {
  return { shiftCount: 0, durationSeconds: 0, tipsCents: 0, grossCents: 0 };
}

function addShift(totals: TrendTotals, shift: Shift, grossCents: number): void {
  // These objects are local working values created for this calculation.
  // Updating them in place avoids creating four new objects for every shift;
  // callers still receive a brand-new result on every call.
  totals.shiftCount += 1;
  totals.durationSeconds += shift.duration_seconds;
  totals.tipsCents += shift.tips_cents;
  totals.grossCents += grossCents;
}

function centsPerHour(cents: number, durationSeconds: number): number | null {
  // Null means "no evidence." Zero is reserved for real shifts that earned
  // zero gross, so the UI can tell those two cases apart.
  return durationSeconds === 0 ? null : Math.round((cents * 3600) / durationSeconds);
}

function average(total: number, count: number): number | null {
  return count === 0 ? null : Math.round(total / count);
}

function shiftMatchesJob(shift: Shift, jobId: string | null): boolean {
  return jobId === null || shift.job_id === jobId;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function monthKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function dayKeys(startTimestamp: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    dateKey(startTimestamp + index * DAY_IN_MILLISECONDS)
  );
}

function monthKeys(startTimestamp: number, count: number): string[] {
  const start = new Date(startTimestamp);
  return Array.from({ length: count }, (_, index) =>
    monthKey(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1))
  );
}

function calendarTimestamp(value: string, label: string): number {
  const date = parseCalendarDate(value);
  if (!date) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return Date.UTC(date.year, date.month - 1, date.day);
}

type DatedShift = {
  shift: Shift;
  date: NonNullable<ReturnType<typeof parseCalendarDate>>;
  timestamp: number;
};

function datedShiftsForJob(shifts: Shift[], jobId: string | null): DatedShift[] {
  return shifts.filter((shift) => shiftMatchesJob(shift, jobId)).map((shift) => {
    const date = parseCalendarDate(shift.shift_date);
    if (!date) {
      throw new Error(`Invalid shift date: ${shift.shift_date}`);
    }

    return {
      shift,
      date,
      timestamp: Date.UTC(date.year, date.month - 1, date.day),
    };
  });
}

function bucketForRange(range: TrendChartRange): TrendSeries['bucket'] {
  if (range === 'week' || range === 'month') return 'day';
  return range === 'quarter' ? 'week' : 'month';
}

type SeriesWindow = {
  startDate: string;
  endDate: string;
  bucket: TrendSeries['bucket'];
  keys: string[];
};

function endOfMonth(timestamp: number): string {
  const month = new Date(timestamp);
  return dateKey(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
}

function customSeriesWindow(startDate: string, endDate: string): SeriesWindow {
  const startTimestamp = calendarTimestamp(startDate, 'custom start date');
  const endTimestamp = calendarTimestamp(endDate, 'custom end date');
  if (startTimestamp > endTimestamp) {
    throw new Error('Custom start date must be on or before the end date');
  }

  const dayCount = Math.round((endTimestamp - startTimestamp) / DAY_IN_MILLISECONDS) + 1;
  if (dayCount <= 31) {
    return { startDate, endDate, bucket: 'day', keys: dayKeys(startTimestamp, dayCount) };
  }

  if (dayCount <= 366) {
    const start = parseCalendarDate(startDate)!;
    const end = parseCalendarDate(endDate)!;
    const firstWeek = Date.parse(`${weekStartString(start)}T00:00:00.000Z`);
    const lastWeek = Date.parse(`${weekStartString(end)}T00:00:00.000Z`);
    const weekCount = Math.round((lastWeek - firstWeek) / (7 * DAY_IN_MILLISECONDS)) + 1;
    return {
      startDate,
      endDate,
      bucket: 'week',
      keys: Array.from({ length: weekCount }, (_, index) =>
        dateKey(firstWeek + index * 7 * DAY_IN_MILLISECONDS)
      ),
    };
  }

  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  const monthCount =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth() +
    1;
  return {
    startDate,
    endDate,
    bucket: 'month',
    keys: monthKeys(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1), monthCount),
  };
}

// fallow-ignore-next-line complexity -- Every range branch is covered through calculateTrendSeries in the direct-run assertions; this repo produces no Istanbul data for Fallow's CRAP model.
function presetSeriesWindow(
  range: Exclude<TrendChartRange, 'custom'>,
  oldest: DatedShift,
  newest: DatedShift,
  pageOffset: number
): SeriesWindow {
  if (range === 'week' || range === 'month') {
    const dayCount = range === 'week' ? 7 : 30;
    const endTimestamp = newest.timestamp + pageOffset * dayCount * DAY_IN_MILLISECONDS;
    const startTimestamp = endTimestamp - (dayCount - 1) * DAY_IN_MILLISECONDS;
    return {
      startDate: dateKey(startTimestamp),
      endDate: dateKey(endTimestamp),
      bucket: 'day',
      keys: dayKeys(startTimestamp, dayCount),
    };
  }

  if (range === 'quarter') {
    const newestWeekStart = Date.parse(`${weekStartString(newest.date)}T00:00:00.000Z`);
    const lastWeekStart = newestWeekStart + pageOffset * 13 * 7 * DAY_IN_MILLISECONDS;
    const firstWeekStart = lastWeekStart - 12 * 7 * DAY_IN_MILLISECONDS;
    return {
      startDate: dateKey(firstWeekStart),
      endDate:
        pageOffset === 0
          ? newest.shift.shift_date
          : dateKey(lastWeekStart + 6 * DAY_IN_MILLISECONDS),
      bucket: 'week',
      keys: Array.from({ length: 13 }, (_, index) =>
        dateKey(firstWeekStart + index * 7 * DAY_IN_MILLISECONDS)
      ),
    };
  }

  if (range === 'ytd') {
    // January through the month of the newest shift. Unlike every other range
    // this one is anchored to a calendar boundary rather than rolling backwards,
    // so the window shrinks to a single month each January.
    const year = newest.date.year + pageOffset;
    const monthCount = pageOffset === 0 ? newest.date.month : 12;
    return {
      startDate: `${year}-01-01`,
      endDate: pageOffset === 0 ? newest.shift.shift_date : `${year}-12-31`,
      bucket: 'month',
      keys: monthKeys(Date.UTC(year, 0, 1), monthCount),
    };
  }

  if (range === 'year') {
    const lastMonthStart = Date.UTC(
      newest.date.year,
      newest.date.month - 1 + pageOffset * 12,
      1
    );
    const firstMonthStart = Date.UTC(
      newest.date.year,
      newest.date.month - 12 + pageOffset * 12,
      1
    );
    return {
      startDate: dateKey(firstMonthStart),
      endDate: pageOffset === 0 ? newest.shift.shift_date : endOfMonth(lastMonthStart),
      bucket: 'month',
      keys: monthKeys(firstMonthStart, 12),
    };
  }

  const start = Date.UTC(oldest.date.year, oldest.date.month - 1, 1);
  const monthCount =
    (newest.date.year - oldest.date.year) * 12 + newest.date.month - oldest.date.month + 1;
  return {
    startDate: dateKey(start),
    endDate: newest.shift.shift_date,
    bucket: 'month',
    keys: monthKeys(start, monthCount),
  };
}

function pointKeyForShift(
  bucket: TrendSeries['bucket'],
  shift: Shift,
  date: DatedShift['date']
): string {
  if (bucket === 'day') return shift.shift_date;
  if (bucket === 'week') return weekStartString(date);
  return shift.shift_date.slice(0, 7);
}

// fallow-ignore-next-line complexity -- Range and gross-overlay branches are asserted in trends.test.ts.
export function calculateTrendSeries(
  shifts: Shift[],
  range: TrendChartRange,
  jobId: string | null = null,
  grossByShift: ReadonlyMap<string, number> = NO_GROSS_OVERRIDES,
  options: TrendSeriesOptions = {}
): TrendSeries {
  const datedShifts = datedShiftsForJob(shifts, jobId);

  const customWindow =
    range === 'custom'
      ? customSeriesWindow(options.customStartDate ?? '', options.customEndDate ?? '')
      : null;
  const bucket = customWindow?.bucket ?? bucketForRange(range);

  if (datedShifts.length === 0) {
    if (!customWindow) {
      return { anchorDate: null, startDate: null, bucket, points: [] };
    }

    return {
      anchorDate: customWindow.endDate,
      startDate: customWindow.startDate,
      bucket,
      points: customWindow.keys.map((period) => ({ period, ...emptyTotals() })),
    };
  }

  datedShifts.sort((left, right) => left.timestamp - right.timestamp);
  const oldest = datedShifts[0];
  const newest = datedShifts[datedShifts.length - 1];
  const window =
    customWindow ??
    presetSeriesWindow(range as Exclude<TrendChartRange, 'custom'>, oldest, newest, options.pageOffset ?? 0);

  const totalsByPoint = new Map(window.keys.map((key) => [key, emptyTotals()]));

  for (const { shift, date } of datedShifts) {
    if (shift.shift_date < window.startDate || shift.shift_date > window.endDate) {
      continue;
    }

    const totals = totalsByPoint.get(pointKeyForShift(bucket, shift, date));
    if (totals) {
      addShift(
        totals,
        shift,
        grossByShift.get(shift.id) ?? calculateShiftGrossCents(shift)
      );
    }
  }

  return {
    anchorDate: window.endDate,
    startDate: window.startDate,
    bucket,
    points: [...totalsByPoint].map(([period, totals]) => ({ period, ...totals })),
  };
}

// Builds one gross-income line per job against the aggregate chart's exact
// buckets. Using the aggregate series as the template keeps every line on the
// same dates when different jobs have different first or latest shifts.
// fallow-ignore-next-line complexity -- Window, bucket, and per-job sum branches are covered by direct-run assertions in trends.test.ts.
export function calculateTrendPointsByJob(
  shifts: Shift[],
  series: TrendSeries,
  grossByShift: ReadonlyMap<string, number> = NO_GROSS_OVERRIDES
): Map<string, CalendarTrend[]> {
  const pointsByJob = new Map<string, CalendarTrend[]>();
  if (!series.startDate || !series.anchorDate) return pointsByJob;

  const pointIndexes = new Map(
    series.points.map((point, index) => [point.period, index])
  );

  for (const { shift, date } of datedShiftsForJob(shifts, null)) {
    if (shift.shift_date < series.startDate || shift.shift_date > series.anchorDate) {
      continue;
    }

    const pointIndex = pointIndexes.get(pointKeyForShift(series.bucket, shift, date));
    if (pointIndex === undefined) continue;

    let jobPoints = pointsByJob.get(shift.job_id);
    if (!jobPoints) {
      jobPoints = series.points.map((point) => ({ period: point.period, ...emptyTotals() }));
      pointsByJob.set(shift.job_id, jobPoints);
    }

    addShift(
      jobPoints[pointIndex],
      shift,
      grossByShift.get(shift.id) ?? calculateShiftGrossCents(shift)
    );
  }

  return pointsByJob;
}

// The shifts a chart series actually drew, so a summary beside the chart can be
// calculated over exactly the same set. Both bounds are date-only strings in
// the same format as shift_date, so comparing them as strings is the whole
// filter -- no parsing, and no second definition of where a window starts.
export function shiftsInWindow(shifts: Shift[], series: TrendSeries): Shift[] {
  const { startDate, anchorDate } = series;
  if (!startDate || !anchorDate) {
    return [];
  }

  return shifts.filter(
    (shift) => shift.shift_date >= startDate && shift.shift_date <= anchorDate
  );
}

// Returns the exact calendar dates behind either the whole visible series or
// one point on it. Week and month buckets can extend beyond a custom or latest
// window, so both ends are clamped to the dates the chart actually drew.
// fallow-ignore-next-line complexity -- Day, week, month, clamp, and rejection branches have direct assertions in trends.test.ts.
export function trendWindowForPoint(
  series: TrendSeries,
  period: string | null
): { startDate: string; endDate: string } | null {
  if (!series.startDate || !series.anchorDate) return null;
  if (period === null) {
    return { startDate: series.startDate, endDate: series.anchorDate };
  }
  if (!series.points.some((point) => point.period === period)) return null;

  let startDate = period;
  let endDate = period;
  if (series.bucket === 'week') {
    const startTimestamp = calendarTimestamp(period, 'trend point date');
    endDate = dateKey(startTimestamp + 6 * DAY_IN_MILLISECONDS);
  } else if (series.bucket === 'month') {
    startDate = `${period}-01`;
    endDate = endOfMonth(calendarTimestamp(startDate, 'trend point month'));
  }

  return {
    startDate: startDate < series.startDate ? series.startDate : startDate,
    endDate: endDate > series.anchorDate ? series.anchorDate : endDate,
  };
}

// fallow-ignore-next-line complexity -- Scope and aggregation branches are asserted in trends.test.ts.
export function calculateTrends(
  shifts: Shift[],
  jobId: string | null = null,
  grossByShift: ReadonlyMap<string, number> = NO_GROSS_OVERRIDES
): Trends {
  const allTotals = emptyTotals();
  const weekdayTotals = WEEKDAYS.map(() => emptyTotals());
  const workedWeeks = new Set<string>();

  for (const shift of shifts) {
    // Null is the explicit "All jobs" scope. A job id applies to every output
    // below because the shift is skipped before any bucket is updated.
    if (!shiftMatchesJob(shift, jobId)) {
      continue;
    }

    const grossCents = grossByShift.get(shift.id) ?? calculateShiftGrossCents(shift);
    const date = parseCalendarDate(shift.shift_date);
    if (!date) {
      // New writes are stopped at the form boundary. Throwing here also makes
      // older corrupt rows visible instead of silently filing them elsewhere.
      throw new Error(`Invalid shift date: ${shift.shift_date}`);
    }
    addShift(allTotals, shift, grossCents);
    addShift(weekdayTotals[date.weekdayIndex], shift, grossCents);
    workedWeeks.add(weekStartString(date));
  }

  const workedWeekCount = workedWeeks.size;

  return {
    headline: {
      grossPerHourCents: centsPerHour(allTotals.grossCents, allTotals.durationSeconds),
      grossCents: allTotals.grossCents,
      tipsCents: allTotals.tipsCents,
      durationSeconds: allTotals.durationSeconds,
      workedWeekCount,
      grossPerWorkedWeekCents: average(allTotals.grossCents, workedWeekCount),
      durationPerWorkedWeekSeconds: average(allTotals.durationSeconds, workedWeekCount),
    },
    weekdays: WEEKDAYS.map((weekday, index) => ({
      weekday,
      grossPerHourCents: centsPerHour(
        weekdayTotals[index].grossCents,
        weekdayTotals[index].durationSeconds
      ),
      shiftCount: weekdayTotals[index].shiftCount,
      durationSeconds: weekdayTotals[index].durationSeconds,
    })),
  };
}
