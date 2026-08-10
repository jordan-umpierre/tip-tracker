// Run from the repo root with: node src/lib/csvColumnMapping.test.ts
//
// Column detection is a guess, and this is where the guess gets pinned. The
// header lines below are copied verbatim from the real exports in fake-data/,
// which is gitignored -- reading those files here would pass on the laptop
// that has them and fail on a fresh clone. A header line is the whole input to
// detection anyway, so copying it loses nothing.
import assert from 'node:assert/strict';
import { describeMapping, detectShiftCsvMapping, normalizeHeader } from './csvColumnMapping.ts';

function headers(line: string): string[] {
  return line.split(',');
}

function mappingFor(line: string) {
  const { mapping } = detectShiftCsvMapping(headers(line));
  assert.ok(mapping, `expected a mapping for: ${line}`);
  return mapping;
}

// Naming style is not information. These three spellings of the same column
// have to collapse to one comparable string, which is what lets a single alias
// list cover every export instead of one entry per spelling.
assert.equal(normalizeHeader('Hourly Wage'), 'hourly wage');
assert.equal(normalizeHeader('hourly_wage'), 'hourly wage');
assert.equal(normalizeHeader('  HOURLY-WAGE  '), 'hourly wage');
assert.equal(normalizeHeader('Clock In'), 'clock in');

// The app's own nine-column contract still maps to itself. This is the
// regression that matters most: files that imported before must keep working.
const own = mappingFor('Date,Wage,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time,End Time');
assert.equal(own.date, 'Date');
assert.equal(own.wage, 'Wage');
assert.equal(own.hours.length, 1);
assert.equal(own.hours[0], 'Hours');
// Cash and credit are two halves of one number, and always were -- the old
// parser added them together too. Now that summing is the general rule, the
// pair is expressed as a mapping instead of a special case in the row parser.
assert.deepEqual(own.tips, ['Cash Tips', 'Credit Tips']);
assert.equal(own.dailyIncome, 'Daily Income');
assert.equal(own.startTime, 'Start Time');
assert.equal(own.endTime, 'End Time');

// snake_case export. Every value present, nothing summed.
const snake = mappingFor('shift_date,clock_in,clock_out,hours_worked,hourly_wage,tips,gross_pay,notes');
assert.equal(snake.date, 'shift_date');
assert.equal(snake.wage, 'hourly_wage');
assert.deepEqual(snake.hours, ['hours_worked']);
assert.deepEqual(snake.tips, ['tips']);
assert.equal(snake.startTime, 'clock_in');
assert.equal(snake.endTime, 'clock_out');
assert.equal(snake.dailyIncome, 'gross_pay');
assert.equal(snake.note, 'notes');

// The driving export, and the reason parts beat a whole column.
//
// It carries "Hours Worked", "Regular Hours", and "Overtime Hours" at once.
// "Hours Worked" is blank on every row that has clock times, while regular and
// overtime are filled on all 624 rows and sum to the same number wherever both
// appear. Taking the summary column would silently drop half the file.
const driving = mappingFor(
  'Date,Day,Clock In,Clock Out,Hours Worked,Regular Hours,Overtime Hours,Hourly Wage,Tips,Total Pay,Notes'
);
assert.deepEqual(driving.hours, ['Regular Hours', 'Overtime Hours']);
assert.deepEqual(driving.tips, ['Tips']);
assert.equal(driving.wage, 'Hourly Wage');
assert.equal(driving.dailyIncome, 'Total Pay');

// "Day" spells out the weekday and means nothing to the importer. Columns no
// alias claims are ignored rather than making the file unreadable, which is
// what the old fixed nine-column header did.
assert.ok(!Object.values(driving).flat().includes('Day'));

// The shift-lead export has no tips column at all, because that job does not
// earn any. Refusing a real export of real work would be wrong, so it maps and
// the absence is stated instead.
const noTips = mappingFor(
  'Date,Day,Clock In,Clock Out,Hours Worked,Regular Hours,Overtime Hours,Hourly Wage,Total Pay,Notes'
);
assert.deepEqual(noTips.tips, []);
assert.match(describeMapping(noTips).join('\n'), /Tips: no column found, importing as \$0\.00/);

// Date, wage, and hours are what a shift is. Each one missing is refused by
// name, so the preview can say which value the file does not have.
for (const [missing, line] of [
  ['Date', 'hourly_wage,hours_worked,tips'],
  ['Wage', 'shift_date,hours_worked,tips'],
  ['Hours', 'shift_date,hourly_wage,tips'],
]) {
  const detection = detectShiftCsvMapping(headers(line));
  assert.equal(detection.mapping, null);
  assert.deepEqual(detection.missing, [missing]);
}

// Several missing at once are all reported, not just the first.
const bare = detectShiftCsvMapping(headers('notes,something else'));
assert.equal(bare.mapping, null);
assert.deepEqual(bare.missing, ['Date', 'Wage', 'Hours']);

// A clock-in with no clock-out cannot say when a shift ended. Half a pair is
// worse than none, so neither is used and the shifts import without times.
const halfPair = mappingFor('shift_date,clock_in,hours_worked,hourly_wage,tips');
assert.equal(halfPair.startTime, null);
assert.equal(halfPair.endTime, null);

// Alias order is priority. "Start Time" is unambiguous and "In" is not, so a
// file carrying both resolves to the explicit one.
const bothNames = mappingFor('shift_date,In,Out,Start Time,End Time,hours_worked,hourly_wage,tips');
assert.equal(bothNames.startTime, 'Start Time');
assert.equal(bothNames.endTime, 'End Time');

// Two columns that each claim to be the finished total are not a sum. Adding
// them would double-count, so only the higher-priority one is taken.
const twoTotals = mappingFor('shift_date,hours,total hours,hourly_wage,tips');
assert.equal(twoTotals.hours.length, 1);
assert.equal(twoTotals.hours[0], 'hours');

// The preview text is built here rather than in the component so its wording
// is covered by this test. Summed columns have to read as a sum.
assert.deepEqual(describeMapping(driving), [
  'Date: Date',
  'Wage: Hourly Wage',
  'Hours: Regular Hours + Overtime Hours',
  'Tips: Tips',
  'Times: Clock In to Clock Out',
  'Daily income: Total Pay',
  'Note: Notes',
]);

console.log('CSV column mapping OK');
