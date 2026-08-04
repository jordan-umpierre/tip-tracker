// Layer 1 calculations. Like totals.ts, this module only turns Shift values
// into other values: no SQLite, React, formatting, or device clock.
import type { Shift } from '../data/shifts';
import { parseCalendarDate } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

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

export type TrendChartRange = 'week' | 'month' | 'quarter' | 'year' | 'ytd' | 'all';

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
  months: CalendarTrend[];
  years: CalendarTrend[];
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

function totalsForPeriod(periods: Map<string, TrendTotals>, period: string): TrendTotals {
  const existing = periods.get(period);
  if (existing) {
    return existing;
  }

  const totals = emptyTotals();
  periods.set(period, totals);
  return totals;
}

function centsPerHour(cents: number, durationSeconds: number): number | null {
  // Null means "no evidence." Zero is reserved for real shifts that earned
  // zero gross, so the UI can tell those two cases apart.
  return durationSeconds === 0 ? null : Math.round((cents * 3600) / durationSeconds);
}

function average(total: number, count: number): number | null {
  return count === 0 ? null : Math.round(total / count);
}

function weekStartKey(date: NonNullable<ReturnType<typeof parseCalendarDate>>): string {
  // Trends use Sunday-Saturday calendar weeks. Constructing in UTC keeps a
  // date-only shift stable across timezones and lets Date cross month/year
  // boundaries for us.
  const sunday = new Date(Date.UTC(date.year, date.month - 1, date.day - date.weekdayIndex));
  return sunday.toISOString().slice(0, 10);
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

// Every range branch is covered through calculateTrendSeries in the direct-run
// assertions; this repo does not produce Istanbul data for Fallow's CRAP model.
// fallow-ignore-next-line complexity
function seriesKeys(range: TrendChartRange, oldest: DatedShift, newest: DatedShift): string[] {
  if (range === 'week' || range === 'month') {
    const dayCount = range === 'week' ? 7 : 30;
    return dayKeys(newest.timestamp - (dayCount - 1) * DAY_IN_MILLISECONDS, dayCount);
  }

  if (range === 'quarter') {
    const newestWeekStart = Date.parse(`${weekStartKey(newest.date)}T00:00:00.000Z`);
    return Array.from({ length: 13 }, (_, index) =>
      dateKey(newestWeekStart - (12 - index) * 7 * DAY_IN_MILLISECONDS)
    );
  }

  if (range === 'ytd') {
    // January through the month of the newest shift. Unlike every other range
    // this one is anchored to a calendar boundary rather than rolling backwards,
    // so the window shrinks to a single month each January.
    return monthKeys(Date.UTC(newest.date.year, 0, 1), newest.date.month);
  }

  if (range === 'year') {
    return monthKeys(Date.UTC(newest.date.year, newest.date.month - 12, 1), 12);
  }

  const start = Date.UTC(oldest.date.year, oldest.date.month - 1, 1);
  const monthCount =
    (newest.date.year - oldest.date.year) * 12 + newest.date.month - oldest.date.month + 1;
  return monthKeys(start, monthCount);
}

function pointKeyForShift(
  bucket: TrendSeries['bucket'],
  shift: Shift,
  date: DatedShift['date']
): string {
  if (bucket === 'day') return shift.shift_date;
  if (bucket === 'week') return weekStartKey(date);
  return shift.shift_date.slice(0, 7);
}

export function calculateTrendSeries(
  shifts: Shift[],
  range: TrendChartRange,
  jobId: string | null = null
): TrendSeries {
  const datedShifts = datedShiftsForJob(shifts, jobId);
  const bucket = bucketForRange(range);

  if (datedShifts.length === 0) {
    return { anchorDate: null, startDate: null, bucket, points: [] };
  }

  datedShifts.sort((left, right) => left.timestamp - right.timestamp);
  const oldest = datedShifts[0];
  const newest = datedShifts[datedShifts.length - 1];
  const keys = seriesKeys(range, oldest, newest);

  const totalsByPoint = new Map(keys.map((key) => [key, emptyTotals()]));

  for (const { shift, date } of datedShifts) {
    const totals = totalsByPoint.get(pointKeyForShift(bucket, shift, date));
    if (totals) {
      addShift(totals, shift, calculateShiftGrossCents(shift));
    }
  }

  return {
    anchorDate: newest.shift.shift_date,
    // Month buckets are keyed "2026-01"; widen that to the first of the month
    // so callers always receive a full calendar date.
    startDate: keys[0].length === 7 ? `${keys[0]}-01` : keys[0],
    bucket,
    points: [...totalsByPoint].map(([period, totals]) => ({ period, ...totals })),
  };
}

export function calculateTrends(shifts: Shift[], jobId: string | null = null): Trends {
  const allTotals = emptyTotals();
  const weekdayTotals = WEEKDAYS.map(() => emptyTotals());
  const monthTotals = new Map<string, TrendTotals>();
  const yearTotals = new Map<string, TrendTotals>();
  const workedWeeks = new Set<string>();

  for (const shift of shifts) {
    // Null is the explicit "All jobs" scope. A job id applies to every output
    // below because the shift is skipped before any bucket is updated.
    if (!shiftMatchesJob(shift, jobId)) {
      continue;
    }

    const grossCents = calculateShiftGrossCents(shift);
    const date = parseCalendarDate(shift.shift_date);
    if (!date) {
      // New writes are stopped at the form boundary. Throwing here also makes
      // older corrupt rows visible instead of silently filing them elsewhere.
      throw new Error(`Invalid shift date: ${shift.shift_date}`);
    }
    const monthPeriod = shift.shift_date.slice(0, 7);
    const yearPeriod = shift.shift_date.slice(0, 4);

    addShift(allTotals, shift, grossCents);
    addShift(weekdayTotals[date.weekdayIndex], shift, grossCents);
    addShift(totalsForPeriod(monthTotals, monthPeriod), shift, grossCents);
    addShift(totalsForPeriod(yearTotals, yearPeriod), shift, grossCents);
    workedWeeks.add(weekStartKey(date));
  }

  const workedWeekCount = workedWeeks.size;

  return {
    headline: {
      grossPerHourCents: centsPerHour(allTotals.grossCents, allTotals.durationSeconds),
      grossCents: allTotals.grossCents,
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
    months: [...monthTotals.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([period, totals]) => ({ period, ...totals })),
    years: [...yearTotals.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([period, totals]) => ({ period, ...totals })),
  };
}
