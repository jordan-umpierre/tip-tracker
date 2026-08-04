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
//
// This file used to also export calculateTotals, which summed a whole shift
// array for the Log screen's lifetime totals strip. That strip was removed on
// 2026-08-03 as duplicating Trends, and nothing else called it.
//
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
