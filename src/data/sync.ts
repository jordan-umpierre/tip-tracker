import type {
  BackupFederalWithholdingSettings,
  BackupJob,
  BackupShift,
} from '../lib/backup';

export type SyncEntityType = 'job' | 'shift' | 'federal_withholding_setting';

type SQLiteValue = string | number | null;

type SyncTransaction = {
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

export type MutationAcknowledgement = {
  accountId: string;
  localSequence: number;
  entityType: SyncEntityType;
  entityId: string;
  serverVersion: number;
  serverChangeSequence: number;
};

export class SyncAccountMismatchError extends Error {}
export class RemoteChangeConflictError extends Error {}

export async function bindSyncAccount(database: SyncDatabase, accountId: string): Promise<void> {
  assertCanonicalAccountId(accountId);
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await bindAccount(transaction, accountId);
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
     ORDER BY outbox.local_sequence;`
  );
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
          throw new RemoteChangeConflictError(
            `Remote ${entityType} ${row.id} conflicts with a pending local mutation.`
          );
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
