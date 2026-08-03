// Run from the repo root with: node src/lib/trends.test.ts
//
// No test runner for the same reason as totals.test.ts: Node and node:assert
// already cover this pure module, and the pre-commit hook runs every test file
// in src/lib/.
import assert from 'node:assert/strict';
import type { Shift } from '../data/shifts.ts';
import { calculateTrends } from './trends.ts';

function shift(
  id: string,
  jobId: string,
  shiftDate: string,
  minutes: number,
  tipsCents: number,
  hourlyRateCents: number
): Shift {
  return {
    id,
    job_id: jobId,
    shift_date: shiftDate,
    minutes,
    tips_cents: tipsCents,
    hourly_rate_cents: hourlyRateCents,
    note: null,
    created_at: `${shiftDate}T00:00:00.000Z`,
    updated_at: `${shiftDate}T00:00:00.000Z`,
  };
}

const empty = calculateTrends([]);
assert.deepEqual(empty.headline, {
  grossPerHourCents: null,
  shiftCount: 0,
  minutes: 0,
});
assert.equal(empty.weekdays.length, 7);
assert.ok(empty.weekdays.every((day) => day.grossPerHourCents === null));
assert.deepEqual(empty.months, []);
assert.deepEqual(empty.years, []);

// Job A has one one-hour and one three-hour Monday. Its time-weighted gross
// rate is $13.00/hr. Averaging the two shift rates instead would incorrectly
// produce $14.00/hr because it would give the shorter shift equal influence.
const scopedShifts = [
  shift('a-july', 'job-a', '2026-07-27', 60, 600, 1000),
  shift('a-august', 'job-a', '2026-08-03', 180, 600, 1000),
  shift('b-july', 'job-b', '2026-07-28', 60, 6000, 2000),
];
const jobATrends = calculateTrends(scopedShifts, 'job-a');
assert.deepEqual(jobATrends.headline, {
  grossPerHourCents: 1300,
  shiftCount: 2,
  minutes: 240,
});
assert.deepEqual(jobATrends.weekdays[1], {
  weekday: 'Monday',
  grossPerHourCents: 1300,
  shiftCount: 2,
  minutes: 240,
});
assert.deepEqual(jobATrends.weekdays[2], {
  weekday: 'Tuesday',
  grossPerHourCents: null,
  shiftCount: 0,
  minutes: 0,
});
assert.deepEqual(jobATrends.months, [
  {
    period: '2026-08',
    shiftCount: 1,
    minutes: 180,
    tipsCents: 600,
    grossCents: 3600,
  },
  {
    period: '2026-07',
    shiftCount: 1,
    minutes: 60,
    tipsCents: 600,
    grossCents: 1600,
  },
]);
assert.deepEqual(jobATrends.years, [
  {
    period: '2026',
    shiftCount: 2,
    minutes: 240,
    tipsCents: 1200,
    grossCents: 5200,
  },
]);

// With no job filter, the high-tip Job B shift participates everywhere. This
// pair proves the scope is applied to the whole result, not only the headline.
const allJobTrends = calculateTrends(scopedShifts);
assert.equal(allJobTrends.headline.grossPerHourCents, 2640);
assert.deepEqual(allJobTrends.weekdays[2], {
  weekday: 'Tuesday',
  grossPerHourCents: 8000,
  shiftCount: 1,
  minutes: 60,
});

// D5's rounding boundary: each half-hour shift earns 750.5 wage cents, so
// each rounds to 751 and the Monday total is 1502. Rounding after grouping
// would lose one cent and produce a $15.01/hr weekday rate.
const roundingTrends = calculateTrends([
  shift('round-1', 'job-a', '2026-07-06', 30, 0, 1501),
  shift('round-2', 'job-a', '2026-07-13', 30, 0, 1501),
]);
assert.equal(roundingTrends.headline.grossPerHourCents, 1502);
assert.equal(roundingTrends.weekdays[1].grossPerHourCents, 1502);
assert.equal(roundingTrends.months[0].grossCents, 1502);

// Month and year keys cross cleanly and stay newest first.
const boundaryTrends = calculateTrends([
  shift('december', 'job-a', '2026-12-31', 60, 100, 1000),
  shift('january', 'job-a', '2027-01-01', 120, 200, 1000),
]);
assert.deepEqual(
  boundaryTrends.months.map((month) => month.period),
  ['2027-01', '2026-12']
);
assert.deepEqual(
  boundaryTrends.years.map((year) => year.period),
  ['2027', '2026']
);

// Invalid calendar values must fail visibly rather than being filed under a
// normalized but incorrect month or weekday.
assert.throws(
  () => calculateTrends([shift('bad-date', 'job-a', '2026-02-30', 60, 0, 1000)]),
  /Invalid shift date: 2026-02-30/
);

console.log('trends OK (18 checks)');
