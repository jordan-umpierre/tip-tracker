// fallow-ignore-file unused-file -- the pre-commit hook executes this file directly.
// Run from the repo root with: node src/lib/shiftGroups.test.ts
//
// No test runner, same reason as the other files here: Node and node:assert
// already cover a pure module, and the pre-commit hook runs every test file in
// src/lib/.
import assert from 'node:assert/strict';
import type { Shift } from '../data/shifts.ts';
import { flattenShifts, groupShifts } from './shiftGroups.ts';

function shift(
  id: string,
  shiftDate: string,
  durationSeconds: number,
  tipsCents: number,
  hourlyRateCents: number
): Shift {
  return {
    id,
    job_id: 'job-a',
    shift_date: shiftDate,
    duration_seconds: durationSeconds,
    tips_cents: tipsCents,
    hourly_rate_cents: hourlyRateCents,
    note: null,
    created_at: `${shiftDate}T00:00:00.000Z`,
    updated_at: `${shiftDate}T00:00:00.000Z`,
  };
}

assert.deepEqual(groupShifts([]), []);
assert.deepEqual(flattenShifts([], {}), []);

// Deliberately out of order and spanning a year boundary, because the screen
// relies on this function for display order rather than on the query's.
const grouped = groupShifts([
  shift('mid-january', '2026-01-15', 3600, 500, 1000),
  shift('new-years-eve', '2025-12-31', 3600, 200, 1000),
  shift('late-january', '2026-01-31', 1800, 100, 1501),
  shift('early-january', '2026-01-02', 3600, 0, 1000),
]);

// January: 1500 + 851 (750.5 rounds up to 751 per D5) + 1000.
assert.deepEqual(
  grouped.map((year) => [year.period, year.shiftCount, year.grossCents]),
  [['2026', 3, 3351], ['2025', 1, 1200]]
);
assert.deepEqual(
  grouped[0].months.map((month) => [month.period, month.shiftCount, month.grossCents]),
  [['2026-01', 3, 3351]]
);
// Jan 31 2026 is a Saturday in the week starting Jan 25; Jan 15 is in the week
// starting Jan 11; Jan 2 is in the week starting Dec 28 2025. Newest first.
assert.deepEqual(
  grouped[0].months[0].weeks.map((week) => [week.period, week.shiftCount]),
  [['2026-01-25', 1], ['2026-01-11', 1], ['2025-12-28', 1]]
);

// A week straddling a month boundary belongs to both months, holding only that
// month's shifts in each, so a month's rows always add up to its own header.
// Both halves share a week start but get distinct keys so collapsing one leaves
// the other alone.
const straddling = groupShifts([
  shift('sat-august', '2026-08-01', 3600, 0, 1000),
  shift('fri-july', '2026-07-31', 3600, 0, 1000),
]);
const [august, july] = straddling[0].months;
assert.deepEqual([august.period, july.period], ['2026-08', '2026-07']);
assert.equal(august.weeks.length, 1);
assert.equal(july.weeks.length, 1);
assert.equal(august.weeks[0].period, july.weeks[0].period);
assert.notEqual(august.weeks[0].key, july.weeks[0].key);
assert.equal(august.grossCents, august.weeks[0].grossCents);

// Untouched, the newest year, month, and week are open and everything else is
// one row tall, so recent shifts need no taps.
assert.deepEqual(
  flattenShifts(grouped, {}).map((row) => [row.kind, row.key]),
  [
    ['year', '2026'],
    ['month', '2026-01'],
    ['week', '2026-01:2026-01-25'],
    ['shift', 'late-january'],
    ['week', '2026-01:2026-01-11'],
    ['week', '2026-01:2025-12-28'],
    ['year', '2025'],
  ]
);

// Collapsing a year hides everything under it, including groups the default
// would have opened.
assert.deepEqual(
  flattenShifts(grouped, { '2026': false }).map((row) => row.key),
  ['2026', '2025']
);

// Expanding an older group opens it without closing the newest one.
const expandedOlder = flattenShifts(grouped, {
  '2026-01:2026-01-11': true,
  '2025': true,
}).map((row) => row.key);
assert.ok(expandedOlder.includes('mid-january'));
assert.ok(expandedOlder.includes('late-january'));
assert.ok(expandedOlder.includes('new-years-eve'));

assert.throws(
  () => groupShifts([shift('bad-date', '2026-02-30', 3600, 0, 1000)]),
  /Invalid shift date: 2026-02-30/
);

console.log('shift groups OK');
