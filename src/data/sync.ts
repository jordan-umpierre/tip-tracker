import type {
  BackupFederalWithholdingSettings,
  BackupJob,
  BackupShift,
} from '../lib/backup';

export type SyncEntityType = 'job' | 'shift' | 'federal_withholding_setting';
export type BlockedMutationKind = 'conflict' | 'permanent';
export type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};

export const MAX_BLOCKED_RESPONSE_BYTES = 10_500_000;

type SQLiteValue = string | number | null;

export type SyncTransaction = {
  getFirstAsync<T>(sql: string, ...params: SQLiteValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SQLiteValue[]): Promise<unknown>;
};

export type SyncDatabase = SyncTransaction & {
  getAllAsync<T>(sql: string, ...params: SQLiteValue[]): Promise<T[]>;
  withExclusiveTransactionAsync(
    task: (transaction: SyncTransaction) => Promise<void>
  ): Promise<void>;
};

type ServerFacts = {
  server_version: number;
  server_change_sequence: number;
};

export type RemoteJob = BackupJob & ServerFacts;
export type RemoteShift = BackupShift & ServerFacts;
export type RemoteFederalWithholdingSettings = BackupFederalWithholdingSettings & ServerFacts;

export type RemoteChangeBatch = {
  accountId: string;
  lastServerChangeSequence: number;
  jobs: RemoteJob[];
  federalWithholdingSettings: RemoteFederalWithholdingSettings[];
  shifts: RemoteShift[];
};

export type PendingMutation = {
  local_sequence: number;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: 'upsert' | 'delete';
  base_server_version: number | null;
};

export type BlockedMutation = PendingMutation & {
  blocked_kind: BlockedMutationKind;
  blocked_code: string;
  blocked_response: { [key: string]: JsonValue };
  blocked_at: string;
};

export type BlockMutation = {
  localSequence: number;
  kind: BlockedMutationKind;
  code: string;
  response: unknown;
};

export type JobMutationRecord = {
  archivedAt: string | null;
  createdAt: string;
  hourlyRateCents: number;
  name: string;
  overtimeEnabled: boolean;
  updatedAt: string;
  workweekStartTime: string;
  workweekStartWeekday: number;
};

export type ShiftMutationRecord = {
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

export type FederalWithholdingSettingMutationRecord = {
  createdAt: string;
  deletedAt: string | null;
  effectiveFrom: string;
  exempt: boolean;
  filingStatus: BackupFederalWithholdingSettings['filing_status'];
  jobId: string;
  payPeriodsPerYear: number;
  step2Checked: boolean;
  step3CreditsCents: number;
  step4aOtherIncomeCents: number;
  step4bDeductionsCents: number;
  step4cExtraWithholdingCents: number;
  updatedAt: string;
};

export type MutationRecord =
  | JobMutationRecord
  | ShiftMutationRecord
  | FederalWithholdingSettingMutationRecord;

export type NextMutationSnapshot = {
  accountId: string;
  baseServerVersion: number | null;
  deviceId: string;
  entityId: string;
  entityType: SyncEntityType;
  operation: 'upsert' | 'delete';
  operationId: number;
  record: MutationRecord | null;
};

export type MutationAcknowledgement = {
  accountId: string;
  localSequence: number;
  entityType: SyncEntityType;
  entityId: string;
  serverVersion: number;
  serverChangeSequence: number;
};

export class SyncAccountMismatchError extends Error {}
export class RemoteChangeConflictError extends Error {
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly localSequence: number;

  constructor(
    entityType: SyncEntityType,
    entityId: string,
    localSequence: number
  ) {
    super(`Remote ${entityType} ${entityId} conflicts with a pending local mutation.`);
    this.entityType = entityType;
    this.entityId = entityId;
    this.localSequence = localSequence;
  }
}
export class StaleMutationError extends Error {}

export type LocalAccountState = {
  accountId: string | null;
  localRecordCount: number;
};

export async function inspectLocalAccountState(
  database: SyncDatabase
): Promise<LocalAccountState> {
  const state = await database.getFirstAsync<{
    account_id: string | null;
    applying_remote: number;
    local_record_count: number;
  }>(
    `SELECT account_id, applying_remote,
            (SELECT count(*) FROM jobs) +
            (SELECT count(*) FROM shifts) +
            (SELECT count(*) FROM federal_withholding_settings)
              AS local_record_count
     FROM sync_state WHERE singleton = 1;`
  );
  if (!state || state.applying_remote !== 0 || !Number.isSafeInteger(state.local_record_count)) {
    throw new Error('The local sync state is unavailable.');
  }
  return { accountId: state.account_id, localRecordCount: state.local_record_count };
}

export async function readDeviceId(database: SyncDatabase): Promise<string> {
  const state = await database.getFirstAsync<{ device_id: string }>(
    'SELECT device_id FROM sync_state WHERE singleton = 1;'
  );
  if (!state || !isCanonicalDeviceId(state.device_id)) {
    throw new Error('The local sync device id is missing or invalid.');
  }
  return state.device_id;
}

export async function readSyncCursor(database: SyncDatabase, accountId: string): Promise<number> {
  assertCanonicalAccountId(accountId);
  const state = await database.getFirstAsync<{
    account_id: string | null;
    last_server_change_sequence: number;
  }>(
    `SELECT account_id, last_server_change_sequence
     FROM sync_state WHERE singleton = 1;`
  );
  if (!state || state.account_id !== accountId) {
    throw new SyncAccountMismatchError('The local database belongs to another account.');
  }
  assertNonnegativeSafeInteger(state.last_server_change_sequence, 'server change cursor');
  return state.last_server_change_sequence;
}

export async function bindSyncAccount(database: SyncDatabase, accountId: string): Promise<void> {
  assertCanonicalAccountId(accountId);
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await bindAccount(transaction, accountId);
  });
}

export async function bindSyncAccountIfEmpty(
  database: SyncDatabase,
  accountId: string
): Promise<boolean> {
  assertCanonicalAccountId(accountId);
  let bound = false;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const count = await readLocalRecordCount(transaction);
    if (count !== 0) return;
    await bindAccount(transaction, accountId);
    bound = true;
  });
  return bound;
}

// Undo the binding after the cloud account behind it is gone for good.
//
// Without this, deleting the cloud account leaves this database pointing at an
// account id the server has tombstoned. Every later sign-in with a new account
// would hit the mismatch guard in bindAccount, and the device could never use
// cloud sync again -- a permanent consequence of an action the user was told
// only removes the cloud copy.
//
// So the device goes back to the state it had before it ever connected: no
// account, no cursor, and no server versions, because a version number issued
// by a deleted account means nothing to the next one. The outbox is rebuilt
// from the rows themselves for the same reason the 4-to-5 migration did it:
// every local row is a fact that has to be offered to whatever account comes
// next, and the entries left from the old one are keyed to versions that no
// longer exist.
//
// The local sequences it hands out keep climbing rather than restarting,
// because sync_outbox.local_sequence is AUTOINCREMENT. That matters: the
// sequence is half of the server's idempotency key, and a reused one would
// collide with a mutation the server already recorded for this device.
export async function releaseSyncAccount(database: SyncDatabase): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const state = await transaction.getFirstAsync<{ applying_remote: number }>(
      'SELECT applying_remote FROM sync_state WHERE singleton = 1;'
    );
    // A pull is mid-apply. Clearing the binding underneath it would leave rows
    // half-applied against an account that no longer owns them.
    if (!state || state.applying_remote !== 0) {
      throw new Error('The local sync state is unavailable.');
    }

    await transaction.runAsync(
      `UPDATE sync_state
       SET account_id = NULL, last_server_change_sequence = 0
       WHERE singleton = 1;`
    );
    await transaction.runAsync('DELETE FROM sync_metadata;');
    // This clears blocked entries too: blocked_kind and the stored response
    // live on the outbox row, and a conflict with a deleted account is not a
    // conflict anyone can resolve.
    await transaction.runAsync('DELETE FROM sync_outbox;');

    // Parents first, matching the order the remote apply uses, so a partially
    // read outbox never offers a shift before the job it belongs to.
    await transaction.runAsync(
      `INSERT INTO sync_outbox (entity_type, entity_id, operation)
       SELECT 'job', id, 'upsert' FROM jobs ORDER BY id;`
    );
    await transaction.runAsync(
      `INSERT INTO sync_outbox (entity_type, entity_id, operation)
       SELECT 'federal_withholding_setting', id, 'upsert'
       FROM federal_withholding_settings ORDER BY id;`
    );
    await transaction.runAsync(
      `INSERT INTO sync_outbox (entity_type, entity_id, operation)
       SELECT 'shift', id, 'upsert' FROM shifts ORDER BY id;`
    );
  });
}

export async function readPendingMutations(database: SyncDatabase): Promise<PendingMutation[]> {
  return database.getAllAsync<PendingMutation>(
    `SELECT outbox.local_sequence, outbox.entity_type, outbox.entity_id,
            outbox.operation, metadata.base_server_version
     FROM sync_outbox AS outbox
     LEFT JOIN sync_metadata AS metadata
       ON metadata.entity_type = outbox.entity_type
      AND metadata.entity_id = outbox.entity_id
     WHERE outbox.blocked_kind IS NULL
     ORDER BY outbox.local_sequence;`
  );
}

export async function readNextMutationSnapshot(
  database: SyncDatabase
): Promise<NextMutationSnapshot | null> {
  let snapshot: NextMutationSnapshot | null = null;

  // SDK 57 scopes transaction queries reliably through the transaction object.
  // The callback performs only SQLite reads and returns before any HTTP starts.
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const pending = await transaction.getFirstAsync<PendingMutation & {
      account_id: string | null;
      device_id: string;
    }>(
      `SELECT state.account_id, state.device_id,
              outbox.local_sequence, outbox.entity_type, outbox.entity_id,
              outbox.operation, metadata.base_server_version
       FROM sync_state AS state
       JOIN sync_outbox AS outbox ON outbox.blocked_kind IS NULL
       LEFT JOIN sync_metadata AS metadata
         ON metadata.entity_type = outbox.entity_type
        AND metadata.entity_id = outbox.entity_id
       WHERE state.singleton = 1
       ORDER BY outbox.local_sequence
       LIMIT 1;`
    );
    if (!pending) return;
    if (pending.account_id === null) {
      throw new SyncAccountMismatchError('The local database is not connected to an account.');
    }
    assertCanonicalAccountId(pending.account_id);
    if (!isCanonicalDeviceId(pending.device_id)) {
      throw new Error('The local sync device id is missing or invalid.');
    }

    const record = pending.operation === 'delete'
      ? null
      : await readMutationRecord(transaction, pending.entity_type, pending.entity_id);
    snapshot = {
      accountId: pending.account_id,
      baseServerVersion: pending.base_server_version,
      deviceId: pending.device_id,
      entityId: pending.entity_id,
      entityType: pending.entity_type,
      operation: pending.operation,
      operationId: pending.local_sequence,
      record,
    };
  });

  return snapshot;
}

export async function acknowledgeUnsyncedPhysicalDelete(
  database: SyncDatabase,
  snapshot: NextMutationSnapshot
): Promise<void> {
  if (
    snapshot.operation !== 'delete' ||
    snapshot.record !== null ||
    snapshot.baseServerVersion !== null
  ) {
    throw new Error('Only an unsynced physical delete can be acknowledged locally.');
  }
  assertCanonicalAccountId(snapshot.accountId);
  assertPositiveSafeInteger(snapshot.operationId, 'local mutation sequence');
  assertEntity(snapshot.entityType, snapshot.entityId);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await bindAccount(transaction, snapshot.accountId);
    const result = await transaction.runAsync(
      `DELETE FROM sync_outbox
       WHERE local_sequence = ? AND entity_type = ? AND entity_id = ?
         AND operation = 'delete'
         AND NOT EXISTS (
           SELECT 1 FROM sync_metadata
           WHERE entity_type = ? AND entity_id = ?
         );`,
      snapshot.operationId,
      snapshot.entityType,
      snapshot.entityId,
      snapshot.entityType,
      snapshot.entityId
    );
    requireOneChangedRow(result, 'The unsynced deletion is no longer current.');
  });
}

export async function readBlockedMutations(database: SyncDatabase): Promise<BlockedMutation[]> {
  const rows = await database.getAllAsync<StoredBlockedMutation>(
    `SELECT outbox.local_sequence, outbox.entity_type, outbox.entity_id,
            outbox.operation, metadata.base_server_version,
            outbox.blocked_kind, outbox.blocked_code,
            outbox.blocked_response_json, outbox.blocked_at
     FROM sync_outbox AS outbox
     LEFT JOIN sync_metadata AS metadata
       ON metadata.entity_type = outbox.entity_type
      AND metadata.entity_id = outbox.entity_id
     WHERE outbox.blocked_kind IS NOT NULL
     ORDER BY outbox.local_sequence;`
  );
  return rows.map(decodeStoredBlockedMutation);
}

export async function readBlockedMutation(
  database: SyncDatabase,
  localSequence: number
): Promise<BlockedMutation | null> {
  assertPositiveSafeInteger(localSequence, 'local mutation sequence');
  const row = await database.getFirstAsync<StoredBlockedMutation>(
    `SELECT outbox.local_sequence, outbox.entity_type, outbox.entity_id,
            outbox.operation, metadata.base_server_version,
            outbox.blocked_kind, outbox.blocked_code,
            outbox.blocked_response_json, outbox.blocked_at
     FROM sync_outbox AS outbox
     LEFT JOIN sync_metadata AS metadata
       ON metadata.entity_type = outbox.entity_type
      AND metadata.entity_id = outbox.entity_id
     WHERE outbox.local_sequence = ? AND outbox.blocked_kind IS NOT NULL;`,
    localSequence
  );
  return row ? decodeStoredBlockedMutation(row) : null;
}

export async function blockMutation(
  database: SyncDatabase,
  blocked: BlockMutation,
  now = new Date()
): Promise<void> {
  assertPositiveSafeInteger(blocked.localSequence, 'local mutation sequence');
  if (blocked.kind !== 'conflict' && blocked.kind !== 'permanent') {
    throw new Error('The blocked mutation kind is not supported.');
  }
  assertBlockedCode(blocked.code);
  const responseJson = encodeBlockedResponse(blocked.response);
  const blockedAt = now.toISOString();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE sync_outbox
       SET blocked_kind = ?, blocked_code = ?, blocked_response_json = ?, blocked_at = ?
       WHERE local_sequence = ?;`,
      blocked.kind,
      blocked.code,
      responseJson,
      blockedAt,
      blocked.localSequence
    );
    requireOneChangedRow(result, 'The local mutation changed before it could be blocked.');
  });
}

export async function persistRemoteMutationConflict(
  database: SyncDatabase,
  input: {
    accountId: string;
    entityId: string;
    entityType: SyncEntityType;
    response: unknown;
  },
  now = new Date()
): Promise<number> {
  assertCanonicalAccountId(input.accountId);
  assertEntity(input.entityType, input.entityId);
  const responseJson = encodeBlockedResponse(input.response);
  const blockedAt = now.toISOString();
  let localSequence = 0;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await bindAccount(transaction, input.accountId);
    const pending = await transaction.getFirstAsync<{ local_sequence: number }>(
      `SELECT local_sequence FROM sync_outbox
       WHERE entity_type = ? AND entity_id = ?;`,
      input.entityType,
      input.entityId
    );
    if (!pending) throw new StaleMutationError('The local mutation is no longer pending.');
    const result = await transaction.runAsync(
      `UPDATE sync_outbox
       SET blocked_kind = 'conflict', blocked_code = 'remote_change_conflict',
           blocked_response_json = ?, blocked_at = ?
       WHERE local_sequence = ?;`,
      responseJson,
      blockedAt,
      pending.local_sequence
    );
    requireOneChangedRow(result, 'The local mutation changed before its conflict was saved.');
    localSequence = pending.local_sequence;
  });
  return localSequence;
}

export async function clearBlockedMutation(
  database: SyncDatabase,
  localSequence: number
): Promise<void> {
  assertPositiveSafeInteger(localSequence, 'local mutation sequence');
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE sync_outbox
       SET blocked_kind = NULL, blocked_code = NULL,
           blocked_response_json = NULL, blocked_at = NULL
       WHERE local_sequence = ? AND blocked_kind IS NOT NULL;`,
      localSequence
    );
    requireOneChangedRow(result, 'The blocked mutation is no longer current.');
  });
}

// Give up on one blocked local change and take whatever the account holds.
//
// clearBlockedMutation above only unblocks: the outbox row stays pending and
// the next push sends it again, against the same base version that was already
// refused. That is the right move after a new local edit, and useless as a way
// out of a conflict.
//
// This is the other half. The outbox row and its remembered server version
// both go, so nothing local is queued for that record and nothing claims to
// know which server version it was built on.
//
// ponytail: it then rewinds the pull cursor to zero, so the next pull walks
// the whole account again and delivers the record's current server state along
// with everything else. Refetching just that one record would be less work for
// the server, but it needs an endpoint that does not exist, and this runs once
// per conflict a person chose to resolve by hand. Add the targeted fetch if
// conflicts ever become common enough to measure.
export async function discardBlockedMutation(
  database: SyncDatabase,
  localSequence: number
): Promise<void> {
  assertPositiveSafeInteger(localSequence, 'local mutation sequence');
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const blocked = await transaction.getFirstAsync<{
      entity_type: SyncEntityType;
      entity_id: string;
    }>(
      `SELECT entity_type, entity_id FROM sync_outbox
       WHERE local_sequence = ? AND blocked_kind IS NOT NULL;`,
      localSequence
    );
    // Gone, or no longer blocked, means someone else already resolved it --
    // most likely a new local edit, which clears the blocked state on its own.
    if (!blocked) {
      throw new Error('The blocked mutation is no longer current.');
    }

    await transaction.runAsync(
      'DELETE FROM sync_outbox WHERE local_sequence = ?;',
      localSequence
    );
    await transaction.runAsync(
      'DELETE FROM sync_metadata WHERE entity_type = ? AND entity_id = ?;',
      blocked.entity_type,
      blocked.entity_id
    );
    await transaction.runAsync(
      'UPDATE sync_state SET last_server_change_sequence = 0 WHERE singleton = 1;'
    );
  });
}

export async function acknowledgeMutation(
  database: SyncDatabase,
  acknowledgement: MutationAcknowledgement
): Promise<void> {
  assertCanonicalAccountId(acknowledgement.accountId);
  assertPositiveSafeInteger(acknowledgement.localSequence, 'local mutation sequence');
  assertEntity(acknowledgement.entityType, acknowledgement.entityId);
  assertServerFacts(acknowledgement.serverVersion, acknowledgement.serverChangeSequence);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await bindAccount(transaction, acknowledgement.accountId);
    await writeMetadata(
      transaction,
      acknowledgement.entityType,
      acknowledgement.entityId,
      acknowledgement.serverVersion,
      acknowledgement.serverChangeSequence
    );

    // The sequence predicate is the in-flight edit guard. A trigger replaces
    // the row with a newer sequence whenever the user changes it again.
    await transaction.runAsync(
      `DELETE FROM sync_outbox
       WHERE local_sequence = ? AND entity_type = ? AND entity_id = ?;`,
      acknowledgement.localSequence,
      acknowledgement.entityType,
      acknowledgement.entityId
    );
  });
}

export async function applyRemoteChanges(
  database: SyncDatabase,
  batch: RemoteChangeBatch
): Promise<void> {
  validateRemoteBatch(batch);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const state = await bindAccount(transaction, batch.accountId);
    if (batch.lastServerChangeSequence < state.last_server_change_sequence) {
      throw new Error('The remote change cursor moved backwards.');
    }

    // A pull cannot overwrite a dirty local row. Advancing the cursor while
    // skipping it would lose the server change, so the whole batch waits for
    // the later conflict contract instead.
    for (const [entityType, rows] of remoteEntityGroups(batch)) {
      for (const row of rows) {
        const pending = await transaction.getFirstAsync<{ local_sequence: number }>(
          `SELECT local_sequence FROM sync_outbox
           WHERE entity_type = ? AND entity_id = ?;`,
          entityType,
          row.id
        );
        if (pending) {
          throw new RemoteChangeConflictError(entityType, row.id, pending.local_sequence);
        }

        const metadata = await transaction.getFirstAsync<{ server_change_sequence: number }>(
          `SELECT server_change_sequence FROM sync_metadata
           WHERE entity_type = ? AND entity_id = ?;`,
          entityType,
          row.id
        );
        if (metadata && row.server_change_sequence < metadata.server_change_sequence) {
          throw new Error(`Remote ${entityType} ${row.id} moved backwards.`);
        }
      }
    }

    await transaction.runAsync(
      'UPDATE sync_state SET applying_remote = 1 WHERE singleton = 1;'
    );

    // Parent jobs must exist before either child table can pass its foreign key.
    for (const job of batch.jobs) await applyJob(transaction, job);
    for (const settings of batch.federalWithholdingSettings) {
      await applyFederalWithholdingSettings(transaction, settings);
    }
    for (const shift of batch.shifts) await applyShift(transaction, shift);

    await transaction.runAsync(
      `UPDATE sync_state
       SET last_server_change_sequence = ?, applying_remote = 0
       WHERE singleton = 1;`,
      batch.lastServerChangeSequence
    );
  });
}

async function bindAccount(transaction: SyncTransaction, accountId: string) {
  const state = await transaction.getFirstAsync<{
    account_id: string | null;
    applying_remote: number;
    last_server_change_sequence: number;
  }>(
    `SELECT account_id, applying_remote, last_server_change_sequence
     FROM sync_state WHERE singleton = 1;`
  );
  if (!state || state.applying_remote !== 0) {
    throw new Error('The local sync state is unavailable.');
  }
  if (state.account_id !== null && state.account_id !== accountId) {
    throw new SyncAccountMismatchError('This local database is bound to another account.');
  }
  if (state.account_id === null) {
    await transaction.runAsync(
      'UPDATE sync_state SET account_id = ? WHERE singleton = 1;',
      accountId
    );
  }
  return state;
}

async function readLocalRecordCount(transaction: SyncTransaction): Promise<number> {
  const row = await transaction.getFirstAsync<{ count: number }>(
    `SELECT (SELECT count(*) FROM jobs) +
            (SELECT count(*) FROM shifts) +
            (SELECT count(*) FROM federal_withholding_settings) AS count;`
  );
  if (!row || !Number.isSafeInteger(row.count) || row.count < 0) {
    throw new Error('The local data count is unavailable.');
  }
  return row.count;
}

async function applyJob(transaction: SyncTransaction, job: RemoteJob) {
  await transaction.runAsync(
    `INSERT INTO jobs
       (id, name, hourly_rate_cents, archived_at, created_at, updated_at,
        overtime_enabled, workweek_start_weekday, workweek_start_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       hourly_rate_cents = excluded.hourly_rate_cents,
       archived_at = excluded.archived_at,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       overtime_enabled = excluded.overtime_enabled,
       workweek_start_weekday = excluded.workweek_start_weekday,
       workweek_start_time = excluded.workweek_start_time;`,
    job.id,
    job.name,
    job.hourly_rate_cents,
    job.archived_at,
    job.created_at,
    job.updated_at,
    job.overtime_enabled,
    job.workweek_start_weekday,
    job.workweek_start_time
  );
  await writeMetadata(
    transaction,
    'job',
    job.id,
    job.server_version,
    job.server_change_sequence
  );
}

async function applyFederalWithholdingSettings(
  transaction: SyncTransaction,
  settings: RemoteFederalWithholdingSettings
) {
  await transaction.runAsync(
    `INSERT INTO federal_withholding_settings
       (id, job_id, effective_from, filing_status, pay_periods_per_year,
        step2_checked, step3_credits_cents, step4a_other_income_cents,
        step4b_deductions_cents, step4c_extra_withholding_cents, exempt,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       job_id = excluded.job_id,
       effective_from = excluded.effective_from,
       filing_status = excluded.filing_status,
       pay_periods_per_year = excluded.pay_periods_per_year,
       step2_checked = excluded.step2_checked,
       step3_credits_cents = excluded.step3_credits_cents,
       step4a_other_income_cents = excluded.step4a_other_income_cents,
       step4b_deductions_cents = excluded.step4b_deductions_cents,
       step4c_extra_withholding_cents = excluded.step4c_extra_withholding_cents,
       exempt = excluded.exempt,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    settings.id,
    settings.job_id,
    settings.effective_from,
    settings.filing_status,
    settings.pay_periods_per_year,
    settings.step2_checked,
    settings.step3_credits_cents,
    settings.step4a_other_income_cents,
    settings.step4b_deductions_cents,
    settings.step4c_extra_withholding_cents,
    settings.exempt,
    settings.created_at,
    settings.updated_at,
    settings.deleted_at
  );
  await writeMetadata(
    transaction,
    'federal_withholding_setting',
    settings.id,
    settings.server_version,
    settings.server_change_sequence
  );
}

async function applyShift(transaction: SyncTransaction, shift: RemoteShift) {
  await transaction.runAsync(
    `INSERT INTO shifts
       (id, job_id, shift_date, start_time, end_time, duration_seconds,
        tips_cents, hourly_rate_cents, note, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       job_id = excluded.job_id,
       shift_date = excluded.shift_date,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       duration_seconds = excluded.duration_seconds,
       tips_cents = excluded.tips_cents,
       hourly_rate_cents = excluded.hourly_rate_cents,
       note = excluded.note,
       deleted_at = excluded.deleted_at,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at;`,
    shift.id,
    shift.job_id,
    shift.shift_date,
    shift.start_time,
    shift.end_time,
    shift.duration_seconds,
    shift.tips_cents,
    shift.hourly_rate_cents,
    shift.note,
    shift.deleted_at,
    shift.created_at,
    shift.updated_at
  );
  await writeMetadata(
    transaction,
    'shift',
    shift.id,
    shift.server_version,
    shift.server_change_sequence
  );
}

async function readMutationRecord(
  transaction: SyncTransaction,
  entityType: SyncEntityType,
  entityId: string
): Promise<MutationRecord> {
  if (entityType === 'job') {
    const row = await transaction.getFirstAsync<BackupJob>(
      `SELECT id, name, hourly_rate_cents, archived_at, created_at, updated_at,
              overtime_enabled, workweek_start_weekday, workweek_start_time
       FROM jobs WHERE id = ?;`,
      entityId
    );
    if (!row) throw new StaleMutationError('The pending job no longer exists.');
    return {
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      hourlyRateCents: row.hourly_rate_cents,
      name: row.name,
      overtimeEnabled: readSQLiteBoolean(row.overtime_enabled),
      updatedAt: row.updated_at,
      workweekStartTime: row.workweek_start_time,
      workweekStartWeekday: row.workweek_start_weekday,
    };
  }

  if (entityType === 'shift') {
    const row = await transaction.getFirstAsync<BackupShift>(
      `SELECT id, job_id, shift_date, start_time, end_time, duration_seconds,
              tips_cents, hourly_rate_cents, note, deleted_at, created_at, updated_at
       FROM shifts WHERE id = ?;`,
      entityId
    );
    if (!row) throw new StaleMutationError('The pending shift no longer exists.');
    return {
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      durationSeconds: row.duration_seconds,
      endTime: row.end_time,
      hourlyRateCents: row.hourly_rate_cents,
      jobId: row.job_id,
      note: row.note,
      shiftDate: row.shift_date,
      startTime: row.start_time,
      tipsCents: row.tips_cents,
      updatedAt: row.updated_at,
    };
  }

  const row = await transaction.getFirstAsync<BackupFederalWithholdingSettings>(
    `SELECT id, job_id, effective_from, filing_status, pay_periods_per_year,
            step2_checked, step3_credits_cents, step4a_other_income_cents,
            step4b_deductions_cents, step4c_extra_withholding_cents, exempt,
            created_at, updated_at, deleted_at
     FROM federal_withholding_settings WHERE id = ?;`,
    entityId
  );
  if (!row) throw new StaleMutationError('The pending withholding settings no longer exist.');
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    effectiveFrom: row.effective_from,
    exempt: readSQLiteBoolean(row.exempt),
    filingStatus: row.filing_status,
    jobId: row.job_id,
    payPeriodsPerYear: row.pay_periods_per_year,
    step2Checked: readSQLiteBoolean(row.step2_checked),
    step3CreditsCents: row.step3_credits_cents,
    step4aOtherIncomeCents: row.step4a_other_income_cents,
    step4bDeductionsCents: row.step4b_deductions_cents,
    step4cExtraWithholdingCents: row.step4c_extra_withholding_cents,
    updatedAt: row.updated_at,
  };
}

function readSQLiteBoolean(value: number): boolean {
  if (value !== 0 && value !== 1) throw new Error('A local sync boolean is invalid.');
  return value === 1;
}

async function writeMetadata(
  transaction: SyncTransaction,
  entityType: SyncEntityType,
  entityId: string,
  serverVersion: number,
  serverChangeSequence: number
) {
  await transaction.runAsync(
    `INSERT INTO sync_metadata
       (entity_type, entity_id, base_server_version, server_change_sequence)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET
       base_server_version = excluded.base_server_version,
       server_change_sequence = excluded.server_change_sequence
     WHERE excluded.server_change_sequence >= sync_metadata.server_change_sequence;`,
    entityType,
    entityId,
    serverVersion,
    serverChangeSequence
  );
}

function remoteEntityGroups(batch: RemoteChangeBatch) {
  return [
    ['job', batch.jobs],
    ['federal_withholding_setting', batch.federalWithholdingSettings],
    ['shift', batch.shifts],
  ] as const;
}

function validateRemoteBatch(batch: RemoteChangeBatch) {
  assertCanonicalAccountId(batch.accountId);
  assertNonnegativeSafeInteger(batch.lastServerChangeSequence, 'server change cursor');

  for (const [entityType, rows] of remoteEntityGroups(batch)) {
    const ids = new Set<string>();
    for (const row of rows) {
      assertEntity(entityType, row.id);
      if (ids.has(row.id)) throw new Error(`Remote ${entityType} ids must be unique.`);
      ids.add(row.id);
      assertServerFacts(row.server_version, row.server_change_sequence);
      if (row.server_change_sequence > batch.lastServerChangeSequence) {
        throw new Error(`Remote ${entityType} ${row.id} is newer than the batch cursor.`);
      }
    }
  }
}

function assertCanonicalAccountId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('The sync account id must be a canonical UUID.');
  }
}

function isCanonicalDeviceId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function assertEntity(entityType: string, entityId: string) {
  if (!['job', 'shift', 'federal_withholding_setting'].includes(entityType)) {
    throw new Error('The sync entity type is not supported.');
  }
  if (typeof entityId !== 'string' || entityId.length === 0) {
    throw new Error('The sync entity id must be nonempty text.');
  }
}

function assertServerFacts(serverVersion: number, serverChangeSequence: number) {
  assertPositiveSafeInteger(serverVersion, 'server version');
  assertPositiveSafeInteger(serverChangeSequence, 'server change sequence');
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be positive.`);
}

function assertNonnegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be nonnegative.`);
}

type StoredBlockedMutation = PendingMutation & {
  blocked_kind: BlockedMutationKind;
  blocked_code: string;
  blocked_response_json: string;
  blocked_at: string;
};

function decodeStoredBlockedMutation(row: StoredBlockedMutation): BlockedMutation {
  const response: unknown = JSON.parse(row.blocked_response_json);
  assertPlainJsonObject(response);
  return {
    local_sequence: row.local_sequence,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    base_server_version: row.base_server_version,
    blocked_kind: row.blocked_kind,
    blocked_code: row.blocked_code,
    blocked_response: response,
    blocked_at: row.blocked_at,
  };
}

function encodeBlockedResponse(response: unknown) {
  assertPlainJsonObject(response);
  const json = JSON.stringify(response);
  if (new TextEncoder().encode(json).byteLength > MAX_BLOCKED_RESPONSE_BYTES) {
    throw new Error('The blocked mutation response is too large.');
  }
  return json;
}

function assertPlainJsonObject(
  value: unknown
): asserts value is { [key: string]: JsonValue } {
  if (!isPlainObject(value)) {
    throw new Error('The blocked mutation response must be a JSON object.');
  }
  assertJsonValue(value, 0, new Set<object>());
}

function assertJsonValue(value: unknown, depth: number, parents: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('The blocked mutation response must be JSON.');
    return;
  }
  if (typeof value !== 'object' || depth > 100 || parents.has(value)) {
    throw new Error('The blocked mutation response must be JSON.');
  }

  parents.add(value);
  for (const nested of readJsonContainerValues(value)) {
    assertJsonValue(nested, depth + 1, parents);
  }
  parents.delete(value);
}

function readJsonContainerValues(value: object): unknown[] {
  if (Array.isArray(value)) return readJsonArrayValues(value);
  if (!isPlainObject(value)) throw new Error('The blocked mutation response must be JSON.');

  const keys = Reflect.ownKeys(value);
  if (keys.length !== Object.keys(value).length || !hasOnlyStringDataProperties(value, keys)) {
    throw new Error('The blocked mutation response must be JSON.');
  }
  return Object.values(value);
}

function readJsonArrayValues(value: unknown[]): unknown[] {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !hasOnlyStringDataProperties(value, keys)) {
    throw new Error('The blocked mutation response must be JSON.');
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error('The blocked mutation response must be JSON.');
  }
  return value;
}

function hasOnlyStringDataProperties(value: object, keys: PropertyKey[]) {
  return keys.every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  });
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertBlockedCode(value: string) {
  if (!/^[a-z0-9_]{1,64}$/.test(value)) {
    throw new Error('The blocked mutation code is invalid.');
  }
}

function requireOneChangedRow(result: unknown, message: string) {
  if (!isPlainObject(result)) throw new Error('SQLite did not return a write result.');
  const changes = result.changes;
  if ((typeof changes !== 'number' && typeof changes !== 'bigint') || Number(changes) !== 1) {
    throw new StaleMutationError(message);
  }
}
