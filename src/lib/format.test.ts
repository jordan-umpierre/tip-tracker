// Run with: node src/lib/format.test.ts
//
// formatCents and formatHours are not tested: they produce read-only display
// text, where "does it look right" is a judgment a person makes by looking.
// The form-input helpers below feed an editable field whose contents get
// converted back and saved, so "does it survive the round trip" is a property
// with a yes-or-no answer, which is exactly the kind worth a test.
//
// formatClockSpan is display text too, but it earns a test anyway: it is the
// label that has to make a two-minute clock window obvious, and the reason it
// exists is that formatHours rendered that same span as "0.0h".
import assert from 'node:assert/strict';
import { formatClockSpan, hoursInputValue, moneyInputValue } from './format.ts';

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

// These mirror what the details screen does on submit. If that conversion ever
// changes, these have to change with it -- that coupling is the point.
const savedSeconds = (shown: string) => Math.round(parseFloat(shown) * 3600);
const savedCents = (shown: string) => Math.round(parseFloat(shown) * 100);

// The property that matters: opening any shift for editing and saving it
// without touching the hours field must store the same number of seconds.
// Every duration from one second to twenty-four hours.
for (let seconds = 1; seconds <= 24 * 60 * 60; seconds++) {
  const shown = hoursInputValue(seconds);
  assert.equal(
    savedSeconds(shown),
    seconds,
    `hoursInputValue(${seconds}) gave "${shown}", which saves as ${savedSeconds(shown)}`
  );
}

// The specific shift that exposed this: 455 minutes rendered as
// 7.583333333333333 in the edit field.
assert.equal(hoursInputValue(455 * 60), '7.5833');

// Whole and half hours shouldn't grow decimals they don't need.
assert.equal(hoursInputValue(450 * 60), '7.5');
assert.equal(hoursInputValue(30 * 60), '0.5');
assert.equal(hoursInputValue(480 * 60), '8');
assert.equal(hoursInputValue(36), '0.01');

// Same round-trip property for money, across a wide range of cent values.
for (const cents of [0, 1, 99, 100, 1501, 1550, 4275, 123456]) {
  const shown = moneyInputValue(cents);
  assert.equal(savedCents(shown), cents, `moneyInputValue(${cents}) gave "${shown}"`);
}

// Money keeps two decimals, unlike hours -- "15.50" not "15.5".
assert.equal(moneyInputValue(1550), '15.50');
assert.equal(moneyInputValue(1501), '15.01');
assert.equal(moneyInputValue(0), '0.00');

console.log('format OK (86400 round-trips + 21 checks)');
