// Run from the repo root with: node src/lib/shiftImportCsv.test.ts
//
// This is the import trust boundary: malformed files must fail before any
// SQLite write is offered. Node's built-in assertions keep that behavior
// runnable without a test framework or device.
import assert from 'node:assert/strict';
import { inspectShiftImportConflicts, parseShiftImportCsv } from './shiftImportCsv.ts';

const HEADER =
  'Date,Wage,Cash Tips, Credit Tips, Hours, Note, Daily Income, Start Time, End Time';
const VALID_ROW = ['06/29/2022', '9.00', '163.00', '0.00', '7.35', '', '229.15', 'no data', 'no data'];

function file(...rows: string[]): string {
  return `${HEADER}\r\n${rows.join('\r\n')}\r\n`;
}

function row(changes: Record<number, string> = {}): string {
  return VALID_ROW.map((value, index) => changes[index] ?? value).join(',');
}

const exact = parseShiftImportCsv(file(row()));
assert.deepEqual(exact.errors, []);
assert.equal(exact.rows.length, 1);
assert.deepEqual(exact.rows[0], {
  sourceRow: 2,
  shiftDate: '2022-06-29',
  startTime: null,
  endTime: null,
  durationSeconds: 26460,
  tipsCents: 16300,
  hourlyRateCents: 900,
  note: null,
});
assert.deepEqual(exact.summary, {
  sourceRows: 1,
  acceptedRows: 1,
  dateFrom: '2022-06-29',
  dateTo: '2022-06-29',
  sameDateGroups: 0,
  dailyIncomeMismatches: 0,
  totalDurationSeconds: 26460,
  totalTipsCents: 16300,
});

// Leading spaces are present in the supplied export's headers and values.
// Trimming those boundaries must not loosen the required column names.
const spaced = parseShiftImportCsv(
  `\ufeffDate,Wage,Cash Tips, Credit Tips, Hours, Note, Daily Income, Start Time, End Time\n${row({ 6: ' 229.15' })}\n`
);
assert.deepEqual(spaced.errors, []);

// Header order is not data. The exact unique set is required, then fields are
// read by name so a harmless column reorder cannot put wages into dates.
const reordered = parseShiftImportCsv(
  `Wage,Date,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time,End Time\n9.00,06/29/2022,163.00,0.00,7.35,,229.15,no data,no data`
);
assert.equal(reordered.rows[0].shiftDate, '2022-06-29');
assert.equal(reordered.rows[0].hourlyRateCents, 900);

// RFC 4180 quoting covers commas, escaped quotes, and embedded newlines in a
// note even though the supplied file happens not to use quotes yet.
const quoted = parseShiftImportCsv(
  `${HEADER}\r\n07/01/2022,10.00,5.00,0.00,1.00,"busy, ""very""\r\nnight",15.00,no data,no data\r\n`
);
assert.deepEqual(quoted.errors, []);
assert.equal(quoted.rows[0].note, 'busy, "very"\nnight');

// A file is refused for missing a value a shift cannot exist without, not for
// naming its columns differently. Each of these drops exactly one of the three
// required values and must say which one is absent.
for (const [missingValue, badHeader] of [
  ['Date', 'Wage,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time,End Time'],
  ['Wage', 'Date,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time,End Time'],
  ['Hours', 'Date,Wage,Cash Tips,Credit Tips,Note,Daily Income,Start Time,End Time'],
]) {
  const refused = parseShiftImportCsv(`${badHeader}\n${VALID_ROW.slice(0, 8).join(',')}`);
  assert.equal(refused.rows.length, 0);
  assert.match(refused.errors[0].message, new RegExp(`No column could be read as ${missingValue}`));
  // The header line is echoed back so the user can see what the file did have.
  assert.match(refused.errors[0].message, /The header line is:/);
}

// Losing one half of the time pair is not a rejection. The file still knows
// when every shift happened and for how long; it just cannot say when they
// started and ended, so the shifts import without times.
const halfTimes = parseShiftImportCsv(
  `Date,Wage,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time\n${VALID_ROW.slice(0, 8).join(',')}`
);
assert.deepEqual(halfTimes.errors, []);
assert.equal(halfTimes.rows[0].startTime, null);
assert.equal(halfTimes.rows[0].endTime, null);

// A row that lost or gained a field is still an integrity failure, but the
// count now comes from the file's own header line rather than a fixed nine.
assert.match(parseShiftImportCsv(`${HEADER}\n${VALID_ROW.slice(0, 8).join(',')}`).errors[0].message, /Expected 9 fields/);
assert.match(parseShiftImportCsv(`${HEADER}\n${row({ 5: '"unclosed' })}`).errors[0].message, /unclosed quoted field/);
assert.match(parseShiftImportCsv(`${HEADER}\n${row({ 5: '"done"junk' })}`).errors[0].message, /text after a closing quote/);
assert.match(parseShiftImportCsv(`${HEADER}\n${row({ 5: 'bad"quote' })}`).errors[0].message, /quote inside an unquoted field/);

assert.match(parseShiftImportCsv(file(row({ 0: '02/30/2026' }))).errors[0].message, /real MM\/DD\/YYYY/);
for (const badMoney of ['-1.00', '1.001', 'five']) {
  assert.match(parseShiftImportCsv(file(row({ 2: badMoney }))).errors[0].message, /Cash Tips/);
}
for (const badHours of ['0', '24.01', '1.001']) {
  assert.match(parseShiftImportCsv(file(row({ 4: badHours }))).errors[0].message, /Hours must/);
}
const midnightToNoon = parseShiftImportCsv(file(row({ 7: '12:00 AM', 8: '12:00 PM' })));
assert.deepEqual(midnightToNoon.errors, []);
assert.equal(midnightToNoon.rows[0].startTime, '00:00');
assert.equal(midnightToNoon.rows[0].endTime, '12:00');

const overnight = parseShiftImportCsv(file(row({ 7: '9:15 PM', 8: '5:05 AM' })));
assert.equal(overnight.rows[0].startTime, '21:15');
assert.equal(overnight.rows[0].endTime, '05:05');

const caseAndLeadingZero = parseShiftImportCsv(file(row({ 7: '09:05 pm', 8: '05:10 Am' })));
assert.equal(caseAndLeadingZero.rows[0].startTime, '21:05');
assert.equal(caseAndLeadingZero.rows[0].endTime, '05:10');

for (const oneSided of [
  row({ 7: '9:00 AM' }),
  row({ 7: '', 8: '5:00 PM' }),
]) {
  assert.match(parseShiftImportCsv(file(oneSided)).errors.at(-1)!.message, /must both contain a time/);
}

for (const malformedTime of ['00:00 AM', '13:00 PM', '9:5 AM', '9:60 AM', '24:00', '23:60', '9:5']) {
  assert.match(parseShiftImportCsv(file(row({ 7: malformedTime, 8: '5:00 PM' }))).errors[0].message, /Start Time/);
}

// 24-hour times are what the driving-job exports in fake-data/ contain, and
// nothing without an am/pm suffix could ever have parsed as 12-hour, so the
// two shapes stay distinguishable. Midnight is the one worth pinning: "00:22"
// is a real clock-out on an overnight shift, not a missing value.
const twentyFourHour = parseShiftImportCsv(file(row({ 7: '13:30', 8: '00:22' })));
assert.deepEqual(twentyFourHour.errors, []);
assert.equal(twentyFourHour.rows[0].startTime, '13:30');
assert.equal(twentyFourHour.rows[0].endTime, '00:22');

// An unpadded 24-hour hour still has to reach the database padded, because
// start_time is compared and sorted as fixed-width text.
const unpadded = parseShiftImportCsv(file(row({ 7: '9:15', 8: '17:00' })));
assert.equal(unpadded.rows[0].startTime, '09:15');

// Real exports write both "8:15 AM" and "8:15AM". The space is optional.
const noSpaceMeridiem = parseShiftImportCsv(file(row({ 7: '8:15AM', 8: '4:30PM' })));
assert.deepEqual(noSpaceMeridiem.errors, []);
assert.equal(noSpaceMeridiem.rows[0].startTime, '08:15');
assert.equal(noSpaceMeridiem.rows[0].endTime, '16:30');

// ISO dates are what every export other than the original supplied one uses.
// Slash and dash dates cannot be confused, so both are accepted as-is.
const isoDate = parseShiftImportCsv(file(row({ 0: '2023-08-01' })));
assert.deepEqual(isoDate.errors, []);
assert.equal(isoDate.rows[0].shiftDate, '2023-08-01');

// Leniency about the shape must not become leniency about the calendar.
for (const impossibleDate of ['2023-02-30', '2023-13-01', '2023-8-1', 'not-a-date']) {
  assert.match(parseShiftImportCsv(file(row({ 0: impossibleDate }))).errors[0].message, /Date must be/);
}

const absentTimes = parseShiftImportCsv(file(row({ 7: '', 8: 'NO DATA' })));
assert.deepEqual(absentTimes.errors, []);
assert.equal(absentTimes.rows[0].startTime, null);
assert.equal(absentTimes.rows[0].endTime, null);

// One bad row blocks an all-or-nothing import, but valid rows remain available
// for an error summary instead of disappearing from the result.
const mixed = parseShiftImportCsv(file(row(), row({ 0: 'not-a-date' })));
assert.equal(mixed.rows.length, 1);
assert.equal(mixed.errors.length, 1);
assert.equal(mixed.summary.sourceRows, 2);

// ImportPreview refuses the entire parsed result whenever errors exist, so a
// valid timed row beside a malformed row never reaches the SQLite transaction.
const mixedTimes = parseShiftImportCsv(
  file(row({ 7: '9:00 AM', 8: '5:00 PM' }), row({ 7: '9:00 AM', 8: 'bad' }))
);
assert.equal(mixedTimes.rows.length, 1);
assert.equal(mixedTimes.errors.length, 1);

// Daily Income is a source-side check, not stored truth.
//
// Hours carry two decimals, so a source that worked out pay from exact minutes
// always disagrees by a few cents. At this row's $9.00 wage the allowance is
// six cents: 0.005 h of wage, rounded up, plus a cent for rounding the total.
// Inside it, silence. Real exports produce hundreds of these, and warning on
// all of them buries the disagreements that mean something.
for (const withinAllowance of ['229.15', '229.14', '229.09', '229.21']) {
  const quiet = parseShiftImportCsv(file(row({ 6: withinAllowance })));
  assert.equal(quiet.rows.length, 1);
  assert.deepEqual(quiet.warnings, []);
  assert.equal(quiet.summary.dailyIncomeMismatches, 0);
}

// One cent past the allowance is no longer rounding, so it is reported. The
// row still imports: the recalculated value is what gets stored either way.
const mismatch = parseShiftImportCsv(file(row({ 6: '229.08' })));
assert.equal(mismatch.rows.length, 1);
assert.equal(mismatch.errors.length, 0);
assert.equal(mismatch.summary.dailyIncomeMismatches, 1);
assert.match(mismatch.warnings[0].message, /calculated value will be used/);

const sameDate = parseShiftImportCsv(
  file(
    row(),
    row({ 1: '10.00', 2: '5.00', 4: '1.00', 6: '15.00' })
  )
);
assert.equal(sameDate.rows.length, 2);
assert.equal(sameDate.summary.sameDateGroups, 1);
assert.match(sameDate.warnings.at(-1)!.message, /stay separate/);

const conflicts = inspectShiftImportConflicts(exact.rows, [
  {
    job_id: 'job-a',
    shift_date: '2022-06-29',
    start_time: null,
    end_time: null,
    duration_seconds: 26460,
    tips_cents: 16300,
    hourly_rate_cents: 900,
    note: null,
  },
  {
    job_id: 'job-b',
    shift_date: '2022-06-29',
    start_time: null,
    end_time: null,
    duration_seconds: 26460,
    tips_cents: 16300,
    hourly_rate_cents: 900,
    note: null,
  },
], 'job-a');
assert.deepEqual(conflicts, { existingDates: ['2022-06-29'], possibleDuplicates: 1 });

const timedConflict = inspectShiftImportConflicts(overnight.rows, [
  {
    job_id: 'job-a',
    shift_date: '2022-06-29',
    start_time: '21:15',
    end_time: '05:05',
    duration_seconds: 26460,
    tips_cents: 16300,
    hourly_rate_cents: 900,
    note: null,
  },
], 'job-a');
assert.equal(timedConflict.possibleDuplicates, 1);

const differentTimeConflict = inspectShiftImportConflicts(overnight.rows, [
  {
    job_id: 'job-a',
    shift_date: '2022-06-29',
    start_time: '20:15',
    end_time: '04:05',
    duration_seconds: 26460,
    tips_cents: 16300,
    hourly_rate_cents: 900,
    note: null,
  },
], 'job-a');
assert.equal(differentTimeConflict.possibleDuplicates, 0);

assert.match(parseShiftImportCsv('').errors[0].message, /empty/);
assert.match(parseShiftImportCsv('x'.repeat(1_000_001)).errors[0].message, /too large/);

const maximumRows = `${HEADER}\n${`${row()}\n`.repeat(10_000)}\n`;
assert.equal(parseShiftImportCsv(maximumRows).summary.acceptedRows, 10_000);
assert.match(
  parseShiftImportCsv(`${maximumRows}${row()}\n`).errors[0].message,
  /more than 10000 shift rows/
);

// A file that names its columns differently reads end to end, with hours
// summed from a regular and an overtime column. This is the driving export's
// shape: an ignored "Day" column, ISO dates, and split hours.
//
// 7.02 + 1.38 is 8.40 hours, which is 30240 seconds.
const alternateHeaders = parseShiftImportCsv(
  'Date,Day,Clock In,Clock Out,Regular Hours,Overtime Hours,Hourly Wage,Tips,Total Pay,Notes\n' +
    '2023-11-04,Saturday,12:30 PM,8:54 PM,7.02,1.38,8.50,17.75,95.01,busy\n'
);
assert.deepEqual(alternateHeaders.errors, []);
assert.equal(alternateHeaders.rows[0].durationSeconds, 30240);
assert.equal(alternateHeaders.rows[0].tipsCents, 1775);
assert.equal(alternateHeaders.rows[0].hourlyRateCents, 850);
assert.equal(alternateHeaders.rows[0].shiftDate, '2023-11-04');
assert.equal(alternateHeaders.rows[0].startTime, '12:30');
assert.equal(alternateHeaders.rows[0].endTime, '20:54');
assert.equal(alternateHeaders.rows[0].note, 'busy');

// That row is also the honest disagreement worth keeping. The source paid
// time-and-a-half on the overtime hour and recorded $95.01; this stores 8.40
// hours at the base rate, and the app works out overtime itself from the job's
// settings. Well past a rounding allowance, so it is reported.
assert.equal(alternateHeaders.summary.dailyIncomeMismatches, 1);
assert.match(alternateHeaders.warnings[0].message, /Total Pay is \$95\.01/);

// A blank part contributes nothing. Most rows have no overtime at all.
const noOvertime = parseShiftImportCsv(
  'Date,Regular Hours,Overtime Hours,Hourly Wage,Tips\n2023-11-05,6.00,,8.50,10.00\n'
);
assert.deepEqual(noOvertime.errors, []);
assert.equal(noOvertime.rows[0].durationSeconds, 21600);

// Every part blank is a row with no hours at all, which is not a zero-hour
// shift -- it is a row that cannot be imported.
const allPartsBlank = parseShiftImportCsv(
  'Date,Regular Hours,Overtime Hours,Hourly Wage,Tips\n2023-11-05,,,8.50,10.00\n'
);
assert.equal(allPartsBlank.rows.length, 0);
assert.match(allPartsBlank.errors[0].message, /Regular Hours and Overtime Hours must total more than 0/);

// The 24-hour ceiling applies to the total, not to each part. Two legal-looking
// halves must not add up to a 40-hour shift.
const impossibleTotal = parseShiftImportCsv(
  'Date,Regular Hours,Overtime Hours,Hourly Wage,Tips\n2023-11-05,20.00,20.00,8.50,10.00\n'
);
assert.equal(impossibleTotal.rows.length, 0);
assert.match(impossibleTotal.errors[0].message, /no more than 24/);

// No tips column means a job that does not earn tips. The rows import at zero
// and the file says so once, rather than repeating it on every row.
const withoutTips = parseShiftImportCsv(
  'Date,Regular Hours,Hourly Wage\n2023-11-05,6.00,8.50\n2023-11-06,5.00,8.50\n'
);
assert.deepEqual(withoutTips.errors, []);
assert.equal(withoutTips.rows.length, 2);
assert.equal(withoutTips.summary.totalTipsCents, 0);
assert.equal(withoutTips.warnings.length, 1);
assert.match(withoutTips.warnings[0].message, /every shift will import with \$0\.00 in tips/);

// A caller can override the detected columns, which is what the preview does
// when the guess is wrong. Here the summary column is chosen over the parts.
const overridden = parseShiftImportCsv(
  'Date,Hours Worked,Regular Hours,Overtime Hours,Hourly Wage,Tips\n2023-11-04,8.40,7.02,1.38,8.50,17.75\n',
  {
    date: 'Date',
    wage: 'Hourly Wage',
    hours: ['Hours Worked'],
    tips: ['Tips'],
    dailyIncome: null,
    note: null,
    startTime: null,
    endTime: null,
  }
);
assert.deepEqual(overridden.errors, []);
assert.equal(overridden.rows[0].durationSeconds, 30240);

// An override naming a column the file does not have is caught once, up front,
// rather than on every row.
const staleOverride = parseShiftImportCsv(
  'Date,Regular Hours,Hourly Wage,Tips\n2023-11-04,7.02,8.50,17.75\n',
  {
    date: 'Date',
    wage: 'Hourly Wage',
    hours: ['Hours Worked'],
    tips: ['Tips'],
    dailyIncome: null,
    note: null,
    startTime: null,
    endTime: null,
  }
);
assert.equal(staleOverride.rows.length, 0);
assert.equal(staleOverride.errors.length, 1);
assert.match(staleOverride.errors[0].message, /no column named “Hours Worked/);

// The result carries the file's own header line and the columns that were
// read, because the preview shows both and sends a correction back.
assert.deepEqual(withoutTips.headers, ['Date', 'Regular Hours', 'Hourly Wage']);
assert.deepEqual(alternateHeaders.mapping?.hours, ['Regular Hours', 'Overtime Hours']);

console.log('shift import CSV OK');
