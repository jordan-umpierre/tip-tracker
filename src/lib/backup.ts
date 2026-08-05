import { parseCalendarDate } from './dates.ts';

export const MAX_BACKUP_BYTES = 10_000_000;
export const MAX_BACKUP_JOBS = 1_000;
export const MAX_BACKUP_SHIFTS = 20_000;
export const MAX_BACKUP_FEDERAL_WITHHOLDING_SETTINGS = 20_000;

const FORMAT = 'tip-tracker-backup';
const VERSION = 3;
const SCHEMA_VERSION = 5;

const TOP_LEVEL_KEYS_V1 = [
  'format',
  'version',
  'schema_version',
  'exported_at',
  'jobs',
  'shifts',
] as const;

const TOP_LEVEL_KEYS_V2 = [...TOP_LEVEL_KEYS_V1, 'federal_withholding_settings'] as const;

const JOB_KEYS = [
  'id',
  'name',
  'hourly_rate_cents',
  'archived_at',
  'created_at',
  'updated_at',
  'overtime_enabled',
  'workweek_start_weekday',
  'workweek_start_time',
] as const;

const SHIFT_KEYS = [
  'id',
  'job_id',
  'shift_date',
  'duration_seconds',
  'tips_cents',
  'hourly_rate_cents',
  'note',
  'deleted_at',
  'created_at',
  'updated_at',
  'start_time',
  'end_time',
] as const;

const FEDERAL_WITHHOLDING_SETTING_KEYS_V2 = [
  'id',
  'job_id',
  'effective_from',
  'filing_status',
  'pay_periods_per_year',
  'step2_checked',
  'step3_credits_cents',
  'step4a_other_income_cents',
  'step4b_deductions_cents',
  'step4c_extra_withholding_cents',
  'exempt',
  'created_at',
  'updated_at',
] as const;

const FEDERAL_WITHHOLDING_SETTING_KEYS = [
  ...FEDERAL_WITHHOLDING_SETTING_KEYS_V2,
  'deleted_at',
] as const;

export type BackupJob = {
  id: string;
  name: string;
  hourly_rate_cents: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  overtime_enabled: number;
  workweek_start_weekday: number;
  workweek_start_time: string;
};

export type BackupShift = {
  id: string;
  job_id: string;
  shift_date: string;
  duration_seconds: number;
  tips_cents: number;
  hourly_rate_cents: number;
  note: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  start_time: string | null;
  end_time: string | null;
};

export type BackupFederalWithholdingSettings = {
  id: string;
  job_id: string;
  effective_from: string;
  filing_status:
    | 'single-or-married-filing-separately'
    | 'married-filing-jointly'
    | 'head-of-household';
  pay_periods_per_year: number;
  step2_checked: number;
  step3_credits_cents: number;
  step4a_other_income_cents: number;
  step4b_deductions_cents: number;
  step4c_extra_withholding_cents: number;
  exempt: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TipTrackerBackup = {
  format: typeof FORMAT;
  version: typeof VERSION;
  schema_version: typeof SCHEMA_VERSION;
  exported_at: string;
  jobs: BackupJob[];
  shifts: BackupShift[];
  federal_withholding_settings: BackupFederalWithholdingSettings[];
};

export type BackupRows = Pick<
  TipTrackerBackup,
  'jobs' | 'shifts' | 'federal_withholding_settings'
>;

export function buildBackupJson(
  jobs: BackupJob[],
  shifts: BackupShift[],
  federalWithholdingSettings: BackupFederalWithholdingSettings[],
  exportedAt: Date
): string {
  const backup: TipTrackerBackup = {
    format: FORMAT,
    version: VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: exportedAt.toISOString(),
    jobs: [...jobs].sort(compareIds),
    shifts: [...shifts].sort(compareIds),
    federal_withholding_settings: [...federalWithholdingSettings].sort(compareIds),
  };

  validateBackup(backup);
  const text = `${JSON.stringify(backup)}\n`;
  assertSize(text);
  return text;
}

export function parseBackupJson(text: string): TipTrackerBackup {
  assertSize(text);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The backup is not valid JSON.');
  }

  return validateBackup(value);
}

export function backupFileName(now: Date): string {
  const localPart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const timePart = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('');
  return `tip-tracker-backup-${localPart}-${timePart}.json`;
}

export function assertBackupRowsEqual(expected: BackupRows, actual: BackupRows): void {
  const expectedRows = canonicalRows(expected);
  const actualRows = canonicalRows(actual);
  if (JSON.stringify(expectedRows) !== JSON.stringify(actualRows)) {
    throw new Error('The restored rows did not match the backup.');
  }
}

// fallow-ignore-next-line complexity -- Every trust-boundary branch is exercised by backup.test.ts.
function validateBackup(value: unknown): TipTrackerBackup {
  assertPlainObject(value, 'The backup');
  if (value.format !== FORMAT) throw new Error('This is not a Tip Tracker backup.');
  if (value.version === 1) return validateVersion1Backup(value);
  if (value.version === 2) return validateVersion2Backup(value);
  if (value.version === VERSION) return validateVersion3Backup(value);
  throw new Error('This backup version is not supported.');
}

function validateVersion1Backup(value: Record<string, unknown>): TipTrackerBackup {
  assertExactKeys(value, TOP_LEVEL_KEYS_V1, 'The backup');
  if (value.schema_version !== 3) {
    throw new Error('This backup database version is not supported.');
  }
  return validateRows(value, []);
}

function validateVersion2Backup(value: Record<string, unknown>): TipTrackerBackup {
  assertExactKeys(value, TOP_LEVEL_KEYS_V2, 'The backup');
  if (value.schema_version !== 4) {
    throw new Error('This backup database version is not supported.');
  }
  if (!Array.isArray(value.federal_withholding_settings)) {
    throw new Error('The backup must contain a federal_withholding_settings array.');
  }
  return validateRows(value, value.federal_withholding_settings, true);
}

function validateVersion3Backup(value: Record<string, unknown>): TipTrackerBackup {
  assertExactKeys(value, TOP_LEVEL_KEYS_V2, 'The backup');
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new Error('This backup database version is not supported.');
  }
  if (!Array.isArray(value.federal_withholding_settings)) {
    throw new Error('The backup must contain a federal_withholding_settings array.');
  }
  return validateRows(value, value.federal_withholding_settings);
}

// fallow-ignore-next-line complexity -- Bounds, relationships, and all wire versions are asserted in backup.test.ts.
function validateRows(
  value: Record<string, unknown>,
  rawFederalWithholdingSettings: unknown[],
  legacySettings = false
): TipTrackerBackup {
  assertTimestamp(value.exported_at, 'exported_at');
  if (!Array.isArray(value.jobs) || !Array.isArray(value.shifts)) {
    throw new Error('The backup must contain jobs and shifts arrays.');
  }
  if (value.jobs.length > MAX_BACKUP_JOBS) {
    throw new Error(`The backup has more than ${MAX_BACKUP_JOBS} jobs.`);
  }
  if (value.shifts.length > MAX_BACKUP_SHIFTS) {
    throw new Error(`The backup has more than ${MAX_BACKUP_SHIFTS} shifts.`);
  }
  if (rawFederalWithholdingSettings.length > MAX_BACKUP_FEDERAL_WITHHOLDING_SETTINGS) {
    throw new Error(
      `The backup has more than ${MAX_BACKUP_FEDERAL_WITHHOLDING_SETTINGS} federal withholding settings.`
    );
  }

  const jobs = value.jobs.map(validateJob);
  const shifts = value.shifts.map(validateShift);
  const federalWithholdingSettings = rawFederalWithholdingSettings.map((row, index) =>
    validateFederalWithholdingSettings(row, index, legacySettings)
  );
  assertUniqueIds(jobs, 'job');
  assertUniqueIds(shifts, 'shift');
  assertUniqueIds(federalWithholdingSettings, 'federal withholding setting');
  assertUniqueJobDates(federalWithholdingSettings);

  const jobIds = new Set(jobs.map((job) => job.id));
  for (const shift of shifts) {
    if (!jobIds.has(shift.job_id)) {
      throw new Error(`Shift ${shift.id} refers to a job that is not in the backup.`);
    }
  }
  for (const settings of federalWithholdingSettings) {
    if (!jobIds.has(settings.job_id)) {
      throw new Error(
        `Federal withholding setting ${settings.id} refers to a job that is not in the backup.`
      );
    }
  }

  // Version-1/schema-3 files normalize to the current in-memory shape with no
  // settings. They remain exactly validated on input, while the restore layer
  // only needs one safe representation.
  return {
    format: FORMAT,
    version: VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: value.exported_at,
    jobs: [...jobs].sort(compareIds),
    shifts: [...shifts].sort(compareIds),
    federal_withholding_settings: [...federalWithholdingSettings].sort(compareIds),
  };
}

// fallow-ignore-next-line complexity -- Field-specific failures are pinned by backup.test.ts.
function validateJob(value: unknown, index: number): BackupJob {
  const label = `Job ${index + 1}`;
  assertPlainObject(value, label);
  assertExactKeys(value, JOB_KEYS, label);
  assertNonemptyString(value.id, `${label} id`);
  assertString(value.name, `${label} name`);
  assertNonnegativeInteger(value.hourly_rate_cents, `${label} hourly_rate_cents`);
  assertNullableTimestamp(value.archived_at, `${label} archived_at`);
  assertTimestamp(value.created_at, `${label} created_at`);
  assertTimestamp(value.updated_at, `${label} updated_at`);
  if (value.overtime_enabled !== 0 && value.overtime_enabled !== 1) {
    throw new Error(`${label} overtime_enabled must be 0 or 1.`);
  }
  const weekday = value.workweek_start_weekday;
  if (typeof weekday !== 'number' || !Number.isSafeInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(`${label} workweek_start_weekday must be from 0 through 6.`);
  }
  assertTime(value.workweek_start_time, `${label} workweek_start_time`);
  return value as BackupJob;
}

// fallow-ignore-next-line complexity -- Field-specific failures are pinned by backup.test.ts.
function validateShift(value: unknown, index: number): BackupShift {
  const label = `Shift ${index + 1}`;
  assertPlainObject(value, label);
  assertExactKeys(value, SHIFT_KEYS, label);
  assertNonemptyString(value.id, `${label} id`);
  assertNonemptyString(value.job_id, `${label} job_id`);
  assertString(value.shift_date, `${label} shift_date`);
  if (!parseCalendarDate(value.shift_date)) {
    throw new Error(`${label} shift_date must be a real YYYY-MM-DD date.`);
  }
  assertPositiveInteger(value.duration_seconds, `${label} duration_seconds`);
  assertNonnegativeInteger(value.tips_cents, `${label} tips_cents`);
  assertNonnegativeInteger(value.hourly_rate_cents, `${label} hourly_rate_cents`);
  if (!Number.isSafeInteger(value.duration_seconds * value.hourly_rate_cents)) {
    throw new Error(`${label} wage is too large to calculate safely.`);
  }
  assertNullableString(value.note, `${label} note`);
  assertNullableTimestamp(value.deleted_at, `${label} deleted_at`);
  assertTimestamp(value.created_at, `${label} created_at`);
  assertTimestamp(value.updated_at, `${label} updated_at`);

  const hasStart = value.start_time !== null;
  const hasEnd = value.end_time !== null;
  if (hasStart !== hasEnd) throw new Error(`${label} times must be set together.`);
  if (hasStart) {
    assertTime(value.start_time, `${label} start_time`);
    assertTime(value.end_time, `${label} end_time`);
  }
  return value as BackupShift;
}

// fallow-ignore-next-line complexity -- Every stored field and rejection is pinned by backup.test.ts.
function validateFederalWithholdingSettings(
  value: unknown,
  index: number,
  legacy = false
): BackupFederalWithholdingSettings {
  const label = `Federal withholding setting ${index + 1}`;
  assertPlainObject(value, label);
  assertExactKeys(
    value,
    legacy ? FEDERAL_WITHHOLDING_SETTING_KEYS_V2 : FEDERAL_WITHHOLDING_SETTING_KEYS,
    label
  );
  assertNonemptyString(value.id, `${label} id`);
  assertNonemptyString(value.job_id, `${label} job_id`);
  assertString(value.effective_from, `${label} effective_from`);
  if (!parseCalendarDate(value.effective_from)) {
    throw new Error(`${label} effective_from must be a real YYYY-MM-DD date.`);
  }
  if (
    value.filing_status !== 'single-or-married-filing-separately' &&
    value.filing_status !== 'married-filing-jointly' &&
    value.filing_status !== 'head-of-household'
  ) {
    throw new Error(`${label} filing_status is not supported.`);
  }
  if (![2, 4, 12, 24, 26, 52, 260].includes(value.pay_periods_per_year as number)) {
    throw new Error(`${label} pay_periods_per_year is not supported.`);
  }
  assertBooleanInteger(value.step2_checked, `${label} step2_checked`);
  assertNonnegativeInteger(value.step3_credits_cents, `${label} step3_credits_cents`);
  assertNonnegativeInteger(value.step4a_other_income_cents, `${label} step4a_other_income_cents`);
  assertNonnegativeInteger(value.step4b_deductions_cents, `${label} step4b_deductions_cents`);
  assertNonnegativeInteger(
    value.step4c_extra_withholding_cents,
    `${label} step4c_extra_withholding_cents`
  );
  assertBooleanInteger(value.exempt, `${label} exempt`);
  assertTimestamp(value.created_at, `${label} created_at`);
  assertTimestamp(value.updated_at, `${label} updated_at`);
  if (!legacy) assertNullableTimestamp(value.deleted_at, `${label} deleted_at`);
  return {
    ...(value as Omit<BackupFederalWithholdingSettings, 'deleted_at'>),
    deleted_at: legacy ? null : value.deleted_at as string | null,
  };
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has missing or unknown fields.`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
}

function assertNonemptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be nonempty text.`);
  }
}

function assertNullableString(value: unknown, label: string): asserts value is string | null {
  if (value !== null) assertString(value, label);
}

function assertNonnegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function assertBooleanInteger(value: unknown, label: string): asserts value is number {
  if (value !== 0 && value !== 1) throw new Error(`${label} must be 0 or 1.`);
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${label} must be an ISO timestamp.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}

function assertNullableTimestamp(value: unknown, label: string): asserts value is string | null {
  if (value !== null) assertTimestamp(value, label);
}

// fallow-ignore-next-line complexity -- Invalid shapes and boundaries are pinned by backup.test.ts.
function assertTime(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${label} must be HH:MM.`);
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`${label} must be HH:MM.`);
  }
}

function assertUniqueIds(rows: { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`The backup contains duplicate ${label} id ${row.id}.`);
    ids.add(row.id);
  }
}

function assertUniqueJobDates(rows: BackupFederalWithholdingSettings[]): void {
  const pairs = new Set<string>();
  for (const row of rows) {
    const pair = `${row.job_id}\u0000${row.effective_from}`;
    if (pairs.has(pair)) {
      throw new Error(
        `The backup contains duplicate federal withholding settings for job ${row.job_id} on ${row.effective_from}.`
      );
    }
    pairs.add(pair);
  }
}

function assertSize(text: string): void {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('The backup is larger than 10 MB.');
  }
}

function compareIds<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function canonicalRows(rows: BackupRows): BackupRows {
  return {
    jobs: [...rows.jobs].sort(compareIds),
    shifts: [...rows.shifts].sort(compareIds),
    federal_withholding_settings: [...rows.federal_withholding_settings].sort(compareIds),
  };
}
