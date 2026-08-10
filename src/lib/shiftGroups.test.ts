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
    start_time: null,
    end_time: null,
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
// A month holds its shifts directly, newest first, whatever order they arrived
// in. The query already returns them sorted, which is exactly why this asserts
// it here instead of trusting it.
assert.deepEqual(
  grouped[0].months[0].shifts.map((entry) => entry.id),
  ['late-january', 'mid-january', 'early-january']
);

// Consecutive days either side of a month boundary land in their own months.
// This used to be the awkward case -- one calendar week appeared under both
// months with two keys so the halves could collapse separately -- and dropping
// the week level is what removed it.
const straddling = groupShifts([
  shift('sat-august', '2026-08-01', 3600, 0, 1000),
  shift('fri-july', '2026-07-31', 3600, 0, 1000),
]);
const [august, july] = straddling[0].months;
assert.deepEqual([august.period, july.period], ['2026-08', '2026-07']);
assert.deepEqual([august.shiftCount, july.shiftCount], [1, 1]);
assert.equal(august.grossCents, 1000);

// Display-only overtime values flow into every collapsed subtotal without
// changing the stored Shift, and a mixed group is labeled estimated.
const estimated = groupShifts(
  [
    shift('recorded', '2026-08-01', 3600, 0, 1000),
    shift('adjusted', '2026-08-02', 3600, 0, 1000),
  ],
  new Map([['adjusted', 1500]]),
  new Set(['job-a'])
);
assert.equal(estimated[0].grossCents, 2500);
assert.equal(estimated[0].estimated, true);

// Untouched, everything is shut: one row per year and nothing else, however
// many shifts are underneath.
assert.deepEqual(
  flattenShifts(grouped, {}).map((row) => [row.kind, row.key]),
  [['year', '2026'], ['year', '2025']]
);

// Opening a group reveals its children shut, one level at a time.
assert.deepEqual(
  flattenShifts(grouped, { '2026': true }).map((row) => row.key),
  ['2026', '2026-01', '2025']
);
// Opening the month reveals every shift in it. Two taps from a cold open, and
// there is no third level between the month and the rows.
assert.deepEqual(
  flattenShifts(grouped, { '2026': true, '2026-01': true }).map((row) => row.key),
  ['2026', '2026-01', 'late-january', 'mid-january', 'early-january', '2025']
);

// An open month inside a shut year stays hidden rather than leaking its rows.
assert.deepEqual(
  flattenShifts(grouped, { '2026-01': true }).map((row) => row.key),
  ['2026', '2025']
);

// Two branches can be open at once; opening one does not close another.
const twoOpen = flattenShifts(grouped, { '2026': true, '2025': true }).map((row) => row.key);
assert.ok(twoOpen.includes('2026-01'));
assert.ok(twoOpen.includes('2025-12'));

assert.throws(
  () => groupShifts([shift('bad-date', '2026-02-30', 3600, 0, 1000)]),
  /Invalid shift date: 2026-02-30/
);

console.log('shift groups OK');
