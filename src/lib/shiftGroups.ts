// Turns a flat shift history into the month sections the Log screen lists.
// Like totals.ts and trends.ts this only maps Shift values onto other values:
// no SQLite, React, formatting, or device clock.
import type { Shift } from '../data/shifts';
import { calculateShiftGrossCents } from './totals.ts';

export type ShiftMonth = {
  // "2026-08". ISO order is also chronological order, so sorting these sorts
  // the months without parsing a date.
  period: string;
  shifts: Shift[];
  shiftCount: number;
  grossCents: number;
};

export function groupShiftsByMonth(shifts: Shift[]): ShiftMonth[] {
  const months = new Map<string, ShiftMonth>();

  for (const shift of shifts) {
    // The month is the first seven characters of the stored date. No parsing
    // needed, and an unparseable date would already have been rejected at the
    // form and import boundaries.
    const period = shift.shift_date.slice(0, 7);
    let month = months.get(period);
    if (!month) {
      month = { period, shifts: [], shiftCount: 0, grossCents: 0 };
      months.set(period, month);
    }

    month.shifts.push(shift);
    month.shiftCount += 1;
    // Same D5 per-shift calculation the totals and Trends use, so a month
    // header can never disagree with the numbers on the other tab.
    month.grossCents += calculateShiftGrossCents(shift);
  }

  // Newest month first, and newest shift first inside each month. The query
  // already returns shifts in that order, but sorting here means the grouping
  // does not silently depend on it -- a caller passing an unsorted array still
  // gets a list that reads correctly.
  for (const month of months.values()) {
    month.shifts.sort((left, right) => right.shift_date.localeCompare(left.shift_date));
  }

  return [...months.values()].sort((left, right) => right.period.localeCompare(left.period));
}
