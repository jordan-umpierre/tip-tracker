// The calendar picker's arithmetic, kept away from the component so it can be
// asserted directly like the rest of lib/. Building the grid is the part with
// edge cases -- leap years, months starting on a Saturday, December rolling
// into January -- and none of those are things to discover on a device.
import { localDateString } from './dates.ts';

// A cell is either a day in the month being shown, or null for the blanks that
// pad the first and last weeks. Nulls rather than days from the neighbouring
// months: this picker only selects within the month on screen, so rendering a
// greyed-out 29th of the previous month would draw something untappable.
export type MonthGridCell = { day: number; date: string } | null;

// Every grid is this many rows regardless of the month, so the calendar does
// not change height as it is paged. See the padding loop for why.
const WEEKS_SHOWN = 6;

// `month` is 1-12, not the 0-11 that Date uses. The whole file converts at the
// boundary instead of leaking that off-by-one into callers, which is the same
// convention parseCalendarDate already follows.
export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
  // Day 0 of the next month is the last day of this one, which is how this
  // gets February right in a leap year without a rule about leap years.
  const daysInMonth = new Date(year, month, 0).getDate();

  // Which column the 1st lands in. 0 is Sunday, matching WEEKDAY_NAMES and the
  // week boundary D10 pins.
  const leadingBlanks = new Date(year, month - 1, 1).getDay();

  const cells: MonthGridCell[] = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    // Built through localDateString so the cell's date string is produced by
    // the same function every other date in the app goes through, rather than
    // a second hand-rolled formatter that could pad differently.
    cells.push({ day, date: localDateString(new Date(year, month - 1, day)) });
  }

  // Pad to a fixed six rows rather than just to a whole week. Six is the most
  // any month can need -- 31 days starting on a Saturday -- so every grid comes
  // back the same size.
  //
  // The alternative, padding only to the end of the last week, made the sheet
  // change height as the user paged: July 2026 needs five rows and August needs
  // six, so the calendar grew and shrank under the thumb. A fixed height costs
  // a blank row on short months and is worth it.
  while (cells.length < WEEKS_SHOWN * 7) {
    cells.push(null);
  }

  return cells;
}

// Steps the displayed month, carrying across a year boundary. Date does the
// carrying: month -1 + delta can be -1 or 12 and it normalizes either way, so
// there is no December-to-January branch here to get wrong.
export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const moved = new Date(year, month - 1 + delta, 1);
  return { year: moved.getFullYear(), month: moved.getMonth() + 1 };
}
