// Turns stored shifts into CSV text. Like the other lib modules this touches
// no SQLite, React, or filesystem: it returns a string and the caller decides
// where it goes, which is what makes it testable without a device.
import type { Shift } from '../data/shifts';
import { localDateString } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

// Deliberately not the nine-column import contract. That format carries Hours
// to two decimals, which is 36-second granularity, so a shift stored as 27300
// seconds (455 minutes, from the pre-version-2 minutes column) cannot survive
// a round trip through it. An export that silently rounds durations is a bad
// backup, so this writes what the app actually stores instead. See D16.
//
// Duration appears twice on purpose: Hours is what a person or a spreadsheet
// wants to read, Duration Seconds is the exact stored value that could rebuild
// the row without loss.
const HEADERS = [
  'Date',
  'Job',
  'Hours',
  'Duration Seconds',
  'Hourly Rate',
  'Tips',
  'Gross',
  'Note',
] as const;

// Cents to a plain decimal string: 2450 becomes "24.50". No currency symbol
// and no thousands separator, because a spreadsheet needs to read this back as
// a number, not as text that happens to look like money.
function plainMoney(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

// Hours to two decimals for the human-readable column. This is the lossy one;
// Duration Seconds beside it is not.
function plainHours(durationSeconds: number): string {
  return (durationSeconds / 3600).toFixed(2);
}

// A field only needs quoting if it contains a comma, a quote, or a line break.
// Inside quotes, a quote is written twice. That is the whole of RFC 4180 that
// matters here, and it is why notes and job names cannot break the file.
function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildShiftExportCsv(shifts: Shift[], jobNames: Map<string, string>): string {
  // Oldest first, unlike the on-screen list. A CSV is read top to bottom as a
  // record of what happened, and sorting by id after the date keeps the output
  // identical between exports when two shifts share a day.
  const ordered = [...shifts].sort(
    (left, right) =>
      left.shift_date.localeCompare(right.shift_date) || left.id.localeCompare(right.id)
  );

  const rows = ordered.map((shift) =>
    [
      shift.shift_date,
      jobNames.get(shift.job_id) ?? 'Unknown job',
      plainHours(shift.duration_seconds),
      String(shift.duration_seconds),
      plainMoney(shift.hourly_rate_cents),
      plainMoney(shift.tips_cents),
      plainMoney(calculateShiftGrossCents(shift)),
      shift.note ?? '',
    ]
      .map(escapeField)
      .join(',')
  );

  // Trailing newline so the file ends the way text files are expected to, and
  // so appending or concatenating one never joins two rows together.
  return [HEADERS.join(','), ...rows].join('\n') + '\n';
}

// Stamped with the moment it was taken so repeated exports sit beside each
// other in the order they happened, rather than colliding.
//
// This carried only the date at first, which was too coarse to do that job:
// `Directory.createFile` throws FileAlreadyExistsException rather than
// replacing, so the second export of any day failed outright with a message
// that could not say why. Found on device 2026-08-04.
//
// Overwriting instead would be fewer files, and is the right answer once the
// app can restore from an export. It is the wrong one while it cannot: until
// then these files are the only copy of the data that survives losing the
// device, and replacing one is not a trade worth making to avoid clutter.
//
// Local time throughout, for the same reason localDateString uses local
// getters -- the name should read as the moment the person taking it lived,
// not a UTC translation of it.
export function shiftExportFileName(now: Date): string {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `tip-tracker-shifts-${localDateString(now)}-${hours}${minutes}${seconds}.csv`;
}
