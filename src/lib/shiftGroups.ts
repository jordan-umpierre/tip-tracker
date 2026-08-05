// Turns a flat shift history into the year > month > week tree the Log screen
// lists, then flattens that tree back into the rows actually on screen.
// Like totals.ts and trends.ts this only maps values onto other values: no
// SQLite, React, formatting, or device clock.
import type { Shift } from '../data/shifts';
import { parseCalendarDate, weekStartString } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

type GroupTotals = {
  shiftCount: number;
  grossCents: number;
  estimated: boolean;
};

const NO_GROSS_OVERRIDES: ReadonlyMap<string, number> = new Map();
const NO_ESTIMATED_JOBS: ReadonlySet<string> = new Set();

// Every level carries the same totals so a collapsed row can still say what is
// inside it. `period` is what gets displayed ("2026", "2026-08", "2026-08-02");
// `key` is what the screen toggles on. They differ only for weeks, where a week
// split across two months would otherwise collapse both halves at once.
export type ShiftGroup = GroupTotals & {
  key: string;
  period: string;
};

export type ShiftWeek = ShiftGroup & {
  shifts: Shift[];
};

export type ShiftMonth = ShiftGroup & {
  weeks: ShiftWeek[];
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
  const weeks = new Map<string, ShiftWeek>();

  for (const shift of shifts) {
    const date = parseCalendarDate(shift.shift_date);
    if (!date) {
      // The form and the importer both reject bad dates, so reaching this means
      // a corrupt stored row. Throwing surfaces it instead of filing the shift
      // under some silently wrong week.
      throw new Error(`Invalid shift date: ${shift.shift_date}`);
    }

    const yearPeriod = shift.shift_date.slice(0, 4);
    const monthPeriod = shift.shift_date.slice(0, 7);
    const weekPeriod = weekStartString(date);
    // A week straddling two months belongs to both, holding only that month's
    // shifts in each. That is deliberate: a month's rows have to add up to the
    // total in its own header, and splitting the week is the only way both
    // stay true. Keying the week by month as well keeps the two halves
    // independently collapsible.
    const weekKey = `${monthPeriod}:${weekPeriod}`;

    let year = years.get(yearPeriod);
    if (!year) {
      year = { key: yearPeriod, period: yearPeriod, months: [], shiftCount: 0, grossCents: 0, estimated: false };
      years.set(yearPeriod, year);
    }

    let month = months.get(monthPeriod);
    if (!month) {
      month = { key: monthPeriod, period: monthPeriod, weeks: [], shiftCount: 0, grossCents: 0, estimated: false };
      months.set(monthPeriod, month);
      year.months.push(month);
    }

    let week = weeks.get(weekKey);
    if (!week) {
      week = { key: weekKey, period: weekPeriod, shifts: [], shiftCount: 0, grossCents: 0, estimated: false };
      weeks.set(weekKey, week);
      month.weeks.push(week);
    }

    // Same D5 per-shift calculation the totals and Trends use, so no header can
    // ever disagree with the numbers on the other tab.
    const grossCents = grossByShift.get(shift.id) ?? calculateShiftGrossCents(shift);
    const estimated = estimatedJobIds.has(shift.job_id);
    addTo(year, grossCents, estimated);
    addTo(month, grossCents, estimated);
    addTo(week, grossCents, estimated);
    week.shifts.push(shift);
  }

  // Newest first at every level. The query already returns shifts in that
  // order, but sorting here means the grouping does not silently depend on it.
  const sorted = [...years.values()].sort((left, right) =>
    right.key.localeCompare(left.key)
  );

  for (const year of sorted) {
    year.months.sort((left, right) => right.key.localeCompare(left.key));
    for (const month of year.months) {
      month.weeks.sort((left, right) => right.key.localeCompare(left.key));
      for (const week of month.weeks) {
        week.shifts.sort((left, right) => right.shift_date.localeCompare(left.shift_date));
      }
    }
  }

  return sorted;
}

export type ShiftGroupRow = ShiftGroup & {
  kind: 'year' | 'month' | 'week';
  expanded: boolean;
};

export type ShiftListRow = ShiftGroupRow | { kind: 'shift'; key: string; shift: Shift };

// Everything starts closed, so opening the Log tab shows one row per year and
// nothing else. Only groups the user has actually tapped appear in `toggled`,
// which means the list needs no effect to re-seed itself after a log, an edit,
// or an import: anything untouched is simply shut.
function groupRow(
  kind: ShiftGroupRow['kind'],
  group: ShiftGroup,
  toggled: Record<string, boolean>
): ShiftGroupRow {
  return {
    kind,
    key: group.key,
    period: group.period,
    shiftCount: group.shiftCount,
    grossCents: group.grossCents,
    estimated: group.estimated,
    expanded: toggled[group.key] === true,
  };
}

// fallow-ignore-next-line complexity -- Expansion branches are asserted in shiftGroups.test.ts.
export function flattenShifts(
  years: ShiftYear[],
  toggled: Record<string, boolean>
): ShiftListRow[] {
  const rows: ShiftListRow[] = [];

  for (const year of years) {
    const yearRow = groupRow('year', year, toggled);
    rows.push(yearRow);
    if (!yearRow.expanded) continue;

    for (const month of year.months) {
      const monthRow = groupRow('month', month, toggled);
      rows.push(monthRow);
      if (!monthRow.expanded) continue;

      for (const week of month.weeks) {
        const weekRow = groupRow('week', week, toggled);
        rows.push(weekRow);
        if (!weekRow.expanded) continue;

        for (const shift of week.shifts) {
          rows.push({ kind: 'shift', key: shift.id, shift });
        }
      }
    }
  }

  return rows;
}
