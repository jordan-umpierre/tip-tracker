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

// --- Values for editable form fields ---------------------------------------
//
// Different job from the two above, and the difference matters. Those produce
// text a person only reads, so any precision that looks right is right. These
// produce the starting contents of an input the user can edit and save back,
// which means whatever comes out has to survive the trip home: LogShiftForm
// saves with Math.round(value * 60) for hours and Math.round(value * 100) for
// money, so a number that doesn't convert back to the same integer silently
// rewrites the shift the moment someone opens it and presses save.

// Two decimals, per D6. Not one -- matching formatHours above would turn a
// 455-minute shift into "7.6", which saves as 456 minutes, and a one-minute
// shift into "0.0", which saves as zero and fails a CHECK constraint. Two
// decimals converts back to the identical minute count for every duration
// from one minute to a full day; format.test.ts checks all 1440 of them.
//
// Trailing zeros come off because "7.5" reads better than "7.50" in an input
// box, and dropping them cannot change the number's value.
export function hoursInputValue(minutes: number): string {
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, '');
}

// Money keeps its trailing zeros: a rate field showing "15.5" looks like an
// unfinished edit, while "15.50" reads as a deliberate amount. Cents divided
// by 100 never needs more than two decimals, so this is exact rather than
// rounded, and it converts back to the same cent count by construction.
export function moneyInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}
