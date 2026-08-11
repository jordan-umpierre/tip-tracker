// Turns a flat shift history into the year > month tree the Log screen lists,
// then flattens that tree back into the rows actually on screen.
// Like totals.ts and trends.ts this only maps values onto other values: no
// SQLite, React, formatting, or device clock.
import type { Shift } from '../data/shifts';
import { parseCalendarDate } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

type GroupTotals = {
  shiftCount: number;
  grossCents: number;
  estimated: boolean;
};

const NO_GROSS_OVERRIDES: ReadonlyMap<string, number> = new Map();
const NO_ESTIMATED_JOBS: ReadonlySet<string> = new Set();

// Both levels carry the same totals so a collapsed row can still say what is
// inside it. `period` is what gets displayed ("2026", "2026-08") and `key` is
// what the screen toggles on. They were once different values, because a week
// split across two months needed its two halves keyed apart; with weeks gone
// they are always equal, and the pair is kept only because the row type reads
// better naming what each string is for.
export type ShiftGroup = GroupTotals & {
  key: string;
  period: string;
};

export type ShiftMonth = ShiftGroup & {
  shifts: Shift[];
};

export type ShiftYear = ShiftGroup & {
  months: ShiftMonth[];
};

function addTo(totals: GroupTotals, grossCents: number, estimated: boolean): void {
  totals.shiftCount += 1;
  totals.grossCents += grossCents;
  totals.estimated ||= estimated;
}

// fallow-ignore-next-line complexity -- Group boundaries and estimate totals are asserted in shiftGroups.test.ts.
export function groupShifts(
  shifts: Shift[],
  grossByShift: ReadonlyMap<string, number> = NO_GROSS_OVERRIDES,
  estimatedJobIds: ReadonlySet<string> = NO_ESTIMATED_JOBS
): ShiftYear[] {
  const years = new Map<string, ShiftYear>();
  const months = new Map<string, ShiftMonth>();

  for (const shift of shifts) {
    // Still parsed even though only the string slices below are used for
    // grouping: a stored date that is not a real calendar date has to fail
    // here rather than be filed under a silently wrong month.
    if (!parseCalendarDate(shift.shift_date)) {
      // The form and the importer both reject bad dates, so reaching this means
      // a corrupt stored row.
      throw new Error(`Invalid shift date: ${shift.shift_date}`);
    }

    const yearPeriod = shift.shift_date.slice(0, 4);
    const monthPeriod = shift.shift_date.slice(0, 7);

    let year = years.get(yearPeriod);
    if (!year) {
      year = { key: yearPeriod, period: yearPeriod, months: [], shiftCount: 0, grossCents: 0, estimated: false };
      years.set(yearPeriod, year);
    }

    let month = months.get(monthPeriod);
    if (!month) {
      month = { key: monthPeriod, period: monthPeriod, shifts: [], shiftCount: 0, grossCents: 0, estimated: false };
      months.set(monthPeriod, month);
      year.months.push(month);
    }

    // Same D5 per-shift calculation the totals and Trends use, so no header can
    // ever disagree with the numbers on the other tab.
    const grossCents = grossByShift.get(shift.id) ?? calculateShiftGrossCents(shift);
    const estimated = estimatedJobIds.has(shift.job_id);
    addTo(year, grossCents, estimated);
    addTo(month, grossCents, estimated);
    month.shifts.push(shift);
  }

  // Newest first at every level. The query already returns shifts in that
  // order, but sorting here means the grouping does not silently depend on it.
  const sorted = [...years.values()].sort((left, right) =>
    right.key.localeCompare(left.key)
  );

  for (const year of sorted) {
    year.months.sort((left, right) => right.key.localeCompare(left.key));
    for (const month of year.months) {
      month.shifts.sort((left, right) => right.shift_date.localeCompare(left.shift_date));
    }
  }

  return sorted;
}
