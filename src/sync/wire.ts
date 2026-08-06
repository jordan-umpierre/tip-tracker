// Response-direction decoding: what this app accepts back from the API.
//
// The record shapes and their validators come from contracts/syncFormat.ts,
// shared verbatim with the server. Only the response envelope and the mapping
// into local SQLite rows are the app's own concern, so only those live here.
import {
  assertExactKeys,
  invalid,
  InvalidSyncRecordError,
  readBoolean,
  readEntityType,
  readNonnegativeInteger,
  readNonemptyText,
  readObject,
  readPositiveInteger,
  readSyncRecord,
  readTimestamp,
  type FederalWithholdingSettingRecord,
  type JobRecord,
  type ShiftRecord,
  type SyncEntityType,
  type SyncRecord,
} from '../../contracts/syncFormat.ts';
import type {
  NextMutationSnapshot,
  RemoteChangeBatch,
  RemoteFederalWithholdingSettings,
  RemoteJob,
  RemoteShift,
} from '../data/sync.ts';

export const MAX_SYNC_RESPONSE_BYTES = 10_500_000;

export class InvalidSyncResponseError extends Error {}

// Everything public here funnels through this, so the shared format's error
// never escapes as itself. Callers already branch on InvalidSyncResponseError,
// and the transport treats it as a permanent failure rather than a retry.
function asResponseError(error: unknown): never {
  if (error instanceof InvalidSyncRecordError) {
    throw new InvalidSyncResponseError('The sync response was invalid.');
  }
  throw error;
}

export type RemoteWireChange = {
  changeSequence: number;
  entityId: string;
  entityType: SyncEntityType;
  record: SyncRecord;
  serverCreatedAt: string;
  serverUpdatedAt: string;
  serverVersion: number;
};

export type SyncPage = {
  changes: RemoteWireChange[];
  hasMore: boolean;
  nextCursor: number;
};

const REMOTE_KEYS = [
  'changeSequence', 'entityId', 'entityType', 'record', 'serverCreatedAt',
  'serverUpdatedAt', 'serverVersion',
] as const;

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
  try {
    const input = readObject(value);
    assertExactKeys(input, ['operationId', 'change']);
    if (readPositiveInteger(input.operationId) !== expectedOperationId) invalid();
    return readRemoteChange(input.change);
  } catch (error) {
    asResponseError(error);
  }
}

export function decodeSyncPage(value: unknown, after: number): SyncPage {
  try {
    return readSyncPage(value, after);
  } catch (error) {
    asResponseError(error);
  }
}

function readSyncPage(value: unknown, after: number): SyncPage {
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
  try {
    const input = readObject(value);
    const code = input.error;
    if (typeof code !== 'string' || !/^[a-z0-9_]{1,64}$/.test(code)) {
      return 'invalid_response';
    }
    return code;
  } catch (error) {
    asResponseError(error);
  }
}

function readRemoteChange(value: unknown): RemoteWireChange {
  const input = readObject(value);
  assertExactKeys(input, REMOTE_KEYS);
  const entityType = readEntityType(input.entityType);
  return {
    changeSequence: readPositiveInteger(input.changeSequence),
    entityId: readNonemptyText(input.entityId),
    entityType,
    record: readSyncRecord(entityType, input.record),
    serverCreatedAt: readTimestamp(input.serverCreatedAt),
    serverUpdatedAt: readTimestamp(input.serverUpdatedAt),
    serverVersion: readPositiveInteger(input.serverVersion),
  };
}

function toRemoteJob(change: RemoteWireChange): RemoteJob {
  const record = change.record as JobRecord;
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
  const record = change.record as ShiftRecord;
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
  const record = change.record as FederalWithholdingSettingRecord;
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
