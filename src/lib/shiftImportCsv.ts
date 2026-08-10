import { detectShiftCsvMapping } from './csvColumnMapping.ts';
import type { ShiftCsvMapping } from './csvColumnMapping.ts';
import { parseCalendarDate } from './dates.ts';

const MAX_CSV_CHARACTERS = 1_000_000;
const MAX_DATA_ROWS = 10_000;

// Reads one column of one row by its header name, already trimmed.
type FieldReader = (column: string) => string;

export type ShiftImportRow = {
  sourceRow: number;
  shiftDate: string;
  startTime: string | null;
  endTime: string | null;
  durationSeconds: number;
  tipsCents: number;
  hourlyRateCents: number;
  note: string | null;
};

export type CsvImportIssue = {
  sourceRow?: number;
  message: string;
};

export type ShiftImportSummary = {
  sourceRows: number;
  acceptedRows: number;
  dateFrom: string | null;
  dateTo: string | null;
  sameDateGroups: number;
  dailyIncomeMismatches: number;
  totalDurationSeconds: number;
  totalTipsCents: number;
};

export type ShiftImportParseResult = {
  rows: ShiftImportRow[];
  errors: CsvImportIssue[];
  warnings: CsvImportIssue[];
  summary: ShiftImportSummary;
  // The file's own header line, and the columns that were read from it. The
  // preview shows both so a wrong guess is visible before anything is written,
  // and passes a corrected mapping back into parseShiftImportCsv.
  headers: string[];
  mapping: ShiftCsvMapping | null;
};

export type ShiftImportConflicts = {
  existingDates: string[];
  possibleDuplicates: number;
};

type ExistingShift = {
  job_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number;
  tips_cents: number;
  hourly_rate_cents: number;
  note: string | null;
};

// File-shape and all-or-nothing validation branches are covered directly by
// shiftImportCsv.test.ts; flattening them would hide distinct user errors.
// fallow-ignore-next-line complexity -- Exact file errors are covered by shiftImportCsv.test.ts.
// Pass a mapping to read the file with columns the user has confirmed or
// corrected. Leave it out and the columns are detected from the header line,
// which is what the first pass over a newly picked file does.
export function parseShiftImportCsv(
  text: string,
  mapping?: ShiftCsvMapping
): ShiftImportParseResult {
  if (text.length > MAX_CSV_CHARACTERS) {
    return emptyResult({ message: 'The CSV is too large. The limit is 1 MB.' });
  }

  let records: string[][];
  try {
    records = parseCsvRecords(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (cause) {
    return emptyResult({
      message: cause instanceof Error ? cause.message : 'The CSV could not be read.',
    });
  }

  if (records.length === 0) {
    return emptyResult({ message: 'The CSV is empty.' });
  }

  // Headers are trimmed once here. Everything downstream -- detection, the
  // mapping, and the per-row column lookup -- uses these trimmed strings, so a
  // file with " Credit Tips" cannot map and then fail to index.
  const headers = records[0].map((header) => header.trim());
  const detection = detectShiftCsvMapping(headers);
  const chosenMapping = mapping ?? detection.mapping;

  if (!chosenMapping) {
    return emptyResult(
      {
        sourceRow: 1,
        message: `No column could be read as ${formatList(detection.missing)}. The header line is: ${headers.join(', ')}.`,
      },
      headers,
      null
    );
  }

  // A mapping supplied by the caller can name a column this file does not
  // have -- picking a second file after editing the mapping for the first, for
  // instance. Catching it here keeps the row parser free of undefined indexes.
  const columnIndexes = readColumnIndexes(headers);
  const unknownColumn = mappedColumns(chosenMapping).find(
    (column) => !columnIndexes.has(column)
  );
  if (unknownColumn) {
    return emptyResult(
      { sourceRow: 1, message: `This CSV has no column named “${unknownColumn}.”` },
      headers,
      null
    );
  }

  const dataRecords = records
    .slice(1)
    .map((values, index) => ({ sourceRow: index + 2, values }))
    .filter(({ values }) => !values.every((value) => value.trim() === ''));

  if (dataRecords.length > MAX_DATA_ROWS) {
    return emptyResult(
      { message: `The CSV has more than ${MAX_DATA_ROWS} shift rows.` },
      headers,
      chosenMapping
    );
  }
  if (dataRecords.length === 0) {
    return emptyResult({ message: 'The CSV has no shift rows.' }, headers, chosenMapping);
  }

  const rows: ShiftImportRow[] = [];
  const errors: CsvImportIssue[] = [];
  const warnings: CsvImportIssue[] = [];

  for (const record of dataRecords) {
    const parsed = parseShiftRecord(
      record.values,
      record.sourceRow,
      headers.length,
      columnIndexes,
      chosenMapping
    );
    errors.push(...parsed.errors);
    if (parsed.row) {
      rows.push(parsed.row);
    }
    if (parsed.warning) {
      warnings.push(parsed.warning);
    }
  }

  // Counted before the file-level warnings below are added, since every
  // warning raised by the loop above is a daily-income disagreement and none
  // of the ones added after it are.
  const dailyIncomeMismatches = warnings.length;

  // Said once for the file rather than once per row. A job with no tips is a
  // real thing, but importing hundreds of shifts at zero tips because a column
  // was named something unexpected is not, so it gets stated plainly.
  //
  // Goes to the front because it is true of every row, and the preview only
  // has room to show the first few. A per-row rounding note must not push the
  // one warning that applies to the whole file out of sight.
  if (chosenMapping.tips.length === 0) {
    warnings.unshift({
      message: 'No tips column was found, so every shift will import with $0.00 in tips.',
    });
  }

  const summary = summarize(rows, dataRecords.length, dailyIncomeMismatches);
  if (!Number.isSafeInteger(summary.totalTipsCents)) {
    errors.push({ message: 'The combined tip total is too large to import safely.' });
  }
  if (summary.sameDateGroups > 0) {
    warnings.push({
      message: `${summary.sameDateGroups} ${summary.sameDateGroups === 1 ? 'date appears' : 'dates appear'} more than once. Those shifts will stay separate.`,
    });
  }

  return { rows, errors, warnings, summary, headers, mapping: chosenMapping };
}

export function inspectShiftImportConflicts(
  rows: ShiftImportRow[],
  existingShifts: ExistingShift[],
  jobId: string
): ShiftImportConflicts {
  const targetShifts = existingShifts.filter((shift) => shift.job_id === jobId);
  const dates = new Set(targetShifts.map((shift) => shift.shift_date));
  const exactRows = new Set(targetShifts.map(shiftKey));

  return {
    existingDates: [...new Set(rows.map((row) => row.shiftDate).filter((date) => dates.has(date)))].sort(),
    possibleDuplicates: rows.filter((row) => exactRows.has(importRowKey(row))).length,
  };
}

// Each branch names one rejected financial field and is pinned by the parser
// test. Keeping those errors explicit is safer than a generic validator DSL.
// fallow-ignore-next-line complexity -- Explicit field errors are covered by shiftImportCsv.test.ts.
function parseShiftRecord(
  values: string[],
  sourceRow: number,
  headerCount: number,
  indexes: Map<string, number>,
  mapping: ShiftCsvMapping
): { row?: ShiftImportRow; errors: CsvImportIssue[]; warning?: CsvImportIssue } {
  // Checked against this file's own header line rather than a fixed number, so
  // extra columns the mapping ignores -- a "Day" column spelling out the
  // weekday -- are fine, while a row that lost or gained a field is not.
  if (values.length !== headerCount) {
    return {
      errors: [
        { sourceRow, message: `Expected ${headerCount} fields but found ${values.length}.` },
      ],
    };
  }

  const field: FieldReader = (column) => values[indexes.get(column)!].trim();
  const errors: CsvImportIssue[] = [];
  const shiftDate = parseSourceDate(field(mapping.date));
  const hourlyRateCents = parseCents(field(mapping.wage));
  // No tips column in the file means a job that does not earn tips, not a
  // parse failure. The preview says so before any of this is written.
  const tipsCents = mapping.tips.length === 0 ? 0 : parseSummedCents(mapping.tips, field);
  const durationSeconds = parseSummedDurationSeconds(mapping.hours, field);
  // Optional columns read as "nothing to check" rather than as an error when
  // the file does not have them.
  const dailyIncomeCents = mapping.dailyIncome ? parseCents(field(mapping.dailyIncome)) : null;
  const startTime = mapping.startTime ? parseSourceTime(field(mapping.startTime)) : null;
  const endTime = mapping.endTime ? parseSourceTime(field(mapping.endTime)) : null;

  if (!shiftDate) errors.push({ sourceRow, message: 'Date must be a real MM/DD/YYYY or YYYY-MM-DD date.' });
  if (hourlyRateCents === null) errors.push({ sourceRow, message: 'Wage must be nonnegative with at most two decimals.' });
  if (tipsCents === null) errors.push({ sourceRow, message: `${formatList(mapping.tips)} must be nonnegative with at most two decimals.` });
  if (durationSeconds === null) errors.push({ sourceRow, message: `${formatList(mapping.hours)} must total more than 0 hours, no more than 24, and use at most two decimals.` });
  if (mapping.dailyIncome && dailyIncomeCents === null) errors.push({ sourceRow, message: `${mapping.dailyIncome} must be nonnegative with at most two decimals.` });

  if (startTime === undefined) {
    errors.push({ sourceRow, message: 'Start Time must be blank, “no data,” h:mm AM/PM, or 24-hour HH:MM.' });
  }
  if (endTime === undefined) {
    errors.push({ sourceRow, message: 'End Time must be blank, “no data,” h:mm AM/PM, or 24-hour HH:MM.' });
  }
  if (
    startTime !== undefined &&
    endTime !== undefined &&
    (startTime === null) !== (endTime === null)
  ) {
    errors.push({
      sourceRow,
      message: 'Start Time and End Time must both contain a time or both be blank/“no data.”',
    });
  }

  if (
    errors.length > 0 ||
    !shiftDate ||
    hourlyRateCents === null ||
    tipsCents === null ||
    durationSeconds === null ||
    startTime === undefined ||
    endTime === undefined
  ) {
    return { errors };
  }

  if (!Number.isSafeInteger(durationSeconds * hourlyRateCents)) {
    return { errors: [{ sourceRow, message: 'A money value is too large to import safely.' }] };
  }

  const note = mapping.note ? field(mapping.note) || null : null;
  const computedIncomeCents =
    tipsCents + Math.round((durationSeconds * hourlyRateCents) / 3600);
  // Only worth cross-checking when the file carries a total to check against.
  // The calculated value is what gets stored either way, per D5.
  const incomeDriftCents =
    dailyIncomeCents === null ? 0 : Math.abs(computedIncomeCents - dailyIncomeCents);
  const warning =
    dailyIncomeCents === null || incomeDriftCents <= roundingAllowanceCents(hourlyRateCents)
      ? undefined
      : {
          sourceRow,
          message: `${mapping.dailyIncome} is ${formatPlainMoney(dailyIncomeCents)}, but the imported wage, hours, and tips calculate to ${formatPlainMoney(computedIncomeCents)}. The calculated value will be used.`,
        };

  return {
    row: {
      sourceRow,
      shiftDate,
      startTime,
      endTime,
      durationSeconds,
      tipsCents,
      hourlyRateCents,
      note,
    },
    errors,
    warning,
  };
}

// Column name to position. A file with the same header twice keeps the first
// one, which matches how the mapping was detected from the same list.
function readColumnIndexes(headers: string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  for (const [index, header] of headers.entries()) {
    if (!indexes.has(header)) indexes.set(header, index);
  }
  return indexes;
}

// Every column the mapping actually reads, so a name that is not in the file
// can be caught once up front instead of on all 624 rows.
function mappedColumns(mapping: ShiftCsvMapping): string[] {
  return [
    mapping.date,
    mapping.wage,
    ...mapping.hours,
    ...mapping.tips,
    mapping.dailyIncome,
    mapping.note,
    mapping.startTime,
    mapping.endTime,
  ].filter((column): column is string => column !== null);
}

function parseCents(value: string): number | null {
  return parseHundredths(value);
}

// Adds up the money columns mapped to one value -- cash plus credit tips, for
// instance.
//
// A blank column contributes nothing rather than failing, because a split
// column is routinely empty on rows it does not apply to. All of them being
// blank is still an error: that is a row with no tip figure at all, and
// importing it as $0.00 would invent data.
function parseSummedCents(columns: string[], field: FieldReader): number | null {
  let total = 0;
  let sawValue = false;

  for (const column of columns) {
    const raw = field(column);
    if (raw === '') continue;

    const cents = parseCents(raw);
    if (cents === null) return null;
    total += cents;
    sawValue = true;
  }

  return sawValue && Number.isSafeInteger(total) ? total : null;
}

// The same idea for hours, except the 24-hour ceiling applies to the total
// rather than to each part. Regular 7.02 plus overtime 1.38 is one 8.40-hour
// shift, and checking the parts separately would let 20 + 20 through.
function parseSummedDurationSeconds(columns: string[], field: FieldReader): number | null {
  let hundredths = 0;
  let sawValue = false;

  for (const column of columns) {
    const raw = field(column);
    if (raw === '') continue;

    const part = parseHundredths(raw);
    if (part === null) return null;
    hundredths += part;
    sawValue = true;
  }

  if (!sawValue || hundredths === 0 || hundredths > 2400) return null;
  return hundredths * 36;
}

// How far the recalculated daily income may sit from the one the file records
// before it is worth telling the user about.
//
// Hours arrive rounded to two decimals, so the duration stored here can be up
// to 0.005 h away from the one the source used to work out that row's pay. The
// money that is worth is 0.005 x wage, and one more cent covers rounding the
// total itself. At $10.50/h that is seven cents.
//
// This is not cosmetic. Across the six exports in fake-data/ there are 790
// disagreements: 778 are this rounding, one to seven cents, and 12 are real --
// overtime rows where the source paid time-and-a-half and the app recomputes
// overtime itself from the job's own settings. Warning on all 790 buries the
// 12 that a person actually needs to look at.
//
// Derived from the row's wage rather than being a flat number, so a $50/h job
// gets the room it genuinely needs instead of a threshold tuned for $10.
function roundingAllowanceCents(hourlyRateCents: number): number {
  return Math.ceil(hourlyRateCents * 0.005) + 1;
}

// "Date and Wage" / "Cash Tips, Credit Tips, and Hours". Used in the messages
// that name several columns at once, so they read as a sentence.
function formatList(values: string[]): string {
  if (values.length <= 1) return values.join('');
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function parseHundredths(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;

  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(hundredths) ? hundredths : null;
}

// Two date shapes reach this. "MM/DD/YYYY" is what the first supplied export
// used. "YYYY-MM-DD" is what every other payroll export and spreadsheet tool
// writes, and it is what the database stores anyway.
//
// They cannot be mistaken for each other -- one is slash-separated with the
// year last, the other is dash-separated with the year first -- so accepting
// both rejects nothing that already worked. This is not the importer guessing:
// each shape has exactly one meaning.
function parseSourceDate(value: string): string | null {
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashed) {
    const isoDate = `${slashed[3]}-${slashed[1].padStart(2, '0')}-${slashed[2].padStart(2, '0')}`;
    return parseCalendarDate(isoDate) ? isoDate : null;
  }

  // parseCalendarDate already requires the exact YYYY-MM-DD shape and rejects
  // impossible days like 2023-02-30, so it is the entire check for this branch.
  return parseCalendarDate(value) ? value : null;
}

// Returns the stored "HH:MM" string, null for a deliberately empty time, or
// undefined for a value that could not be read at all. The caller needs those
// three cases kept apart: null is a valid shift with no times recorded,
// undefined is a row that has to be rejected.
//
// Both 12-hour and 24-hour input are accepted. A trailing am/pm is what makes
// a value 12-hour, and nothing without that suffix can be read as 12-hour, so
// the two branches cannot claim the same string. The space before am/pm is
// optional because "8:15AM" is just as common as "8:15 AM" in real exports.
//
// The explicit blank, format, AM/PM, and hour-conversion branches are pinned
// by shiftImportCsv.test.ts.
// fallow-ignore-next-line complexity -- Source-time branches have direct parser coverage.
function parseSourceTime(value: string): string | null | undefined {
  if (value === '' || value.toLowerCase() === 'no data') return null;

  const twelveHour = /^(0?[1-9]|1[0-2]):([0-5]\d) ?(am|pm)$/i.exec(value);
  if (twelveHour) {
    // 12 and 24 are the awkward ones: 12:30 AM is hour 0, 12:30 PM is hour 12.
    // The modulo maps 12 to 0 first, then PM adds the 12 back.
    const sourceHour = Number(twelveHour[1]);
    const hour = sourceHour % 12 + (twelveHour[3].toLowerCase() === 'pm' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${twelveHour[2]}`;
  }

  // 00:00 through 23:59. The hour is padded because the database column is a
  // fixed-width "HH:MM" string that gets compared and sorted as text.
  const twentyFourHour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }

  return undefined;
}

function summarize(
  rows: ShiftImportRow[],
  sourceRows: number,
  dailyIncomeMismatches: number
): ShiftImportSummary {
  let totalDurationSeconds = 0;
  let totalTipsCents = 0;

  for (const row of rows) {
    totalDurationSeconds += row.durationSeconds;
    totalTipsCents += row.tipsCents;
  }

  const dates = rows.map((row) => row.shiftDate).sort();
  const uniqueDates = [...new Set(dates)];
  return {
    sourceRows,
    acceptedRows: rows.length,
    dateFrom: firstOrNull(uniqueDates),
    dateTo: lastOrNull(uniqueDates),
    sameDateGroups: repeatedValueCount(dates),
    dailyIncomeMismatches,
    totalDurationSeconds,
    totalTipsCents,
  };
}

function firstOrNull(values: string[]): string | null {
  return values.length === 0 ? null : values[0];
}

function lastOrNull(values: string[]): string | null {
  return values.length === 0 ? null : values[values.length - 1];
}

function repeatedValueCount(sortedValues: string[]): number {
  const repeated = new Set<string>();
  for (let index = 1; index < sortedValues.length; index += 1) {
    if (sortedValues[index] === sortedValues[index - 1]) repeated.add(sortedValues[index]);
  }
  return repeated.size;
}

function shiftKey(shift: ExistingShift): string {
  return [
    shift.shift_date,
    shift.start_time ?? '',
    shift.end_time ?? '',
    shift.duration_seconds,
    shift.tips_cents,
    shift.hourly_rate_cents,
    shift.note ?? '',
  ].join('\u0000');
}

function importRowKey(row: ShiftImportRow): string {
  return [
    row.shiftDate,
    row.startTime ?? '',
    row.endTime ?? '',
    row.durationSeconds,
    row.tipsCents,
    row.hourlyRateCents,
    row.note ?? '',
  ].join('\u0000');
}

function formatPlainMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Headers and mapping default to empty because most of the early exits happen
// before either one is known -- an unreadable or oversized file has no header
// line to report.
function emptyResult(
  error: CsvImportIssue,
  headers: string[] = [],
  mapping: ShiftCsvMapping | null = null
): ShiftImportParseResult {
  return {
    rows: [],
    errors: [error],
    warnings: [],
    headers,
    mapping,
    summary: {
      sourceRows: 0,
      acceptedRows: 0,
      dateFrom: null,
      dateTo: null,
      sameDateGroups: 0,
      dailyIncomeMismatches: 0,
      totalDurationSeconds: 0,
      totalTipsCents: 0,
    },
  };
}

// RFC 4180 is a small state machine by nature. The tests exercise quoted
// commas, newlines, escaped quotes, malformed quotes, CRLF, and LF.
// fallow-ignore-next-line complexity -- RFC 4180 branches are covered by shiftImportCsv.test.ts.
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let state: 'plain' | 'quoted' | 'afterQuote' = 'plain';

  const finishField = () => {
    record.push(field);
    field = '';
    state = 'plain';
  };
  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (state === 'quoted') {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        state = 'afterQuote';
      } else if (character === '\r' && text[index + 1] === '\n') {
        field += '\n';
        index += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (character === ',') {
      finishField();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      finishRecord();
    } else if (state === 'afterQuote') {
      throw new Error(`CSV row ${records.length + 1} has text after a closing quote.`);
    } else if (character === '"') {
      if (field !== '') {
        throw new Error(`CSV row ${records.length + 1} has a quote inside an unquoted field.`);
      }
      state = 'quoted';
    } else {
      field += character;
    }
  }

  if (state === 'quoted') {
    throw new Error(`CSV row ${records.length + 1} has an unclosed quoted field.`);
  }
  if (record.length > 0 || field !== '' || state === 'afterQuote') {
    finishRecord();
  }

  return records;
}
