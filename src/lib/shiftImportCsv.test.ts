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

for (const badHeader of [
  'Date,Wage,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time',
  'Date,Date,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time,End Time',
  'Date,Wage,Cash Tips,Credit Tips,Hours,Note,Daily Income,Start Time,Extra',
]) {
  assert.match(parseShiftImportCsv(`${badHeader}\n${row()}`).errors[0].message, /Expected these columns/);
}

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

for (const malformedTime of ['00:00 AM', '13:00 PM', '9:5 AM', '9:00AM', '9:60 AM', '21:00']) {
  assert.match(parseShiftImportCsv(file(row({ 7: malformedTime, 8: '5:00 PM' }))).errors[0].message, /Start Time/);
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

// Daily Income is a source-side check, not stored truth. The attached file has
// one one-cent disagreement, so a mismatch warns while keeping the row valid.
const mismatch = parseShiftImportCsv(file(row({ 6: '229.14' })));
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

console.log('shift import CSV OK');
