// The sync wire format, defined once.
//
// This file sits outside both src/ and server/ on purpose: neither the app nor
// the API owns the format they speak to each other. It used to live in both,
// as two hand-written copies that were only ever tested against their own idea
// of the contract. They drifted, pulled dates came back in the wrong shape, and
// both test suites stayed green while sync was broken end to end.
//
// Everything here is the part both sides genuinely share: the record shapes,
// and the primitives that validate them. Anything that belongs to one direction
// only -- parsing a mutation request, decoding a paged response -- stays in the
// side that needs it.
//
// There are no imports, deliberately. The server loads this file with plain
// node and the app bundles it through Metro, so it must not pull in anything
// from either environment.

export type SyncEntityType = 'job' | 'shift' | 'federal_withholding_setting';

export type JobRecord = {
  archivedAt: string | null;
  createdAt: string;
  hourlyRateCents: number;
  name: string;
  overtimeEnabled: boolean;
  updatedAt: string;
  workweekStartTime: string;
  workweekStartWeekday: number;
};

export type ShiftRecord = {
  createdAt: string;
  deletedAt: string | null;
  durationSeconds: number;
  endTime: string | null;
  hourlyRateCents: number;
  jobId: string;
  note: string | null;
  shiftDate: string;
  startTime: string | null;
  tipsCents: number;
  updatedAt: string;
};

export type FederalWithholdingSettingRecord = {
  createdAt: string;
  deletedAt: string | null;
  effectiveFrom: string;
  exempt: boolean;
  filingStatus:
    | 'single-or-married-filing-separately'
    | 'married-filing-jointly'
    | 'head-of-household';
  jobId: string;
  payPeriodsPerYear: number;
  step2Checked: boolean;
  step3CreditsCents: number;
  step4aOtherIncomeCents: number;
  step4bDeductionsCents: number;
  step4cExtraWithholdingCents: number;
  updatedAt: string;
};

export type SyncRecord = JobRecord | ShiftRecord | FederalWithholdingSettingRecord;

// One error for anything malformed found in here. Each side catches it at its
// own entry point and rethrows the error its callers already handle: a bad
// request on the server, a bad response in the app. That keeps the two public
// error types intact without this file needing to know which side it is on.
export class InvalidSyncRecordError extends Error {}

const JOB_KEYS = [
  'archivedAt', 'createdAt', 'hourlyRateCents', 'name', 'overtimeEnabled', 'updatedAt',
  'workweekStartTime', 'workweekStartWeekday',
] as const;
const SHIFT_KEYS = [
  'createdAt', 'deletedAt', 'durationSeconds', 'endTime', 'hourlyRateCents', 'jobId',
  'note', 'shiftDate', 'startTime', 'tipsCents', 'updatedAt',
] as const;
const FEDERAL_SETTING_KEYS = [
  'createdAt', 'deletedAt', 'effectiveFrom', 'exempt', 'filingStatus', 'jobId',
  'payPeriodsPerYear', 'step2Checked', 'step3CreditsCents', 'step4aOtherIncomeCents',
  'step4bDeductionsCents', 'step4cExtraWithholdingCents', 'updatedAt',
] as const;
const FILING_STATUSES = new Set([
  'single-or-married-filing-separately',
  'married-filing-jointly',
  'head-of-household',
]);
const PAY_PERIODS = new Set([2, 4, 12, 24, 26, 52, 260]);

export function invalid(): never {
  throw new InvalidSyncRecordError('Invalid sync record');
}

export function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

// Exact rather than "at least these": an unexpected key means the two sides
// disagree about the format, and guessing which side is right is how a field
// silently stops being sent.
export function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid();
  }
}

export function readEntityType(value: unknown): SyncEntityType {
  if (value !== 'job' && value !== 'shift' && value !== 'federal_withholding_setting') invalid();
  return value;
}

export function readText(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}

export function readNonemptyText(value: unknown): string {
  const text = readText(value);
  if (text.length === 0) invalid();
  return text;
}

function readNullableText(value: unknown) {
  return value === null ? null : readText(value);
}

export function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid();
  return value;
}

export function readPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) invalid();
  return Number(value);
}

export function readNonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid();
  return Number(value);
}

function readIntegerInRange(value: unknown, minimum: number, maximum: number) {
  const integer = readNonnegativeInteger(value);
  if (integer < minimum || integer > maximum) invalid();
  return integer;
}

// Round-tripping through Date and comparing back to the input is what rejects
// "2026-1-5" and "2026-02-31": both parse, neither survives the comparison.
export function readTimestamp(value: unknown): string {
  const text = readText(value);
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) invalid();
  return text;
}

function readNullableTimestamp(value: unknown) {
  return value === null ? null : readTimestamp(value);
}

function readTime(value: unknown): string {
  const text = readText(value);
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(text)) invalid();
  return text;
}

function readNullableTime(value: unknown) {
  return value === null ? null : readTime(value);
}

function readDate(value: unknown): string {
  const text = readText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) invalid();
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) invalid();
  return text;
}

export function readSyncRecord(entityType: SyncEntityType, value: unknown): SyncRecord {
  if (entityType === 'job') return readJob(value);
  if (entityType === 'shift') return readShift(value);
  return readFederalSetting(value);
}

function readJob(value: unknown): JobRecord {
  const input = readObject(value);
  assertExactKeys(input, JOB_KEYS);
  return {
    archivedAt: readNullableTimestamp(input.archivedAt),
    createdAt: readTimestamp(input.createdAt),
    hourlyRateCents: readNonnegativeInteger(input.hourlyRateCents),
    name: readText(input.name),
    overtimeEnabled: readBoolean(input.overtimeEnabled),
    updatedAt: readTimestamp(input.updatedAt),
    workweekStartTime: readTime(input.workweekStartTime),
    workweekStartWeekday: readIntegerInRange(input.workweekStartWeekday, 0, 6),
  };
}

function readShift(value: unknown): ShiftRecord {
  const input = readObject(value);
  assertExactKeys(input, SHIFT_KEYS);
  // A shift either has both clock times or neither. One alone means the sender
  // lost half a pair somewhere, which is not something to store and forget.
  const startTime = readNullableTime(input.startTime);
  const endTime = readNullableTime(input.endTime);
  if ((startTime === null) !== (endTime === null)) invalid();
  const durationSeconds = readPositiveInteger(input.durationSeconds);
  const hourlyRateCents = readNonnegativeInteger(input.hourlyRateCents);
  // Gross pay is computed from these two later. Rejecting the pair that would
  // overflow here keeps that arithmetic exact everywhere downstream.
  if (!Number.isSafeInteger(durationSeconds * hourlyRateCents)) invalid();
  return {
    createdAt: readTimestamp(input.createdAt),
    deletedAt: readNullableTimestamp(input.deletedAt),
    durationSeconds,
    endTime,
    hourlyRateCents,
    jobId: readNonemptyText(input.jobId),
    note: readNullableText(input.note),
    shiftDate: readDate(input.shiftDate),
    startTime,
    tipsCents: readNonnegativeInteger(input.tipsCents),
    updatedAt: readTimestamp(input.updatedAt),
  };
}

function readFederalSetting(value: unknown): FederalWithholdingSettingRecord {
  const input = readObject(value);
  assertExactKeys(input, FEDERAL_SETTING_KEYS);
  const filingStatus = readText(input.filingStatus);
  const payPeriodsPerYear = readNonnegativeInteger(input.payPeriodsPerYear);
  if (!FILING_STATUSES.has(filingStatus) || !PAY_PERIODS.has(payPeriodsPerYear)) invalid();
  return {
    createdAt: readTimestamp(input.createdAt),
    deletedAt: readNullableTimestamp(input.deletedAt),
    effectiveFrom: readDate(input.effectiveFrom),
    exempt: readBoolean(input.exempt),
    filingStatus: filingStatus as FederalWithholdingSettingRecord['filingStatus'],
    jobId: readNonemptyText(input.jobId),
    payPeriodsPerYear,
    step2Checked: readBoolean(input.step2Checked),
    step3CreditsCents: readNonnegativeInteger(input.step3CreditsCents),
    step4aOtherIncomeCents: readNonnegativeInteger(input.step4aOtherIncomeCents),
    step4bDeductionsCents: readNonnegativeInteger(input.step4bDeductionsCents),
    step4cExtraWithholdingCents: readNonnegativeInteger(input.step4cExtraWithholdingCents),
    updatedAt: readTimestamp(input.updatedAt),
  };
}
