// Run from the repo root with: node src/lib/trends.test.ts
//
// No test runner for the same reason as totals.test.ts: Node and node:assert
// already cover this pure module, and the pre-commit hook runs every test file
// in src/lib/.
import assert from 'node:assert/strict';
import type { Shift } from '../data/shifts.ts';
import { calculateTrends, calculateTrendSeries, shiftsInWindow } from './trends.ts';

function shift(
  id: string,
  jobId: string,
  shiftDate: string,
  durationSeconds: number,
  tipsCents: number,
  hourlyRateCents: number
): Shift {
  return {
    id,
    job_id: jobId,
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

const empty = calculateTrends([]);
assert.deepEqual(empty.headline, {
  grossPerHourCents: null,
  grossCents: 0,
  durationSeconds: 0,
  workedWeekCount: 0,
  grossPerWorkedWeekCents: null,
  durationPerWorkedWeekSeconds: null,
});
assert.equal(empty.weekdays.length, 7);
assert.ok(empty.weekdays.every((day) => day.grossPerHourCents === null));
assert.deepEqual(empty.months, []);
assert.deepEqual(empty.years, []);

// Job A has one one-hour and one three-hour Monday. Its time-weighted gross
// rate is $13.00/hr. Averaging the two shift rates instead would incorrectly
// produce $14.00/hr because it would give the shorter shift equal influence.
const scopedShifts = [
  shift('a-july', 'job-a', '2026-07-27', 60 * 60, 600, 1000),
  shift('a-august', 'job-a', '2026-08-03', 180 * 60, 600, 1000),
  shift('b-july', 'job-b', '2026-07-28', 60 * 60, 6000, 2000),
];
const jobATrends = calculateTrends(scopedShifts, 'job-a');
assert.deepEqual(jobATrends.headline, {
  grossPerHourCents: 1300,
  grossCents: 5200,
  durationSeconds: 240 * 60,
  workedWeekCount: 2,
  grossPerWorkedWeekCents: 2600,
  durationPerWorkedWeekSeconds: 120 * 60,
});
assert.deepEqual(jobATrends.weekdays[1], {
  weekday: 'Monday',
  grossPerHourCents: 1300,
  shiftCount: 2,
  durationSeconds: 240 * 60,
});
assert.deepEqual(jobATrends.weekdays[2], {
  weekday: 'Tuesday',
  grossPerHourCents: null,
  shiftCount: 0,
  durationSeconds: 0,
});
assert.deepEqual(jobATrends.months, [
  {
    period: '2026-08',
    shiftCount: 1,
    durationSeconds: 180 * 60,
    tipsCents: 600,
    grossCents: 3600,
  },
  {
    period: '2026-07',
    shiftCount: 1,
    durationSeconds: 60 * 60,
    tipsCents: 600,
    grossCents: 1600,
  },
]);
assert.deepEqual(jobATrends.years, [
  {
    period: '2026',
    shiftCount: 2,
    durationSeconds: 240 * 60,
    tipsCents: 1200,
    grossCents: 5200,
  },
]);

// With no job filter, the high-tip Job B shift participates everywhere. This
// pair proves the scope is applied to the whole result, not only the headline.
const allJobTrends = calculateTrends(scopedShifts);
assert.equal(allJobTrends.headline.grossPerHourCents, 2640);
assert.equal(allJobTrends.headline.workedWeekCount, 2);
assert.equal(allJobTrends.headline.grossPerWorkedWeekCents, 6600);
assert.equal(allJobTrends.headline.durationPerWorkedWeekSeconds, 150 * 60);
assert.deepEqual(allJobTrends.weekdays[2], {
  weekday: 'Tuesday',
  grossPerHourCents: 8000,
  shiftCount: 1,
  durationSeconds: 60 * 60,
});

const adjustedGross = new Map([
  ['a-july', 1800],
  ['a-august', 3900],
]);
assert.equal(calculateTrends(scopedShifts, 'job-a', adjustedGross).headline.grossCents, 5700);
assert.equal(
  calculateTrendSeries(scopedShifts, 'all', 'job-a', adjustedGross).points
    .reduce((total, point) => total + point.grossCents, 0),
  5700
);

// D5's rounding boundary: each half-hour shift earns 750.5 wage cents, so
// each rounds to 751 and the Monday total is 1502. Rounding after grouping
// would lose one cent and produce a $15.01/hr weekday rate.
const roundingTrends = calculateTrends([
  shift('round-1', 'job-a', '2026-07-06', 30 * 60, 0, 1501),
  shift('round-2', 'job-a', '2026-07-13', 30 * 60, 0, 1501),
]);
assert.equal(roundingTrends.headline.grossPerHourCents, 1502);
assert.equal(roundingTrends.headline.grossPerWorkedWeekCents, 751);
assert.equal(roundingTrends.weekdays[1].grossPerHourCents, 1502);
assert.equal(roundingTrends.months[0].grossCents, 1502);

// Weekly averages round back to the app's stored units: whole cents and whole
// seconds. Multiple shifts in one week count as one worked week.
const averageRoundingTrends = calculateTrends([
  shift('week-1-a', 'job-a', '2026-07-05', 3600, 100, 0),
  shift('week-1-b', 'job-a', '2026-07-06', 3600, 101, 0),
  shift('week-2', 'job-a', '2026-07-12', 3601, 100, 0),
]);
assert.equal(averageRoundingTrends.headline.workedWeekCount, 2);
assert.equal(averageRoundingTrends.headline.grossPerWorkedWeekCents, 151);
assert.equal(averageRoundingTrends.headline.durationPerWorkedWeekSeconds, 5401);

// Month and year keys cross cleanly and stay newest first.
const boundaryTrends = calculateTrends([
  shift('december', 'job-a', '2026-12-31', 60 * 60, 100, 1000),
  shift('january', 'job-a', '2027-01-01', 120 * 60, 200, 1000),
  shift('next-week', 'job-a', '2027-01-03', 60 * 60, 100, 1000),
]);
assert.equal(boundaryTrends.headline.workedWeekCount, 2);
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
  () => calculateTrends([shift('bad-date', 'job-a', '2026-02-30', 60 * 60, 0, 1000)]),
  /Invalid shift date: 2026-02-30/
);

// The chart anchors to the newest shift in the selected job, not the device
// clock. That matters after importing historical data. Empty days remain in
// the series so horizontal spacing still represents real calendar time.
const chartShifts = [
  shift('before-window', 'job-a', '2024-02-24', 3600, 100, 1000),
  shift('sunday-a', 'job-a', '2024-02-25', 1800, 100, 1501),
  shift('sunday-b', 'job-a', '2024-02-25', 1800, 100, 1501),
  shift('leap-day', 'job-a', '2024-02-29', 3600, 200, 1000),
  shift('saturday', 'job-a', '2024-03-02', 3600, 300, 1000),
  shift('other-job', 'job-b', '2024-03-03', 3600, 9000, 1000),
];
const weekSeries = calculateTrendSeries(chartShifts, 'week', 'job-a');
assert.equal(weekSeries.anchorDate, '2024-03-02');
assert.equal(weekSeries.bucket, 'day');
assert.deepEqual(
  weekSeries.points.map((point) => point.period),
  ['2024-02-25', '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02']
);
assert.deepEqual(weekSeries.points[0], {
  period: '2024-02-25',
  shiftCount: 2,
  durationSeconds: 3600,
  tipsCents: 200,
  grossCents: 1702,
});
assert.deepEqual(weekSeries.points[1], {
  period: '2024-02-26',
  shiftCount: 0,
  durationSeconds: 0,
  tipsCents: 0,
  grossCents: 0,
});

const monthSeries = calculateTrendSeries(chartShifts, 'month', 'job-a');
assert.equal(monthSeries.points.length, 30);
assert.equal(monthSeries.points[0].period, '2024-02-02');
assert.equal(monthSeries.points.at(-1)?.period, '2024-03-02');

const quarterSeries = calculateTrendSeries(chartShifts, 'quarter', 'job-a');
assert.equal(quarterSeries.bucket, 'week');
assert.equal(quarterSeries.points.length, 13);
assert.equal(quarterSeries.points.at(-1)?.period, '2024-02-25');
assert.equal(quarterSeries.points.at(-1)?.grossCents, 4202);

const yearSeries = calculateTrendSeries(chartShifts, 'year', 'job-a');
assert.equal(yearSeries.points.length, 12);
assert.equal(yearSeries.points[0].period, '2023-04');
assert.equal(yearSeries.points.at(-1)?.period, '2024-03');

// Year to date is the one range that does not roll backwards from the newest
// shift: it always starts at January of that shift's year, so March 2 gives
// three monthly points rather than twelve.
const ytdSeries = calculateTrendSeries(chartShifts, 'ytd', 'job-a');
assert.equal(ytdSeries.bucket, 'month');
assert.equal(ytdSeries.startDate, '2024-01-01');
assert.deepEqual(
  ytdSeries.points.map((point) => [point.period, point.grossCents]),
  [['2024-01', 0], ['2024-02', 4002], ['2024-03', 1300]]
);
// A shift logged in January leaves the window a single month wide.
assert.equal(
  calculateTrendSeries([shift('january', 'job-a', '2024-01-08', 3600, 0, 1000)], 'ytd').points.length,
  1
);

// startDate is what the chart labels the window with, so it has to line up with
// the first bucket for every range, not just the month-keyed ones.
assert.equal(weekSeries.startDate, '2024-02-25');
assert.equal(quarterSeries.startDate, quarterSeries.points[0].period);
assert.equal(yearSeries.startDate, '2023-04-01');

const allSeries = calculateTrendSeries([
  shift('all-december', 'job-a', '2022-12-31', 3600, 0, 1000),
  shift('all-february', 'job-a', '2023-02-01', 3600, 0, 1000),
], 'all');
assert.deepEqual(
  allSeries.points.map((point) => [point.period, point.grossCents]),
  [['2022-12', 1000], ['2023-01', 0], ['2023-02', 1000]]
);
// The summary card beside the chart is calculated over shiftsInWindow, so this
// has to return exactly what the series drew. Summing the series points and
// summing the returned shifts is the check that the two can never disagree --
// if they did, the card would contradict the graph directly above it.
for (const range of ['week', 'month', 'quarter', 'year', 'ytd', 'all'] as const) {
  const series = calculateTrendSeries(chartShifts, range, 'job-a');
  const windowed = shiftsInWindow(chartShifts, series);
  const seriesGross = series.points.reduce((total, point) => total + point.grossCents, 0);
  const windowGross = calculateTrends(windowed, 'job-a').headline.grossCents;
  assert.equal(windowGross, seriesGross, `${range} summary must match its chart`);
}

// The window filters on dates only; the job scope is applied afterwards by
// calculateTrends. So a window wide enough to contain the other job's shift
// returns it, and narrowing to one job is not this function's job.
assert.ok(
  shiftsInWindow(chartShifts, calculateTrendSeries(chartShifts, 'all'))
    .some((entry) => entry.job_id === 'job-b')
);
// Scoping the series to job-a moves the anchor back to that job's newest shift,
// which drops the later job-b shift out of the window on dates alone.
assert.ok(
  !shiftsInWindow(chartShifts, calculateTrendSeries(chartShifts, 'all', 'job-a'))
    .some((entry) => entry.job_id === 'job-b')
);

// No shifts means no window, and therefore nothing to summarize.
assert.deepEqual(shiftsInWindow(chartShifts, calculateTrendSeries([], 'week')), []);

assert.deepEqual(calculateTrendSeries([], 'quarter'), {
  anchorDate: null,
  startDate: null,
  bucket: 'week',
  points: [],
});
assert.throws(
  () => calculateTrendSeries([shift('bad-chart-date', 'job-a', '2026-02-30', 3600, 0, 1000)], 'all'),
  /Invalid shift date: 2026-02-30/
);

console.log('trends and chart OK');
