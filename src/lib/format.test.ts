// Run with: node src/lib/format.test.ts
//
// formatCents and formatHours are not tested: they produce read-only display
// text, where "does it look right" is a judgment a person makes by looking.
// The form-input helpers below feed editable fields. Their full save round trip
// is covered through parseShiftDetailsInput in shiftDetails.test.ts.
//
// formatClockSpan is display text too, but it earns a test anyway: it is the
// label that has to make a two-minute clock window obvious, and the reason it
// exists is that formatHours rendered that same span as "0.0h".
import assert from 'node:assert/strict';
import { formatClockSpan, formatLongDate, hoursInputValue, moneyInputValue } from './format.ts';

// The span the user actually hit: 4:08 PM to 4:10 PM read as zero hours, so an
// entered 8 looked like it agreed with the times.
assert.equal(formatClockSpan(120), '2m');
assert.equal(formatClockSpan(0), '0m');
assert.equal(formatClockSpan(59), '1m');
assert.equal(formatClockSpan(3600), '1h');
assert.equal(formatClockSpan(3660), '1h 1m');
assert.equal(formatClockSpan(27000), '7h 30m');
// Rounds to the nearest minute rather than truncating, so 89 seconds is not
// reported as one minute when it is nearer two.
assert.equal(formatClockSpan(89), '1m');
assert.equal(formatClockSpan(90), '2m');
// An overnight span, which durationSecondsBetween wraps for.
assert.equal(formatClockSpan(8 * 3600), '8h');

// The specific shift that exposed this: 455 minutes rendered as
// 7.583333333333333 in the edit field.
assert.equal(hoursInputValue(455 * 60), '7.5833');

// Whole and half hours shouldn't grow decimals they don't need.
assert.equal(hoursInputValue(450 * 60), '7.5');
assert.equal(hoursInputValue(30 * 60), '0.5');
assert.equal(hoursInputValue(480 * 60), '8');
assert.equal(hoursInputValue(36), '0.01');

// Money keeps two decimals, unlike hours -- "15.50" not "15.5".
assert.equal(moneyInputValue(1550), '15.50');
assert.equal(moneyInputValue(1501), '15.01');
assert.equal(moneyInputValue(0), '0.00');

assert.equal(formatLongDate('2026-08-10'), 'August 10, 2026');
assert.equal(formatLongDate('not-a-date'), 'not-a-date');

console.log('format OK');
