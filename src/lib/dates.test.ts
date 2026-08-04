// fallow-ignore-file unused-file -- the pre-commit hook executes this file directly.
// Run with: node src/lib/dates.test.ts
//
// Same no-framework approach as totals.test.ts: Node runs TypeScript directly
// and node:assert is standard library.
//
// Every Date below is built with the multi-argument constructor, which
// interprets its arguments as LOCAL time. The getters localDateString uses are
// local too, so these assertions hold in any timezone -- they don't quietly
// pass only on the machine that wrote them. That matters here more than usual,
// since the bug being guarded against is specifically a timezone bug.
import assert from 'node:assert/strict';
import { durationSecondsBetween, localDateString, parseCalendarDate, timeInputValue, weekStartString } from './dates.ts';

// The regression. 23:31 local on 2026-07-30 is already 2026-07-31 in UTC for
// anywhere in the Americas, and the old toISOString().slice(0, 10) returned
// that. A shift worked Thursday night has to stay on Thursday.
assert.equal(localDateString(new Date(2026, 6, 30, 23, 31)), '2026-07-30');

// The same local day has to produce the same string all day long, including
// at the two ends where a UTC conversion is most likely to slide it. Under the
// old implementation these two disagreed in most of the world.
assert.equal(
  localDateString(new Date(2026, 6, 30, 0, 5)),
  localDateString(new Date(2026, 6, 30, 23, 55))
);

// Single-digit months and days need padding. "2026-1-5" is not valid ISO 8601
// and, being stored as text, would sort before "2026-01-10" incorrectly.
assert.equal(localDateString(new Date(2026, 0, 5)), '2026-01-05');

// Month is zero-based in the constructor and in getMonth(), so December is 11.
// An off-by-one here would be silent and would only be noticed a month later.
assert.equal(localDateString(new Date(2026, 11, 25)), '2026-12-25');

// Leap day, because February is where date code goes wrong.
assert.equal(localDateString(new Date(2028, 1, 29)), '2028-02-29');

// Stored date parsing is strict rather than Date's normalizing behavior.
assert.deepEqual(parseCalendarDate('2026-07-30'), {
  year: 2026,
  month: 7,
  day: 30,
  weekdayIndex: 4, // Thursday
});
assert.equal(parseCalendarDate('07/30/2026'), null);
assert.equal(parseCalendarDate('2026-7-30'), null);
assert.equal(parseCalendarDate('2026-02-30'), null);
assert.equal(parseCalendarDate('2027-02-29'), null);
assert.deepEqual(parseCalendarDate('2028-02-29'), {
  year: 2028,
  month: 2,
  day: 29,
  weekdayIndex: 2, // Tuesday
});

assert.equal(durationSecondsBetween('09:00', '17:00'), 8 * 3600);
assert.equal(durationSecondsBetween('21:30', '02:00'), 4.5 * 3600);
assert.equal(durationSecondsBetween('09:00', '09:00'), null);
assert.equal(timeInputValue('00:00'), '12:00 AM');
assert.equal(timeInputValue('09:05'), '9:05 AM');
assert.equal(timeInputValue('17:00'), '5:00 PM');
assert.equal(timeInputValue(null), '');

// Weeks start Sunday (D10), and the start date has to cross month and year
// boundaries rather than clamping to the 1st. Trends and the Log both group by
// week off this, so a change here silently moves shifts between groups on two
// screens at once.
function weekStart(value: string): string {
  const date = parseCalendarDate(value);
  assert.ok(date, `expected ${value} to parse`);
  return weekStartString(date);
}

assert.equal(weekStart('2026-08-02'), '2026-08-02'); // a Sunday is its own start
assert.equal(weekStart('2026-08-08'), '2026-08-02'); // Saturday, same week
assert.equal(weekStart('2026-08-01'), '2026-07-26'); // reaches back a month
assert.equal(weekStart('2026-01-01'), '2025-12-28'); // and back a year
assert.equal(weekStart('2028-03-01'), '2028-02-27'); // across a leap day

console.log('dates OK (23 checks)');
