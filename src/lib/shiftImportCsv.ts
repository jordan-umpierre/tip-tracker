import { parseCalendarDate } from './dates.ts';

const EXPECTED_HEADERS = [
  'Date',
  'Wage',
  'Cash Tips',
  'Credit Tips',
  'Hours',
  'Note',
  'Daily Income',
  'Start Time',
  'End Time',
] as const;
const MAX_CSV_CHARACTERS = 1_000_000;
const MAX_DATA_ROWS = 10_000;

type ExpectedHeader = (typeof EXPECTED_HEADERS)[number];

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
export function parseShiftImportCsv(text: string): ShiftImportParseResult {
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

  const headerIndexes = readHeaderIndexes(records[0]);
  if (!headerIndexes) {
    return emptyResult({
      sourceRow: 1,
      message: `Expected these columns: ${EXPECTED_HEADERS.join(', ')}.`,
    });
  }

  const dataRecords = records
    .slice(1)
    .map((values, index) => ({ sourceRow: index + 2, values }))
    .filter(({ values }) => !values.every((value) => value.trim() === ''));

  if (dataRecords.length > MAX_DATA_ROWS) {
    return emptyResult({ message: `The CSV has more than ${MAX_DATA_ROWS} shift rows.` });
  }
  if (dataRecords.length === 0) {
    return emptyResult({ message: 'The CSV has no shift rows.' });
  }

  const rows: ShiftImportRow[] = [];
  const errors: CsvImportIssue[] = [];
  const warnings: CsvImportIssue[] = [];

  for (const record of dataRecords) {
    const parsed = parseShiftRecord(record.values, record.sourceRow, headerIndexes);
    errors.push(...parsed.errors);
    if (parsed.row) {
      rows.push(parsed.row);
    }
    if (parsed.warning) {
      warnings.push(parsed.warning);
    }
  }

  const summary = summarize(rows, dataRecords.length, warnings.length);
  if (!Number.isSafeInteger(summary.totalTipsCents)) {
    errors.push({ message: 'The combined tip total is too large to import safely.' });
  }
  if (summary.sameDateGroups > 0) {
    warnings.push({
      message: `${summary.sameDateGroups} ${summary.sameDateGroups === 1 ? 'date appears' : 'dates appear'} more than once. Those shifts will stay separate.`,
    });
  }

  return { rows, errors, warnings, summary };
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
  indexes: Map<ExpectedHeader, number>
): { row?: ShiftImportRow; errors: CsvImportIssue[]; warning?: CsvImportIssue } {
  if (values.length !== EXPECTED_HEADERS.length) {
    return {
      errors: [
        {
          sourceRow,
          message: `Expected ${EXPECTED_HEADERS.length} fields but found ${values.length}.`,
        },
      ],
    };
  }

  const field = (header: ExpectedHeader) => values[indexes.get(header)!].trim();
  const errors: CsvImportIssue[] = [];
  const shiftDate = parseSourceDate(field('Date'));
  const hourlyRateCents = parseCents(field('Wage'));
  const cashTipsCents = parseCents(field('Cash Tips'));
  const creditTipsCents = parseCents(field('Credit Tips'));
  const durationSeconds = parseDurationSeconds(field('Hours'));
  const dailyIncomeCents = parseCents(field('Daily Income'));
  const startTime = parseSourceTime(field('Start Time'));
  const endTime = parseSourceTime(field('End Time'));

  if (!shiftDate) errors.push({ sourceRow, message: 'Date must be a real MM/DD/YYYY date.' });
  if (hourlyRateCents === null) errors.push({ sourceRow, message: 'Wage must be nonnegative with at most two decimals.' });
  if (cashTipsCents === null) errors.push({ sourceRow, message: 'Cash Tips must be nonnegative with at most two decimals.' });
  if (creditTipsCents === null) errors.push({ sourceRow, message: 'Credit Tips must be nonnegative with at most two decimals.' });
  if (durationSeconds === null) errors.push({ sourceRow, message: 'Hours must be greater than 0, no more than 24, and use at most two decimals.' });
  if (dailyIncomeCents === null) errors.push({ sourceRow, message: 'Daily Income must be nonnegative with at most two decimals.' });

  if (startTime === undefined) {
    errors.push({ sourceRow, message: 'Start Time must be blank, “no data,” or h:mm AM/PM.' });
  }
  if (endTime === undefined) {
    errors.push({ sourceRow, message: 'End Time must be blank, “no data,” or h:mm AM/PM.' });
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
    cashTipsCents === null ||
    creditTipsCents === null ||
    durationSeconds === null ||
    dailyIncomeCents === null ||
    startTime === undefined ||
    endTime === undefined
  ) {
    return { errors };
  }

  const tipsCents = cashTipsCents + creditTipsCents;
  if (
    !Number.isSafeInteger(tipsCents) ||
    !Number.isSafeInteger(durationSeconds * hourlyRateCents)
  ) {
    return { errors: [{ sourceRow, message: 'A money value is too large to import safely.' }] };
  }

  const note = field('Note') || null;
  const computedIncomeCents =
    tipsCents + Math.round((durationSeconds * hourlyRateCents) / 3600);
  const warning =
    computedIncomeCents === dailyIncomeCents
      ? undefined
      : {
          sourceRow,
          message: `Daily Income is ${formatPlainMoney(dailyIncomeCents)}, but the imported wage, hours, and tips calculate to ${formatPlainMoney(computedIncomeCents)}. The calculated value will be used.`,
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

function readHeaderIndexes(values: string[]): Map<ExpectedHeader, number> | null {
  const headers = values.map((value) => value.trim());
  const uniqueHeaders = new Set(headers);
  if (
    headers.length !== EXPECTED_HEADERS.length ||
    uniqueHeaders.size !== EXPECTED_HEADERS.length ||
    !EXPECTED_HEADERS.every((header) => uniqueHeaders.has(header))
  ) {
    return null;
  }

  return new Map(EXPECTED_HEADERS.map((header) => [header, headers.indexOf(header)]));
}

function parseCents(value: string): number | null {
  return parseHundredths(value);
}

function parseHundredths(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;

  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(hundredths) ? hundredths : null;
}

function parseDurationSeconds(value: string): number | null {
  const hundredths = parseHundredths(value);
  if (!hundredths || hundredths > 2400) return null;
  return hundredths * 36;
}

function parseSourceDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const isoDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return parseCalendarDate(isoDate) ? isoDate : null;
}

// The explicit blank, format, AM/PM, and 12-hour conversion branches are
// pinned by shiftImportCsv.test.ts.
// fallow-ignore-next-line complexity -- Source-time branches have direct parser coverage.
function parseSourceTime(value: string): string | null | undefined {
  if (value === '' || value.toLowerCase() === 'no data') return null;

  const match = /^(0?[1-9]|1[0-2]):([0-5]\d) (am|pm)$/i.exec(value);
  if (!match) return undefined;

  const sourceHour = Number(match[1]);
  const hour = sourceHour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
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

function emptyResult(error: CsvImportIssue): ShiftImportParseResult {
  return {
    rows: [],
    errors: [error],
    warnings: [],
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
