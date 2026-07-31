// Run with: node src/lib/format.test.ts
//
// Only the form-input helpers are tested here. formatCents and formatHours
// produce read-only display text, where "does it look right" is a judgment a
// person makes by looking. These two feed an editable field whose contents get
// converted back and saved, so "does it survive the round trip" is a property
// with a yes-or-no answer, which is exactly the kind worth a test.
import assert from 'node:assert/strict';
import { hoursInputValue, moneyInputValue } from './format.ts';

// These mirror what LogShiftForm does on submit. If that conversion ever
// changes, these have to change with it -- that coupling is the point.
const savedMinutes = (shown: string) => Math.round(parseFloat(shown) * 60);
const savedCents = (shown: string) => Math.round(parseFloat(shown) * 100);

// The property that matters: opening any shift for editing and saving it
// without touching the hours field must store the same number of minutes.
// Every duration from one minute to twenty-four hours.
for (let minutes = 1; minutes <= 24 * 60; minutes++) {
  const shown = hoursInputValue(minutes);
  assert.equal(
    savedMinutes(shown),
    minutes,
    `hoursInputValue(${minutes}) gave "${shown}", which saves as ${savedMinutes(shown)}`
  );
}

// The specific shift that exposed this: 455 minutes rendered as
// 7.583333333333333 in the edit field.
assert.equal(hoursInputValue(455), '7.58');

// Whole and half hours shouldn't grow decimals they don't need.
assert.equal(hoursInputValue(450), '7.5');
assert.equal(hoursInputValue(30), '0.5');
assert.equal(hoursInputValue(480), '8');

// Same round-trip property for money, across a wide range of cent values.
for (const cents of [0, 1, 99, 100, 1501, 1550, 4275, 123456]) {
  const shown = moneyInputValue(cents);
  assert.equal(savedCents(shown), cents, `moneyInputValue(${cents}) gave "${shown}"`);
}

// Money keeps two decimals, unlike hours -- "15.50" not "15.5".
assert.equal(moneyInputValue(1550), '15.50');
assert.equal(moneyInputValue(1501), '15.01');
assert.equal(moneyInputValue(0), '0.00');

console.log('format OK (1440 round-trips + 11 checks)');
