// Layer 1 calculations. Like totals.ts, this module only turns Shift values
// into other values: no SQLite, React, formatting, or device clock.
import type { Shift } from '../data/shifts';
import { parseCalendarDate } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

export const WEEKDAYS = [
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
  shiftCount: number;
  minutes: number;
};

export type WeekdayTrend = {
  weekday: (typeof WEEKDAYS)[number];
  grossPerHourCents: number | null;
  shiftCount: number;
  minutes: number;
};

type TrendTotals = {
  shiftCount: number;
  minutes: number;
  tipsCents: number;
  grossCents: number;
};

export type CalendarTrend = TrendTotals & {
  // "2026-07" for a month or "2026" for a year. ISO order is also
  // chronological order, which lets the results sort without date parsing.
  period: string;
};

export type Trends = {
  headline: HeadlineTrend;
  weekdays: WeekdayTrend[];
  months: CalendarTrend[];
  years: CalendarTrend[];
};

function emptyTotals(): TrendTotals {
  return { shiftCount: 0, minutes: 0, tipsCents: 0, grossCents: 0 };
}

function addShift(totals: TrendTotals, shift: Shift, grossCents: number): void {
  // These objects are local working values created for this calculation.
  // Updating them in place avoids creating four new objects for every shift;
  // callers still receive a brand-new result on every call.
  totals.shiftCount += 1;
  totals.minutes += shift.minutes;
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

function centsPerHour(cents: number, minutes: number): number | null {
  // Null means "no evidence." Zero is reserved for real shifts that earned
  // zero gross, so the UI can tell those two cases apart.
  return minutes === 0 ? null : Math.round((cents * 60) / minutes);
}

export function calculateTrends(shifts: Shift[], jobId: string | null = null): Trends {
  const allTotals = emptyTotals();
  const weekdayTotals = WEEKDAYS.map(() => emptyTotals());
  const monthTotals = new Map<string, TrendTotals>();
  const yearTotals = new Map<string, TrendTotals>();

  for (const shift of shifts) {
    // Null is the explicit "All jobs" scope. A job id applies to every output
    // below because the shift is skipped before any bucket is updated.
    if (jobId !== null && shift.job_id !== jobId) {
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
  }

  return {
    headline: {
      grossPerHourCents: centsPerHour(allTotals.grossCents, allTotals.minutes),
      shiftCount: allTotals.shiftCount,
      minutes: allTotals.minutes,
    },
    weekdays: WEEKDAYS.map((weekday, index) => ({
      weekday,
      grossPerHourCents: centsPerHour(
        weekdayTotals[index].grossCents,
        weekdayTotals[index].minutes
      ),
      shiftCount: weekdayTotals[index].shiftCount,
      minutes: weekdayTotals[index].minutes,
    })),
    months: [...monthTotals.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([period, totals]) => ({ period, ...totals })),
    years: [...yearTotals.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([period, totals]) => ({ period, ...totals })),
  };
}
