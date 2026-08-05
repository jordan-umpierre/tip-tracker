import type {
  FederalWithholdingSettingMutationRecord,
  JobMutationRecord,
  MutationRecord,
  NextMutationSnapshot,
  RemoteChangeBatch,
  RemoteFederalWithholdingSettings,
  RemoteJob,
  RemoteShift,
  SyncEntityType,
} from '../data/sync.ts';

export const MAX_SYNC_RESPONSE_BYTES = 10_500_000;

export class InvalidSyncResponseError extends Error {}

export type RemoteWireChange = {
  changeSequence: number;
  entityId: string;
  entityType: SyncEntityType;
  record: MutationRecord;
  serverCreatedAt: string;
  serverUpdatedAt: string;
  serverVersion: number;
};

export type SyncPage = {
  changes: RemoteWireChange[];
  hasMore: boolean;
  nextCursor: number;
};

const JOB_KEYS = [
  'archivedAt', 'createdAt', 'hourlyRateCents', 'name', 'overtimeEnabled', 'updatedAt',
  'workweekStartTime', 'workweekStartWeekday',
] as const;
const SHIFT_KEYS = [
  'createdAt', 'deletedAt', 'durationSeconds', 'endTime', 'hourlyRateCents', 'jobId',
  'note', 'shiftDate', 'startTime', 'tipsCents', 'updatedAt',
] as const;
const SETTING_KEYS = [
  'createdAt', 'deletedAt', 'effectiveFrom', 'exempt', 'filingStatus', 'jobId',
  'payPeriodsPerYear', 'step2Checked', 'step3CreditsCents', 'step4aOtherIncomeCents',
  'step4bDeductionsCents', 'step4cExtraWithholdingCents', 'updatedAt',
] as const;
const REMOTE_KEYS = [
  'changeSequence', 'entityId', 'entityType', 'record', 'serverCreatedAt',
  'serverUpdatedAt', 'serverVersion',
] as const;
const FILING_STATUSES = new Set([
  'single-or-married-filing-separately',
  'married-filing-jointly',
  'head-of-household',
]);
const PAY_PERIODS = new Set([2, 4, 12, 24, 26, 52, 260]);

export function serializeMutation(snapshot: NextMutationSnapshot): string {
  return JSON.stringify({
    baseServerVersion: snapshot.baseServerVersion,
    deviceId: snapshot.deviceId,
    entityId: snapshot.entityId,
    entityType: snapshot.entityType,
    operation: snapshot.operation,
    operationId: snapshot.operationId,
    record: snapshot.record,
  });
}

export function decodeMutationSuccess(
  value: unknown,
  expectedOperationId: number
): RemoteWireChange {
  const input = readObject(value);
  assertExactKeys(input, ['operationId', 'change']);
  if (readPositiveInteger(input.operationId) !== expectedOperationId) invalid();
  return readRemoteChange(input.change);
}

export function decodeSyncPage(value: unknown, after: number): SyncPage {
  const input = readObject(value);
  assertExactKeys(input, ['changes', 'hasMore', 'nextCursor']);
  if (!Array.isArray(input.changes) || input.changes.length > 100) invalid();
  const changes = input.changes.map(readRemoteChange);
  const hasMore = readBoolean(input.hasMore);
  const nextCursor = readNonnegativeInteger(input.nextCursor);

  let previous = after;
  for (const change of changes) {
    if (change.changeSequence <= previous) invalid();
    previous = change.changeSequence;
  }
  if (changes.length === 0) {
    if (hasMore || nextCursor !== after) invalid();
  } else if (nextCursor !== changes.at(-1)?.changeSequence) {
    invalid();
  }
  if (hasMore && nextCursor <= after) invalid();
  return { changes, hasMore, nextCursor };
}

export function toRemoteBatch(
  accountId: string,
  page: SyncPage
): RemoteChangeBatch {
  const jobs: RemoteJob[] = [];
  const shifts: RemoteShift[] = [];
  const federalWithholdingSettings: RemoteFederalWithholdingSettings[] = [];
  for (const change of page.changes) {
    if (change.entityType === 'job') jobs.push(toRemoteJob(change));
    else if (change.entityType === 'shift') shifts.push(toRemoteShift(change));
    else federalWithholdingSettings.push(toRemoteSetting(change));
  }
  return {
    accountId,
    lastServerChangeSequence: page.nextCursor,
    jobs,
    federalWithholdingSettings,
    shifts,
  };
}

export function readErrorCode(value: unknown): string {
  const input = readObject(value);
  const code = input.error;
  if (typeof code !== 'string' || !/^[a-z0-9_]{1,64}$/.test(code)) {
    return 'invalid_response';
  }
  return code;
}

function readRemoteChange(value: unknown): RemoteWireChange {
  const input = readObject(value);
  assertExactKeys(input, REMOTE_KEYS);
  const entityType = readEntityType(input.entityType);
  return {
    changeSequence: readPositiveInteger(input.changeSequence),
    entityId: readNonemptyText(input.entityId),
    entityType,
    record: readRecord(entityType, input.record),
    serverCreatedAt: readTimestamp(input.serverCreatedAt),
    serverUpdatedAt: readTimestamp(input.serverUpdatedAt),
    serverVersion: readPositiveInteger(input.serverVersion),
  };
}

function readRecord(entityType: SyncEntityType, value: unknown): MutationRecord {
  if (entityType === 'job') return readJob(value);
  if (entityType === 'shift') return readShift(value);
  return readSetting(value);
}

function readJob(value: unknown): JobMutationRecord {
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

function readShift(value: unknown) {
  const input = readObject(value);
  assertExactKeys(input, SHIFT_KEYS);
  const startTime = readNullableTime(input.startTime);
  const endTime = readNullableTime(input.endTime);
  if ((startTime === null) !== (endTime === null)) invalid();
  const durationSeconds = readPositiveInteger(input.durationSeconds);
  const hourlyRateCents = readNonnegativeInteger(input.hourlyRateCents);
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

function readSetting(value: unknown): FederalWithholdingSettingMutationRecord {
  const input = readObject(value);
  assertExactKeys(input, SETTING_KEYS);
  const filingStatus = readText(input.filingStatus);
  const payPeriodsPerYear = readNonnegativeInteger(input.payPeriodsPerYear);
  if (!FILING_STATUSES.has(filingStatus) || !PAY_PERIODS.has(payPeriodsPerYear)) invalid();
  return {
    createdAt: readTimestamp(input.createdAt),
    deletedAt: readNullableTimestamp(input.deletedAt),
    effectiveFrom: readDate(input.effectiveFrom),
    exempt: readBoolean(input.exempt),
    filingStatus: filingStatus as FederalWithholdingSettingMutationRecord['filingStatus'],
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

function toRemoteJob(change: RemoteWireChange): RemoteJob {
  const record = change.record as JobMutationRecord;
  return {
    id: change.entityId,
    name: record.name,
    hourly_rate_cents: record.hourlyRateCents,
    archived_at: record.archivedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    overtime_enabled: record.overtimeEnabled ? 1 : 0,
    workweek_start_weekday: record.workweekStartWeekday,
    workweek_start_time: record.workweekStartTime,
    server_version: change.serverVersion,
    server_change_sequence: change.changeSequence,
  };
}

function toRemoteShift(change: RemoteWireChange): RemoteShift {
  const record = change.record as ReturnType<typeof readShift>;
  return {
    id: change.entityId,
    job_id: record.jobId,
    shift_date: record.shiftDate,
    duration_seconds: record.durationSeconds,
    tips_cents: record.tipsCents,
    hourly_rate_cents: record.hourlyRateCents,
    note: record.note,
    deleted_at: record.deletedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    start_time: record.startTime,
    end_time: record.endTime,
    server_version: change.serverVersion,
    server_change_sequence: change.changeSequence,
  };
}

function toRemoteSetting(change: RemoteWireChange): RemoteFederalWithholdingSettings {
  const record = change.record as FederalWithholdingSettingMutationRecord;
  return {
    id: change.entityId,
    job_id: record.jobId,
    effective_from: record.effectiveFrom,
    filing_status: record.filingStatus,
    pay_periods_per_year: record.payPeriodsPerYear,
    step2_checked: record.step2Checked ? 1 : 0,
    step3_credits_cents: record.step3CreditsCents,
    step4a_other_income_cents: record.step4aOtherIncomeCents,
    step4b_deductions_cents: record.step4bDeductionsCents,
    step4c_extra_withholding_cents: record.step4cExtraWithholdingCents,
    exempt: record.exempt ? 1 : 0,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
    server_version: change.serverVersion,
    server_change_sequence: change.changeSequence,
  };
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid();
  }
}

function readEntityType(value: unknown): SyncEntityType {
  if (value !== 'job' && value !== 'shift' && value !== 'federal_withholding_setting') invalid();
  return value;
}

function readText(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}

function readNonemptyText(value: unknown): string {
  const text = readText(value);
  if (text.length === 0) invalid();
  return text;
}

function readNullableText(value: unknown) {
  return value === null ? null : readText(value);
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid();
  return value;
}

function readPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) invalid();
  return Number(value);
}

function readNonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid();
  return Number(value);
}

function readIntegerInRange(value: unknown, minimum: number, maximum: number) {
  const integer = readNonnegativeInteger(value);
  if (integer < minimum || integer > maximum) invalid();
  return integer;
}

function readTimestamp(value: unknown): string {
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

function invalid(): never {
  throw new InvalidSyncResponseError('The sync response was invalid.');
}
