// Run from the repo root with: node src/lib/shiftExportCsv.test.ts
//
// No test runner, same reason as the other files here: Node and node:assert
// already cover a pure module, and the pre-commit hook runs every test file in
// src/lib/.
import assert from 'node:assert/strict';
import type { Shift } from '../data/shifts.ts';
import { buildShiftExportCsv, shiftExportFileName } from './shiftExportCsv.ts';

function shift(
  id: string,
  shiftDate: string,
  durationSeconds: number,
  tipsCents: number,
  hourlyRateCents: number,
  note: string | null = null,
  jobId = 'job-a'
): Shift {
  return {
    id,
    job_id: jobId,
    shift_date: shiftDate,
    start_time: null,
    end_time: null,
    duration_seconds: durationSeconds,
    tips_cents: tipsCents,
    hourly_rate_cents: hourlyRateCents,
    note,
    created_at: `${shiftDate}T00:00:00.000Z`,
    updated_at: `${shiftDate}T00:00:00.000Z`,
  };
}

const jobNames = new Map([
  ['job-a', 'Driver'],
  ['job-b', 'Barback, weekends'],
]);

// An export with nothing in it is still a valid CSV: a header row and no data.
// Opening an empty file would look like the export failed.
assert.equal(
  buildShiftExportCsv([], jobNames),
  'Date,Job,Hours,Duration Seconds,Hourly Rate,Tips,Gross,Note\n'
);

// Oldest first, unlike the on-screen list, and ties broken by id so two
// exports of the same data are byte-identical.
const ordered = buildShiftExportCsv(
  [
    shift('b', '2026-08-03', 3600, 0, 1000),
    shift('c', '2026-08-01', 3600, 0, 1000),
    shift('a', '2026-08-03', 3600, 0, 1000),
  ],
  jobNames
)
  .trimEnd()
  .split('\n')
  .slice(1)
  .map((line) => line.split(',')[0]);
assert.deepEqual(ordered, ['2026-08-01', '2026-08-03', '2026-08-03']);

// 7.5 hours at $15.50 is exactly $116.25 of wages, plus $20.00 tips.
assert.equal(
  buildShiftExportCsv([shift('exact', '2026-08-03', 450 * 60, 2000, 1550)], jobNames)
    .trimEnd()
    .split('\n')[1],
  '2026-08-03,Driver,7.50,27000,15.50,20.00,136.25,'
);

// The reason this is not the import format: 455 minutes is 27300 seconds,
// which is 7.5833... hours. The Hours column rounds to 7.58, and re-reading
// that as the duration would lose 30 seconds. Duration Seconds beside it is
// the exact value, so the row can still be rebuilt without loss.
const lossy = buildShiftExportCsv([shift('odd', '2026-08-03', 455 * 60, 0, 1550)], jobNames)
  .trimEnd()
  .split('\n')[1]
  .split(',');
assert.equal(lossy[2], '7.58');
assert.equal(lossy[3], '27300');
assert.notEqual(Math.round(Number(lossy[2]) * 3600), 27300);
// Gross still comes from the exact seconds, not the rounded hours.
assert.equal(lossy[6], '117.54');

// Sub-dollar and zero amounts keep both decimal places rather than becoming
// "0.5" or "0", which a spreadsheet would read as a different number.
assert.equal(
  buildShiftExportCsv([shift('cents', '2026-08-03', 3600, 5, 0)], jobNames)
    .trimEnd()
    .split('\n')[1],
  '2026-08-03,Driver,1.00,3600,0.00,0.05,0.05,'
);

// Commas, quotes, and newlines in free text cannot be allowed to shift every
// following column into the wrong field.
const escaped = buildShiftExportCsv(
  [shift('note', '2026-08-03', 3600, 0, 1000, 'Slow, then "busy"\nafter 9', 'job-b')],
  jobNames
)
  .trimEnd()
  .split('\n');
assert.equal(escaped[1], '2026-08-03,"Barback, weekends",1.00,3600,10.00,0.00,10.00,"Slow, then ""busy""');
assert.equal(escaped[2], 'after 9"');

// A shift whose job was hard-deleted should still export rather than crash.
assert.ok(
  buildShiftExportCsv([shift('orphan', '2026-08-03', 3600, 0, 1000, null, 'gone')], jobNames)
    .includes('Unknown job')
);

// Local time, so the Date is built from local parts rather than a UTC string.
// Zero-padding matters in both halves: an unpadded name sorts wrong as text,
// which is the whole reason for the ISO-style ordering.
assert.equal(
  shiftExportFileName(new Date(2026, 7, 3, 14, 34, 12)),
  'tip-tracker-shifts-2026-08-03-143412.csv'
);
assert.equal(
  shiftExportFileName(new Date(2026, 0, 5, 9, 7, 4)),
  'tip-tracker-shifts-2026-01-05-090704.csv',
  'single-digit month, day, hour, minute and second all pad to two characters'
);

// The reason this function grew a time at all: two exports in one day must not
// produce the same name, or the second one throws FileAlreadyExistsException.
assert.notEqual(
  shiftExportFileName(new Date(2026, 7, 3, 14, 0, 0)),
  shiftExportFileName(new Date(2026, 7, 3, 14, 34, 12)),
  'two exports on the same day get different names'
);

// Names are compared as text by every file browser, so later exports have to
// sort after earlier ones without anything parsing them as dates.
assert.ok(
  shiftExportFileName(new Date(2026, 7, 3, 9, 0, 0)) <
    shiftExportFileName(new Date(2026, 7, 3, 14, 0, 0)),
  'a later export sorts after an earlier one on the same day'
);

console.log('shift export CSV OK');
