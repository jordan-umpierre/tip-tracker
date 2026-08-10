// Works out which columns of an arbitrary shift CSV hold which values.
//
// This exists because the importer used to require one exact nine-column
// header line, so a file that had every value it needed under different names
// -- "Hourly Wage" instead of "Wage" -- was rejected at row 1 with all of its
// rows unread. Two real exports in fake-data/ fail that way.
//
// The output is a guess. It is deliberately not applied on its own: the import
// preview shows the mapping and lets the user correct it before anything is
// written, because importing hundreds of rows of pay under a wrong column is
// the kind of mistake that looks fine on screen and is discovered months later.
//
// Pure and dependency-free like the rest of lib/, so csvColumnMapping.test.ts
// can run it against the real files without a device.

// Which source columns feed each value the importer needs.
//
// Hours and tips are lists because they are genuinely summed in real files:
// the app's own contract splits tips into cash and credit, and the driving
// export splits hours into regular and overtime. Summing a list of columns is
// the only combining rule here -- there is no expression syntax and no
// per-vendor adapter, because those two cases are the only arithmetic any
// observed export needs.
//
// Date and wage are single columns because adding two dates together is
// meaningless. The type says so rather than leaving it to a comment.
export type ShiftCsvMapping = {
  date: string;
  wage: string;
  hours: string[];
  tips: string[];
  // Everything below is optional. A file with no notes column is still a
  // perfectly good file, and dailyIncome only drives a cross-check warning.
  dailyIncome: string | null;
  note: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type MappingDetection = {
  mapping: ShiftCsvMapping | null;
  // Human-readable names of the required values no column could be found for.
  // Non-empty means mapping is null and the file cannot be imported as-is.
  missing: string[];
};

// Header text as written by the source, reduced to something comparable.
// "Hourly Wage", "hourly_wage", and "HOURLY-WAGE" all become "hourly wage",
// which is what lets one alias list cover the naming style of every export
// instead of one entry per spelling.
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Aliases for the values that come from exactly one column.
//
// Order inside a list is priority: the first alias that matches a column in
// the file wins, so a file carrying both "start time" and "in" resolves to the
// less ambiguous one. Short aliases like "in" and "out" sit last for that
// reason -- they are common enough to be worth accepting and vague enough that
// anything else should beat them.
const SINGLE_COLUMN_ALIASES = {
  date: ['date', 'shift date', 'work date', 'date worked'],
  wage: ['wage', 'hourly wage', 'hourly rate', 'pay rate', 'wage rate', 'rate'],
  dailyIncome: ['daily income', 'total pay', 'gross pay', 'gross', 'total earnings', 'earnings'],
  note: ['note', 'notes', 'comment', 'comments'],
  startTime: ['start time', 'clock in', 'time in', 'start', 'in'],
  endTime: ['end time', 'clock out', 'time out', 'end', 'out'],
} as const;

// Aliases for the two values that can arrive split across several columns.
//
// "parts" are columns that each hold a piece of the total. "whole" are columns
// that already hold the finished number.
//
// When a file has both, the parts win. That is not arbitrary: in
// driving_job_shifts.csv the whole column ("Hours Worked") is blank on every
// row that has clock-in and clock-out times, while "Regular Hours" is filled
// on all 624 rows and "Regular + Overtime" equals "Hours Worked" exactly
// wherever both are present. Parts being complete and a summary column being
// partial is the normal shape of a payroll export, so preferring parts is the
// safer default. The preview still shows the choice and lets it be changed.
const COMBINED_COLUMN_ALIASES = {
  hours: {
    parts: ['regular hours', 'overtime hours', 'ot hours', 'double time hours'],
    whole: ['hours', 'hours worked', 'total hours', 'duration', 'shift hours'],
  },
  tips: {
    parts: ['cash tips', 'credit tips', 'card tips', 'charge tips'],
    whole: ['tips', 'total tips', 'tips earned', 'tip'],
  },
} as const;

// Finds the one column matching the highest-priority alias available.
// Returns the header exactly as the file wrote it, since that is what the
// parser indexes by and what the preview shows the user.
function matchSingle(headers: string[], aliases: readonly string[]): string | null {
  const normalized = headers.map(normalizeHeader);

  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index !== -1) return headers[index];
  }

  return null;
}

// Finds every column matching any alias in the list, in the file's own column
// order. Order matters only so the preview lists them the way the file does.
function matchAll(headers: string[], aliases: readonly string[]): string[] {
  return headers.filter((header) => aliases.includes(normalizeHeader(header)));
}

// Parts first, whole as the fallback. Returns an empty list when neither
// exists, which the caller turns into a "missing" entry.
function matchCombined(
  headers: string[],
  aliases: { parts: readonly string[]; whole: readonly string[] }
): string[] {
  const parts = matchAll(headers, aliases.parts);
  if (parts.length > 0) return parts;

  // Only the first whole-column match is taken. Two columns that each claim to
  // be the finished total are not a sum -- adding them would double-count.
  const whole = matchSingle(headers, aliases.whole);
  return whole ? [whole] : [];
}

export function detectShiftCsvMapping(headers: string[]): MappingDetection {
  const date = matchSingle(headers, SINGLE_COLUMN_ALIASES.date);
  const wage = matchSingle(headers, SINGLE_COLUMN_ALIASES.wage);
  const hours = matchCombined(headers, COMBINED_COLUMN_ALIASES.hours);

  // These three are what a shift is. Without any one of them there is nothing
  // to import, so the file is refused here rather than producing a row of
  // zeroes that looks like real history.
  //
  // Tips are not on this list. shift_lead_job_shifts.csv in fake-data/ has no
  // tips column at all, because that job does not earn any, and refusing a
  // real export of real work would be wrong. A file with no tips column
  // imports every shift at zero tips and says so in the preview.
  const missing: string[] = [];
  if (!date) missing.push('Date');
  if (!wage) missing.push('Wage');
  if (hours.length === 0) missing.push('Hours');

  if (!date || !wage || hours.length === 0) {
    return { mapping: null, missing };
  }

  const tips = matchCombined(headers, COMBINED_COLUMN_ALIASES.tips);

  // Start and end times are only meaningful as a pair. A file with a clock-in
  // column and no clock-out cannot say when any shift ended, so neither is
  // used and the shifts import with no times rather than half a time.
  const startTime = matchSingle(headers, SINGLE_COLUMN_ALIASES.startTime);
  const endTime = matchSingle(headers, SINGLE_COLUMN_ALIASES.endTime);
  const bothTimes = startTime !== null && endTime !== null;

  return {
    mapping: {
      date,
      wage,
      hours,
      tips,
      dailyIncome: matchSingle(headers, SINGLE_COLUMN_ALIASES.dailyIncome),
      note: matchSingle(headers, SINGLE_COLUMN_ALIASES.note),
      startTime: bothTimes ? startTime : null,
      endTime: bothTimes ? endTime : null,
    },
    missing,
  };
}

// One line per mapped value, for the import preview. Built here rather than in
// the component so the wording is covered by the same test as the detection.
export function describeMapping(mapping: ShiftCsvMapping): string[] {
  const lines = [
    `Date: ${mapping.date}`,
    `Wage: ${mapping.wage}`,
    `Hours: ${mapping.hours.join(' + ')}`,
    // Worth a line even when there is no column, because "every shift imports
    // with no tips" is exactly the assumption a user needs to catch.
    `Tips: ${mapping.tips.length > 0 ? mapping.tips.join(' + ') : 'no column found, importing as $0.00'}`,
  ];

  // Optional values are only worth a line when the file actually has them.
  if (mapping.startTime && mapping.endTime) {
    lines.push(`Times: ${mapping.startTime} to ${mapping.endTime}`);
  }
  if (mapping.dailyIncome) lines.push(`Daily income: ${mapping.dailyIncome}`);
  if (mapping.note) lines.push(`Note: ${mapping.note}`);

  return lines;
}
