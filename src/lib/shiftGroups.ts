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
};

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

function addTo(totals: GroupTotals, grossCents: number): void {
  totals.shiftCount += 1;
  totals.grossCents += grossCents;
}

export function groupShifts(shifts: Shift[]): ShiftYear[] {
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
      year = { key: yearPeriod, period: yearPeriod, months: [], shiftCount: 0, grossCents: 0 };
      years.set(yearPeriod, year);
    }

    let month = months.get(monthPeriod);
    if (!month) {
      month = { key: monthPeriod, period: monthPeriod, weeks: [], shiftCount: 0, grossCents: 0 };
      months.set(monthPeriod, month);
      year.months.push(month);
    }

    let week = weeks.get(weekKey);
    if (!week) {
      week = { key: weekKey, period: weekPeriod, shifts: [], shiftCount: 0, grossCents: 0 };
      weeks.set(weekKey, week);
      month.weeks.push(week);
    }

    // Same D5 per-shift calculation the totals and Trends use, so no header can
    // ever disagree with the numbers on the other tab.
    const grossCents = calculateShiftGrossCents(shift);
    addTo(year, grossCents);
    addTo(month, grossCents);
    addTo(week, grossCents);
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

// Only groups the user has actually tapped appear in `toggled`. Everything else
// falls back to "the newest one at each level is open", which puts the most
// recent shifts on screen with no taps while every older group stays one row
// tall. Deriving the default from position rather than storing it means the
// list re-seeds itself correctly after a log, an edit, or an import.
function groupRow(
  kind: ShiftGroupRow['kind'],
  group: ShiftGroup,
  toggled: Record<string, boolean>,
  index: number
): ShiftGroupRow {
  return {
    kind,
    key: group.key,
    period: group.period,
    shiftCount: group.shiftCount,
    grossCents: group.grossCents,
    expanded: toggled[group.key] ?? index === 0,
  };
}

export function flattenShifts(
  years: ShiftYear[],
  toggled: Record<string, boolean>
): ShiftListRow[] {
  const rows: ShiftListRow[] = [];

  years.forEach((year, yearIndex) => {
    const yearRow = groupRow('year', year, toggled, yearIndex);
    rows.push(yearRow);
    if (!yearRow.expanded) return;

    year.months.forEach((month, monthIndex) => {
      const monthRow = groupRow('month', month, toggled, monthIndex);
      rows.push(monthRow);
      if (!monthRow.expanded) return;

      month.weeks.forEach((week, weekIndex) => {
        const weekRow = groupRow('week', week, toggled, weekIndex);
        rows.push(weekRow);
        if (!weekRow.expanded) return;

        for (const shift of week.shifts) {
          rows.push({ kind: 'shift', key: shift.id, shift });
        }
      });
    });
  });

  return rows;
}
