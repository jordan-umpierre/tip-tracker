// Derived numbers from shifts. Pure arithmetic -- no SQLite, no async, no
// React. Kept out of shifts.ts (which is entirely database access) so the
// money math can be run and tested without a database or a device, which is
// what totals.test.ts does.
//
// "import type" rather than a plain import on purpose: it tells both
// TypeScript and Node that only the shape is needed, never the module itself
// at runtime. Node strips the line out entirely, so running this file doesn't
// try to load shifts.ts and, through it, expo-sqlite -- which would fail
// outside the app.
import type { Shift } from '../data/shifts';

// Same units the database uses: integer seconds and integer cents. Nothing
// here formats anything into a string. Display is format.ts's job, which
// keeps this file's output easy to assert on ("11625", not "$116.25").
export type ShiftTotals = {
  durationSeconds: number;
  tipsCents: number;
  grossCents: number;
};

// One shift is the smallest earnings record. Keeping its gross calculation
// here gives totals and Trends one definition to share instead of copying
// money math into each feature.
export function calculateShiftGrossCents(shift: Shift): number {
  // D5 rounds wages for each shift before anything groups those shifts. Tips
  // are already whole cents, so they can be added after that one rounding.
  return (
    shift.tips_cents +
    Math.round((shift.duration_seconds * shift.hourly_rate_cents) / 3600)
  );
}

export function calculateTotals(shifts: Shift[]): ShiftTotals {
  // reduce walks the array once and carries a running value along -- the
  // same job as a for loop with a `let totals` above it, minus the
  // bookkeeping. Whatever the function returns becomes the running value for
  // the next shift.
  return shifts.reduce(
    (totals, shift) => ({
      // A new object every pass rather than editing the old one. Same habit
      // as not mutating props: building a new value is easier to follow than
      // tracking what changed where.
      durationSeconds: totals.durationSeconds + shift.duration_seconds,
      tipsCents: totals.tipsCents + shift.tips_cents,

      // Gross for one shift is its tips plus the wage it earned, and the
      // wage almost never divides evenly into whole cents -- 27,300 seconds at
      // $15.50/hr is 11754.166... cents. D5 is why the rounding happens here,
      // per shift, instead of once after several shifts have been grouped:
      // every total then uses the same definition of one shift's gross.
      //
      // Multiply first, divide last. Both orders usually agree, but staying
      // on integers through the multiplication is the habit that keeps money
      // math from drifting.
      grossCents: totals.grossCents + calculateShiftGrossCents(shift),
    }),
    // The starting value, and the reason an empty shifts array needs no
    // special case above -- it returns exactly this, which is the right
    // answer for "nothing logged yet".
    { durationSeconds: 0, tipsCents: 0, grossCents: 0 }
  );
}
