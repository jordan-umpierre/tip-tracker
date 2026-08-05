import { parseCalendarDate } from './dates.ts';

export const MAX_BACKUP_BYTES = 10_000_000;
export const MAX_BACKUP_JOBS = 1_000;
export const MAX_BACKUP_SHIFTS = 20_000;

const FORMAT = 'tip-tracker-backup';
const VERSION = 1;
const SCHEMA_VERSION = 3;

const TOP_LEVEL_KEYS = [
  'format',
  'version',
  'schema_version',
  'exported_at',
  'jobs',
  'shifts',
] as const;

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

export type TipTrackerBackup = {
  format: typeof FORMAT;
  version: typeof VERSION;
  schema_version: typeof SCHEMA_VERSION;
  exported_at: string;
  jobs: BackupJob[];
  shifts: BackupShift[];
};

export type BackupRows = Pick<TipTrackerBackup, 'jobs' | 'shifts'>;

export function buildBackupJson(
  jobs: BackupJob[],
  shifts: BackupShift[],
  exportedAt: Date
): string {
  const backup: TipTrackerBackup = {
    format: FORMAT,
    version: VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: exportedAt.toISOString(),
    jobs: [...jobs].sort(compareIds),
    shifts: [...shifts].sort(compareIds),
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

function validateBackup(value: unknown): TipTrackerBackup {
  assertPlainObject(value, 'The backup');
  assertExactKeys(value, TOP_LEVEL_KEYS, 'The backup');

  if (value.format !== FORMAT) throw new Error('This is not a Tip Tracker backup.');
  if (value.version !== VERSION) throw new Error('This backup version is not supported.');
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new Error('This backup database version is not supported.');
  }
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

  const jobs = value.jobs.map(validateJob);
  const shifts = value.shifts.map(validateShift);
  assertUniqueIds(jobs, 'job');
  assertUniqueIds(shifts, 'shift');

  const jobIds = new Set(jobs.map((job) => job.id));
  for (const shift of shifts) {
    if (!jobIds.has(shift.job_id)) {
      throw new Error(`Shift ${shift.id} refers to a job that is not in the backup.`);
    }
  }

  return {
    format: FORMAT,
    version: VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: value.exported_at,
    jobs: [...jobs].sort(compareIds),
    shifts: [...shifts].sort(compareIds),
  };
}

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
  };
}
