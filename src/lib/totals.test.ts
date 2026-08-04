// fallow-ignore-file unused-file -- the pre-commit hook executes this file directly.
// Run from the repo root with: node src/lib/totals.test.ts
//
// No test framework, on purpose. Node runs TypeScript directly now (it strips
// the types and executes the rest), and node:assert is in the standard
// library, so a money-math check costs zero dependencies. Add a real runner
// when there's enough here to need one -- test names, filtering, watch mode --
// not before.
//
// The pre-commit hook runs this, same as scripts/test-schema.sh. A check
// nothing runs stops being true without anyone noticing.
import assert from 'node:assert/strict';
import type { Shift } from '../data/shifts.ts';
import { calculateShiftGrossCents } from './totals.ts';

// calculateShiftGrossCents only reads three of a Shift's fields, but the type
// requires all of them, so this fills in the rest with throwaway values.
// Building the object by hand rather than inserting into SQLite is the whole
// point of keeping totals.ts free of database code.
function shift(durationSeconds: number, tipsCents: number, hourlyRateCents: number): Shift {
  return {
    id: 'test-id',
    job_id: 'test-job',
    shift_date: '2026-07-30',
    start_time: null,
    end_time: null,
    duration_seconds: durationSeconds,
    tips_cents: tipsCents,
    hourly_rate_cents: hourlyRateCents,
    note: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  };
}

// A shift that earned nothing is a real measurement, not a missing one, so it
// has to produce zero rather than NaN.
assert.equal(calculateShiftGrossCents(shift(0, 0, 0)), 0);

// The easy case, where nothing needs rounding: 450 minutes is exactly 7.5
// hours, and 7.5 * $15.50 is exactly $116.25, plus $20.00 of tips.
assert.equal(calculateShiftGrossCents(shift(450 * 60, 2000, 1550)), 13625);

// The case that actually needs a rule: 455 minutes at $15.50/hr works out to
// 11754.1666... cents, which is not a number of cents that exists.
assert.equal(calculateShiftGrossCents(shift(455 * 60, 0, 1550)), 11754);
assert.equal(calculateShiftGrossCents(shift(455 * 60, 2000, 1550)), 13754);

// D5, stated as a test. A 30-minute shift at $15.01/hr earns exactly 750.5
// cents, and rounding happens per shift, before anything sums them -- so two
// of them come to 1502. Rounding a summed 1501 instead would be a cent short.
// Every caller that groups shifts (Trends, the Log's month and week headers)
// depends on this being the only place rounding happens.
const halfCentShift = calculateShiftGrossCents(shift(30 * 60, 0, 1501));
assert.equal(halfCentShift, 751);
assert.equal(halfCentShift * 2, 1502);

// Several shifts at different rates, which is the case a single sum-then-
// multiply can't handle at all: there is no one rate to multiply by.
const mixed = [
  shift(480 * 60, 8000, 1600), // 12800 wage + 8000 tips = 20800
  shift(305 * 60, 4250, 1725), // round(18300 * 1725 / 3600) = 8769 + 4250
  shift(120 * 60, 1500, 1500), // 3000 wage + 1500 tips = 4500
];
assert.deepEqual(mixed.map(calculateShiftGrossCents), [20800, 13019, 4500]);

// Tips are counted in gross, so gross can never come out below them.
assert.ok(mixed.every((entry) => calculateShiftGrossCents(entry) >= entry.tips_cents));

console.log('totals OK (9 checks)');
