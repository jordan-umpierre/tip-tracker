// Turning the database's integer cents and integer minutes into strings a
// person reads. Split out once ShiftTotals became the third place doing it --
// ShiftList was already formatting money in two spots, and three copies of
// "divide by 100 and hope everyone picked the same number of decimals" is how
// two screens end up disagreeing about what $1,234.50 looks like.
//
// Deliberately the only place a raw cents value becomes a string. Nothing
// upstream of this formats money: totals.ts returns integers, and the
// components call these.

// Intl.NumberFormat is built into the JavaScript engine -- no dependency, and
// it handles the parts hand-rolled formatting gets wrong: the thousands
// separator, always two decimal places, the currency symbol's position. A
// year of shifts reads as $48,250.00 rather than $48250.00.
//
// Built once at module load rather than inside the function. Constructing a
// formatter is the expensive part; formatting with an existing one is cheap,
// and this gets called for every row in the list on every render.
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Money is stored as integer cents everywhere (see the data conventions in
// CLAUDE.md), so the divide-by-100 lives here and nowhere else.
export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

// Durations are stored as integer minutes. One decimal place is enough to
// tell 7.5 hours from 7.6 without pretending to a precision that would just
// be noise on a shift log.
export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}
