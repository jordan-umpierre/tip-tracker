// Run from the repo root with: node src/lib/overtime.test.ts
import assert from 'node:assert/strict';
import type { Job } from '../data/jobs.ts';
import type { Shift } from '../data/shifts.ts';
import { calculateEstimatedGrossByShift, calculateOvertime, overtimeScope } from './overtime.ts';

const HOUR = 60 * 60;

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-a',
    name: 'Driver',
    hourly_rate_cents: 1000,
    overtime_enabled: 1,
    workweek_start_weekday: 0,
    workweek_start_time: '00:00',
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function shift(
  id: string,
  shiftDate: string,
  durationSeconds: number,
  hourlyRateCents = 1000,
  startTime: string | null = null,
  endTime: string | null = null,
  jobId = 'job-a'
): Shift {
  return {
    id,
    job_id: jobId,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
    tips_cents: 0,
    hourly_rate_cents: hourlyRateCents,
    note: null,
    created_at: `${shiftDate}T00:00:00.000Z`,
    updated_at: `${shiftDate}T00:00:00.000Z`,
  };
}

assert.deepEqual(calculateOvertime([], job()), []);

// Overtime is opt-in. A disabled job returns the same per-shift gross and no
// premium even when the logged week exceeds 40 hours.
const disabled = calculateOvertime(
  [shift('disabled', '2026-08-02', 41 * HOUR)],
  job({ overtime_enabled: 0 })
);
assert.deepEqual(disabled, [
  { shiftId: 'disabled', regularSeconds: 41 * HOUR, overtimeSeconds: 0, estimatedGrossCents: 41000 },
]);

// The 41st hour is overtime. Its straight-time $10 remains, then the extra
// half-rate adds $5, producing $415 for the week instead of $410.
const basic = calculateOvertime(
  [
    // listShifts returns newest first. The calculator still has to decide
    // overtime from chronological work, not from the caller's array order.
    shift('hour-41', '2026-08-03', HOUR),
    shift('first-40', '2026-08-02', 40 * HOUR),
    shift('other-job', '2026-08-03', 100 * HOUR, 5000, null, null, 'job-b'),
  ],
  job()
);
assert.deepEqual(basic, [
  { shiftId: 'hour-41', regularSeconds: 0, overtimeSeconds: HOUR, estimatedGrossCents: 1500 },
  { shiftId: 'first-40', regularSeconds: 40 * HOUR, overtimeSeconds: 0, estimatedGrossCents: 40000 },
]);

// A threshold can land inside one shift, and that shift keeps its own rate.
const splitThreshold = calculateOvertime(
  [
    shift('first-39', '2026-08-02', 39 * HOUR),
    shift('split', '2026-08-03', 2 * HOUR, 1200),
  ],
  job()
);
assert.deepEqual(splitThreshold[1], {
  shiftId: 'split',
  regularSeconds: HOUR,
  overtimeSeconds: HOUR,
  estimatedGrossCents: 3000,
});

// A new configured workweek resets the 40-hour counter.
const separateWeeks = calculateOvertime(
  [
    shift('saturday', '2026-08-08', 40 * HOUR),
    shift('sunday', '2026-08-09', 2 * HOUR),
  ],
  job()
);
assert.equal(separateWeeks[1].overtimeSeconds, 0);

// Wednesday at 06:00 is a real boundary, not a calendar-week label. One paid
// hour of the 05:00-07:00 shift belongs to each side. The old week already has
// 40 hours, so only the first half of this shift earns the premium.
const priorWeek = [
  shift('thursday', '2026-07-30', 10 * HOUR, 1000, '08:00', '18:00'),
  shift('friday', '2026-07-31', 10 * HOUR, 1000, '08:00', '18:00'),
  shift('saturday', '2026-08-01', 10 * HOUR, 1000, '08:00', '18:00'),
  shift('sunday', '2026-08-02', 10 * HOUR, 1000, '08:00', '18:00'),
];
const customBoundary = calculateOvertime(
  [...priorWeek, shift('boundary', '2026-08-05', 2 * HOUR, 1000, '05:00', '07:00')],
  job({ workweek_start_weekday: 3, workweek_start_time: '06:00' })
);
assert.deepEqual(customBoundary[4], {
  shiftId: 'boundary',
  regularSeconds: HOUR,
  overtimeSeconds: HOUR,
  estimatedGrossCents: 2500,
});

// Paid duration remains authoritative when a break makes it shorter than the
// clock span. The 90 minutes are divided 45/45 across the same boundary.
const breakAcrossBoundary = calculateOvertime(
  [
    ...priorWeek,
    shift('break', '2026-08-05', 90 * 60, 1000, '05:00', '07:00'),
  ],
  job({ workweek_start_weekday: 3, workweek_start_time: '06:00' })
);
assert.equal(breakAcrossBoundary[4].regularSeconds, 45 * 60);
assert.equal(breakAcrossBoundary[4].overtimeSeconds, 45 * 60);

// With no times, Wednesday belongs wholly to the Wednesday-starting week. The
// configured 06:00 cannot be applied to history that never recorded an hour.
const untimedApproximation = calculateOvertime(
  [
    shift('old-week', '2026-08-04', 40 * HOUR, 1000, '08:00', '18:00'),
    shift('untimed', '2026-08-05', 2 * HOUR),
  ],
  job({ workweek_start_weekday: 3, workweek_start_time: '06:00' })
);
assert.equal(untimedApproximation[1].overtimeSeconds, 0);

assert.throws(
  () => calculateOvertime([shift('bad-date', '2026-02-30', HOUR)], job()),
  /Invalid shift date: 2026-02-30/
);

// The screen overlay calculates each employer independently and leaves a
// missing job on recorded gross rather than dropping or crashing the shift.
const displayedGross = calculateEstimatedGrossByShift(
  [
    shift('job-a-40', '2026-08-02', 40 * HOUR),
    shift('job-a-41', '2026-08-03', HOUR),
    shift('job-b-one', '2026-08-03', HOUR, 1000, null, null, 'job-b'),
    shift('orphan', '2026-08-03', HOUR, 1000, null, null, 'missing-job'),
  ],
  [job(), job({ id: 'job-b' })]
);
assert.equal(displayedGross.get('job-a-41'), 1500);
assert.equal(displayedGross.get('job-b-one'), 1000);
assert.equal(displayedGross.get('orphan'), 1000);

// Any mixed scope containing a configured job is estimated. A selected
// unconfigured job is not, and the untimed warning follows only applicable
// configured shifts.
const scopeJobs = [job(), job({ id: 'job-b', overtime_enabled: 0 })];
assert.deepEqual(
  overtimeScope([shift('old-a', '2026-08-03', HOUR)], scopeJobs, null),
  { estimated: true, hasUntimedEstimate: true }
);
assert.deepEqual(
  overtimeScope([shift('old-b', '2026-08-03', HOUR, 1000, null, null, 'job-b')], scopeJobs, 'job-b'),
  { estimated: false, hasUntimedEstimate: false }
);

console.log('overtime OK (15 checks)');
