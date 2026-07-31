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
import { calculateTotals } from './totals.ts';

// calculateTotals only reads three of a Shift's fields, but the type requires
// all of them, so this fills in the rest with throwaway values. Building the
// object by hand rather than inserting into SQLite is the whole point of
// keeping totals.ts free of database code.
function shift(minutes: number, tipsCents: number, hourlyRateCents: number): Shift {
  return {
    id: 'test-id',
    job_id: 'test-job',
    shift_date: '2026-07-30',
    minutes,
    tips_cents: tipsCents,
    hourly_rate_cents: hourlyRateCents,
    note: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  };
}

// No shifts yet is the state the app opens in, so it has to produce zeros
// rather than NaN or a crash. This is what reduce's starting value buys.
assert.deepEqual(calculateTotals([]), { minutes: 0, tipsCents: 0, grossCents: 0 });

// The easy case, where nothing needs rounding: 450 minutes is exactly 7.5
// hours, and 7.5 * $15.50 is exactly $116.25.
assert.deepEqual(calculateTotals([shift(450, 2000, 1550)]), {
  minutes: 450,
  tipsCents: 2000,
  grossCents: 13625, // 11625 wage + 2000 tips
});

// The case that actually needs a rule: 455 minutes at $15.50/hr works out to
// 11754.1666... cents, which is not a number of cents that exists.
assert.deepEqual(calculateTotals([shift(455, 0, 1550)]).grossCents, 11754);

// D5, stated as a test. Two 30-minute shifts at $15.01/hr each earn exactly
// 750.5 cents. Rounding per shift gives 751 + 751 = 1502. Rounding the sum
// instead would give 1501 -- a cent less than the sum of the two shifts. If
// someone ever "fixes" totals.ts to round once at the end, this is the line
// that fails.
assert.equal(calculateTotals([shift(30, 0, 1501), shift(30, 0, 1501)]).grossCents, 1502);

// Several shifts at different rates, which is the case a single sum-then-
// multiply can't handle at all: there is no one rate to multiply by.
const mixed = [
  shift(480, 8000, 1600), // 12800 wage + 8000 tips = 20800
  shift(305, 4250, 1725), // round(305 * 1725 / 60) = 8769 wage + 4250 = 13019
  shift(120, 1500, 1500), // 3000 wage + 1500 tips = 4500
];
assert.deepEqual(calculateTotals(mixed), {
  minutes: 905,
  tipsCents: 13750,
  grossCents: 38319,
});

// Tips are counted in gross as well as reported on their own, so the two
// numbers on screen aren't independent. Worth pinning down: gross should
// never come out below tips.
const totals = calculateTotals(mixed);
assert.ok(totals.grossCents >= totals.tipsCents);

console.log('totals OK (6 checks)');
