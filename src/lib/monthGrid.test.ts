// fallow-ignore-file unused-file -- the pre-commit hook executes this file directly.
// Run from the repo root with: node src/lib/monthGrid.test.ts
//
// No test runner, same reason as the other files here: Node and node:assert
// already cover a pure module, and the pre-commit hook runs every test file in
// src/lib/.
//
// The months below are real ones picked for their shape, not invented: a leap
// February, a month that starts exactly on Sunday and needs no padding at all,
// and one that starts on Saturday and so needs the full six rows. Those are the
// three ways a month grid goes wrong.
import assert from 'node:assert/strict';
import { buildMonthGrid, monthFromIndex, monthIndex, shiftMonth } from './monthGrid.ts';

// February 2026 starts on a Sunday and has 28 days -- the shortest a month can
// possibly lay out, four rows of content. It still comes back six rows tall,
// because a grid that changed height made the sheet grow and shrink as the
// user paged between months.
const feb2026 = buildMonthGrid(2026, 2);
assert.equal(feb2026.length, 42, 'the shortest possible month is still six rows');
assert.deepEqual(feb2026[0], { day: 1, date: '2026-02-01' }, 'no leading blank');
assert.deepEqual(feb2026[27], { day: 28, date: '2026-02-28' }, 'the 28th ends the content');
assert.deepEqual(
  feb2026.slice(28),
  new Array(14).fill(null),
  'the two unused rows are blank, not days from March'
);

// August 2026 starts on a Saturday with 31 days: the longest layout, and the
// reason six is the number.
const aug2026 = buildMonthGrid(2026, 8);
assert.equal(aug2026.length, 42, 'the longest possible month still fits six rows');
assert.deepEqual(aug2026.slice(0, 6), [null, null, null, null, null, null], 'six leading blanks');
assert.deepEqual(aug2026[6], { day: 1, date: '2026-08-01' }, 'the 1st lands in the Saturday column');
assert.deepEqual(aug2026[36], { day: 31, date: '2026-08-31' }, 'the 31st is the last filled cell');
assert.deepEqual(aug2026.slice(37), new Array(5).fill(null), 'trailing blanks pad the last row');

// Leap year. Nothing in buildMonthGrid knows what a leap year is -- day 0 of
// March is asked for instead -- so this asserts that shortcut actually holds.
assert.equal(
  buildMonthGrid(2024, 2).filter((cell) => cell !== null).length,
  29,
  'February 2024 has 29 days'
);
assert.equal(
  buildMonthGrid(2026, 2).filter((cell) => cell !== null).length,
  28,
  'February 2026 has 28 days'
);
// 2100 is divisible by 4 but not a leap year, which is the rule a hand-written
// leap check usually gets wrong.
assert.equal(
  buildMonthGrid(2100, 2).filter((cell) => cell !== null).length,
  28,
  'February 2100 is not a leap year despite dividing by four'
);

// Every month of a full year comes back identically sized. This is the check
// that would catch the sheet changing height again, and it is worth running
// across a whole year rather than the two months picked above -- 2026 alone
// covers months starting on five different weekdays.
for (let month = 1; month <= 12; month += 1) {
  const grid = buildMonthGrid(2026, month);
  assert.equal(grid.length, 42, `month ${month} is six rows like every other month`);
}
// A leap February is the one that could overflow six rows if the padding were
// ever changed to grow instead of pad. 2032 starts February on a Sunday with 29
// days, the longest February layout there is.
assert.equal(buildMonthGrid(2032, 2).length, 42, 'a 29-day February still fits six rows');

// Single-digit months and days have to pad, since these strings are compared
// against shift_date values stored as YYYY-MM-DD.
assert.deepEqual(
  buildMonthGrid(2026, 1)[4],
  { day: 1, date: '2026-01-01' },
  'January pads its month and day to two digits'
);

// Month stepping, including the two year boundaries.
assert.deepEqual(shiftMonth(2026, 8, 1), { year: 2026, month: 9 }, 'forward within a year');
assert.deepEqual(shiftMonth(2026, 8, -1), { year: 2026, month: 7 }, 'back within a year');
assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 }, 'December rolls into January');
assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 }, 'January rolls back to December');



// Month indices. The picker positions each month by one of these, so the two
// directions have to be exact inverses or a pane lands a month off.
assert.equal(monthIndex(2026, 1) + 1, monthIndex(2026, 2), 'consecutive months are one apart');
assert.equal(
  monthIndex(2027, 1) - monthIndex(2026, 12),
  1,
  'December to January crosses a year by one'
);
assert.equal(
  monthIndex(2026, 8) - monthIndex(2025, 8),
  12,
  'the same month a year apart is twelve'
);

// Round-tripping every month of a decade, since an off-by-one here shows up as
// the calendar quietly displaying the wrong month.
for (let year = 2020; year <= 2030; year += 1) {
  for (let month = 1; month <= 12; month += 1) {
    assert.deepEqual(
      monthFromIndex(monthIndex(year, month)),
      { year, month },
      `${year}-${month} survives a round trip`
    );
  }
}

// shiftMonth and monthIndex have to agree, since the picker uses one to render
// and the other to position.
assert.deepEqual(
  monthFromIndex(monthIndex(2026, 12) + 1),
  shiftMonth(2026, 12, 1),
  'stepping by index matches stepping by month'
);

console.log('month grid OK (168 checks)');
