// fallow-ignore-file unused-file -- the pre-commit hook executes this file directly.
// Run from the repo root with: node src/lib/shiftGroups.test.ts
//
// No test runner, same reason as the other files here: Node and node:assert
// already cover a pure module, and the pre-commit hook runs every test file in
// src/lib/.
import assert from 'node:assert/strict';
import type { Shift } from '../data/shifts.ts';
import { groupShiftsByMonth } from './shiftGroups.ts';

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

assert.deepEqual(groupShiftsByMonth([]), []);

// Deliberately out of order, and spanning a year boundary, because the screen
// relies on this function for the order it displays rather than on the query.
const grouped = groupShiftsByMonth([
  shift('mid-january', '2026-01-15', 3600, 500, 1000),
  shift('new-years-eve', '2025-12-31', 3600, 200, 1000),
  shift('late-january', '2026-01-31', 1800, 100, 1501),
  shift('early-january', '2026-01-02', 3600, 0, 1000),
]);

assert.deepEqual(
  grouped.map((month) => [month.period, month.shiftCount, month.grossCents]),
  [
    // January: 1500 + 851 (750.5 rounds up to 751 per D5) + 1000.
    ['2026-01', 3, 3351],
    ['2025-12', 1, 1200],
  ]
);
assert.deepEqual(
  grouped[0].shifts.map((entry) => entry.id),
  ['late-january', 'mid-january', 'early-january']
);

// A month with no shifts never appears. Trends fills empty periods so the chart
// keeps its calendar spacing; a list has nothing to space, and an empty header
// would just be a row that says nothing happened.
assert.equal(
  groupShiftsByMonth([shift('only', '2026-03-01', 3600, 0, 1000)]).length,
  1
);

console.log('shift groups OK');
