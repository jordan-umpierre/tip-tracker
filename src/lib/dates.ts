// Calendar-day handling. Pure like the rest of lib/ -- these take a Date
// rather than reading the clock themselves, which is the only reason they can
// be tested at all.

// The calendar day a shift belongs to, in the device's own timezone, as the
// "YYYY-MM-DD" string schema.sql stores.
//
// The obvious one-liner for this is `date.toISOString().slice(0, 10)`, and it
// is wrong. toISOString() converts to UTC first, so anyone west of Greenwich
// gets tomorrow's date for an evening shift -- at 23:31 US Central on
// 2026-07-30 it returns "2026-07-31". That shipped, and a real device at
// 23:31 is what caught it: a bartender logging a Friday close would have
// filed it under Saturday, which is exactly the mistake the date-only
// convention in schema.sql exists to prevent.
//
// getFullYear/getMonth/getDate all read local time, so building the string
// from them keeps the day the user is actually living in.
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  // getMonth() is zero-based -- January is 0 -- so this needs the +1. The
  // padStart keeps single-digit months and days two characters wide, since
  // "2026-1-5" is not a valid ISO 8601 date and would sort wrong as text.
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parses the exact date-only format stored in SQLite. Returning null gives
// form code a normal validation branch while letting calculations reject a
// persisted value that violates the same rule.
export type CalendarDate = {
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
};

export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // The stored value has no timezone. Constructing and reading in UTC keeps
  // the weekday identical on every device. Reading this with local getters
  // would mix two timezone conventions and repeat Layer 0's date bug.
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date normalizes impossible inputs instead of rejecting them: February 30
  // becomes a day in March. Comparing every part catches that normalization.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, weekdayIndex: date.getUTCDay() };
}

// The Sunday that starts the week containing this date, as a date-only string.
// Trends and the Log both group by week and have to agree on where a week
// begins (D10 pins Sunday-Saturday), so the rule lives here once rather than
// being written out in each of them.
//
// Constructing in UTC keeps a date-only value stable across timezones, and
// lets Date carry the subtraction across month and year boundaries.
export function weekStartString(date: CalendarDate): string {
  const sunday = new Date(Date.UTC(date.year, date.month - 1, date.day - date.weekdayIndex));
  return sunday.toISOString().slice(0, 10);
}

// Month and weekday labels. These live here rather than in a component because
// the shift history and the calendar picker both label the same calendar and
// have to agree -- two copies would be two places for "Sept" to drift into
// "Sep". English only, deliberately: nothing in this app is localized yet, and
// a lookup table is the honest shape for that until something is.
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Sunday first, matching the week boundary D10 pins for Trends and the Log.
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
