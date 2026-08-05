import { createHash } from "node:crypto";

import type pg from "pg";

import {
  InvalidSyncQueryError,
  InvalidSyncRequestError,
  parseChangesQuery,
  parseSyncMutation,
  type FederalWithholdingSettingRecord,
  type JobRecord,
  type ShiftRecord,
  type SyncEntityType,
  type SyncMutation,
  type SyncRecord,
} from "./syncContract.ts";

type SyncConnection = pg.PoolClient;
type SyncDatabase = Pick<pg.Pool, "connect">;

export type RemoteChange = {
  changeSequence: number;
  entityId: string;
  entityType: SyncEntityType;
  record: SyncRecord;
  serverCreatedAt: string;
  serverUpdatedAt: string;
  serverVersion: number;
};

export type SyncResponse = {
  body: Record<string, unknown>;
  status: 200 | 409;
};

export type SyncService = ReturnType<typeof createSyncService>;

type DomainRow = Record<string, unknown> & {
  change_sequence: string;
  client_created_at: Date;
  client_updated_at: Date;
  created_at: Date;
  id: string;
  server_version: string;
  updated_at: Date;
};

export function createSyncService(database: SyncDatabase) {
  return {
    async listChanges(accountId: string, input: unknown) {
      const query = parseChangesQuery(input);
      const connection = await database.connect();
      try {
        const result = await connection.query<DomainRow & { entity_type: SyncEntityType }>(
          CHANGES_SQL,
          [accountId, query.after, query.limit + 1],
        );
        const hasMore = result.rows.length > query.limit;
        const emitted = result.rows.slice(0, query.limit);
        const changes = emitted.map((row) => serializeRemote(row.entity_type, row));
        return {
          changes,
          hasMore,
          nextCursor: changes.at(-1)?.changeSequence ?? query.after,
        };
      } finally {
        connection.release();
      }
    },

    async mutate(accountId: string, input: unknown): Promise<SyncResponse> {
      const mutation = parseSyncMutation(input);
      const checksum = checksumMutation(mutation);
      const connection = await database.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [JSON.stringify([accountId, mutation.deviceId, mutation.operationId])],
        );
        const replay = await readReplay(
          connection,
          accountId,
          mutation.deviceId,
          mutation.operationId,
        );
        if (replay) {
          await connection.query("COMMIT");
          if (replay.request_checksum !== checksum) {
            return { status: 409, body: { error: "idempotency_key_reused" } };
          }
          return { status: replay.response_status, body: replay.response_body };
        }

        await lockMutation(connection, accountId, mutation);
        const response = await applyMutation(connection, accountId, mutation);
        await connection.query(
          `INSERT INTO app.sync_operations
            (account_id, device_id, operation_id, request_checksum, response_status, response_body)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [accountId, mutation.deviceId, mutation.operationId, checksum, response.status, response.body],
        );
        await connection.query("COMMIT");
        return response;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}

const CHANGES_SQL = `
  SELECT * FROM (
    SELECT 'job'::text AS entity_type, id, server_version, change_sequence,
      created_at, updated_at, client_created_at, client_updated_at,
      name, hourly_rate_cents, archived_at, overtime_enabled,
      workweek_start_weekday, workweek_start_time,
      NULL::text AS job_id, NULL::date AS shift_date,
      NULL::text AS start_time, NULL::text AS end_time,
      NULL::bigint AS duration_seconds, NULL::bigint AS tips_cents,
      NULL::text AS note, NULL::timestamptz AS deleted_at,
      NULL::date AS effective_from, NULL::text AS filing_status,
      NULL::smallint AS pay_periods_per_year, NULL::boolean AS step2_checked,
      NULL::bigint AS step3_credits_cents,
      NULL::bigint AS step4a_other_income_cents,
      NULL::bigint AS step4b_deductions_cents,
      NULL::bigint AS step4c_extra_withholding_cents,
      NULL::boolean AS exempt
    FROM app.jobs WHERE account_id = $1 AND change_sequence > $2
    UNION ALL
    SELECT 'shift'::text, id, server_version, change_sequence,
      created_at, updated_at, client_created_at, client_updated_at,
      NULL::text, hourly_rate_cents, NULL::timestamptz, NULL::boolean,
      NULL::smallint, NULL::text,
      job_id, shift_date, start_time, end_time, duration_seconds, tips_cents,
      note, deleted_at, NULL::date, NULL::text, NULL::smallint, NULL::boolean,
      NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, NULL::boolean
    FROM app.shifts WHERE account_id = $1 AND change_sequence > $2
    UNION ALL
    SELECT 'federal_withholding_setting'::text, id, server_version, change_sequence,
      created_at, updated_at, client_created_at, client_updated_at,
      NULL::text, NULL::bigint, NULL::timestamptz, NULL::boolean,
      NULL::smallint, NULL::text,
      job_id, NULL::date, NULL::text, NULL::text, NULL::bigint, NULL::bigint,
      NULL::text, deleted_at, effective_from, filing_status, pay_periods_per_year,
      step2_checked, step3_credits_cents, step4a_other_income_cents,
      step4b_deductions_cents, step4c_extra_withholding_cents, exempt
    FROM app.federal_withholding_settings
    WHERE account_id = $1 AND change_sequence > $2
  ) AS changes
  ORDER BY change_sequence
  LIMIT $3`;

async function readReplay(
  connection: SyncConnection,
  accountId: string,
  deviceId: string,
  operationId: number,
) {
  const result = await connection.query<{
    request_checksum: string;
    response_body: Record<string, unknown>;
    response_status: 200 | 409;
  }>(
    `SELECT request_checksum, response_status, response_body
     FROM app.sync_operations
     WHERE account_id = $1 AND device_id = $2 AND operation_id = $3`,
    [accountId, deviceId, operationId],
  );
  return result.rows[0];
}

async function lockMutation(
  connection: SyncConnection,
  accountId: string,
  mutation: SyncMutation,
) {
  await connection.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [JSON.stringify([accountId, mutation.entityType, mutation.entityId])],
  );
  if (mutation.entityType === "federal_withholding_setting" && mutation.record) {
    const record = mutation.record as FederalWithholdingSettingRecord;
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [JSON.stringify([accountId, "setting-date", record.jobId, record.effectiveFrom])],
    );
  }
}

async function applyMutation(
  connection: SyncConnection,
  accountId: string,
  mutation: SyncMutation,
): Promise<SyncResponse> {
  const current = await readRemote(connection, accountId, mutation.entityType, mutation.entityId);
  const versionConflict = findVersionConflict(mutation, current);
  if (versionConflict) return versionConflict;

  const writeConflict = await applyRequestedChange(connection, accountId, mutation);
  if (writeConflict) return writeConflict;

  const changed = await readRemote(connection, accountId, mutation.entityType, mutation.entityId);
  if (!changed) throw new Error("Sync mutation did not produce a remote row");
  return { status: 200, body: { operationId: mutation.operationId, change: changed } };
}

function findVersionConflict(mutation: SyncMutation, current: RemoteChange | null) {
  if (mutation.baseServerVersion === null) {
    return conflictIfPresent(mutation.operationId, current);
  }
  return conflictUnlessVersionMatches(mutation, current);
}

function conflictIfPresent(operationId: number, current: RemoteChange | null) {
  return current ? conflict("version_conflict", operationId, current) : null;
}

function conflictUnlessVersionMatches(mutation: SyncMutation, current: RemoteChange | null) {
  if (current?.serverVersion === mutation.baseServerVersion) return null;
  return conflict("version_conflict", mutation.operationId, current);
}

async function applyRequestedChange(
  connection: SyncConnection,
  accountId: string,
  mutation: SyncMutation,
) {
  if (mutation.operation === "delete") {
    await retainTombstone(connection, accountId, mutation.entityType, mutation.entityId);
    return null;
  }
  const relationConflict = await findRelationConflict(connection, accountId, mutation);
  if (relationConflict) return relationConflict;
  await writeRecord(connection, accountId, mutation);
  return null;
}

async function findRelationConflict(
  connection: SyncConnection,
  accountId: string,
  mutation: SyncMutation,
): Promise<SyncResponse | null> {
  if (mutation.entityType === "job") return null;
  const record = mutation.record as ShiftRecord | FederalWithholdingSettingRecord;
  const parentConflict = await findParentConflict(
    connection,
    accountId,
    mutation.operationId,
    record.jobId,
  );
  if (parentConflict) return parentConflict;
  if (mutation.entityType !== "federal_withholding_setting") return null;
  return findDuplicateSettingConflict(connection, accountId, mutation);
}

async function findParentConflict(
  connection: SyncConnection,
  accountId: string,
  operationId: number,
  jobId: string,
) {
  const parent = await connection.query(
    "SELECT 1 FROM app.jobs WHERE account_id = $1 AND id = $2",
    [accountId, jobId],
  );
  return parent.rowCount === 1 ? null : conflict("parent_missing", operationId, null);
}

async function findDuplicateSettingConflict(
  connection: SyncConnection,
  accountId: string,
  mutation: SyncMutation,
) {
  const setting = mutation.record as FederalWithholdingSettingRecord;
  const duplicate = await connection.query<{ id: string }>(
    `SELECT id FROM app.federal_withholding_settings
     WHERE account_id = $1 AND job_id = $2 AND effective_from = $3 AND id <> $4`,
    [accountId, setting.jobId, setting.effectiveFrom, mutation.entityId],
  );
  if (!duplicate.rows[0]) return null;
  const remote = await readRemote(
    connection,
    accountId,
    "federal_withholding_setting",
    duplicate.rows[0].id,
  );
  return conflict("unique_conflict", mutation.operationId, remote);
}

function conflict(
  error: "version_conflict" | "parent_missing" | "unique_conflict",
  operationId: number,
  remote: RemoteChange | null,
): SyncResponse {
  return { status: 409, body: { error, operationId, remote } };
}

async function writeRecord(connection: SyncConnection, accountId: string, mutation: SyncMutation) {
  if (mutation.entityType === "job") {
    await writeJob(connection, accountId, mutation.entityId, mutation.record as JobRecord);
    return;
  }
  if (mutation.entityType === "shift") {
    await writeShift(connection, accountId, mutation.entityId, mutation.record as ShiftRecord);
    return;
  }
  await writeFederalSetting(
    connection,
    accountId,
    mutation.entityId,
    mutation.record as FederalWithholdingSettingRecord,
  );
}

async function writeJob(
  connection: SyncConnection,
  accountId: string,
  entityId: string,
  record: JobRecord,
) {
  await connection.query(
    `INSERT INTO app.jobs
      (account_id, id, name, hourly_rate_cents, archived_at, overtime_enabled,
       workweek_start_weekday, workweek_start_time, client_created_at, client_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (account_id, id) DO UPDATE SET
       name = EXCLUDED.name, hourly_rate_cents = EXCLUDED.hourly_rate_cents,
       archived_at = EXCLUDED.archived_at, overtime_enabled = EXCLUDED.overtime_enabled,
       workweek_start_weekday = EXCLUDED.workweek_start_weekday,
       workweek_start_time = EXCLUDED.workweek_start_time,
       client_created_at = EXCLUDED.client_created_at,
       client_updated_at = EXCLUDED.client_updated_at`,
    [accountId, entityId, record.name, record.hourlyRateCents, record.archivedAt,
      record.overtimeEnabled, record.workweekStartWeekday, record.workweekStartTime,
      record.createdAt, record.updatedAt],
  );
}

async function writeShift(
  connection: SyncConnection,
  accountId: string,
  entityId: string,
  record: ShiftRecord,
) {
  await connection.query(
    `INSERT INTO app.shifts
      (account_id, id, job_id, shift_date, start_time, end_time, duration_seconds,
       tips_cents, hourly_rate_cents, note, deleted_at, client_created_at, client_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (account_id, id) DO UPDATE SET
       job_id = EXCLUDED.job_id, shift_date = EXCLUDED.shift_date,
       start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
       duration_seconds = EXCLUDED.duration_seconds, tips_cents = EXCLUDED.tips_cents,
       hourly_rate_cents = EXCLUDED.hourly_rate_cents, note = EXCLUDED.note,
       deleted_at = EXCLUDED.deleted_at, client_created_at = EXCLUDED.client_created_at,
       client_updated_at = EXCLUDED.client_updated_at`,
    [accountId, entityId, record.jobId, record.shiftDate, record.startTime, record.endTime,
      record.durationSeconds, record.tipsCents, record.hourlyRateCents, record.note,
      record.deletedAt, record.createdAt, record.updatedAt],
  );
}

async function writeFederalSetting(
  connection: SyncConnection,
  accountId: string,
  entityId: string,
  record: FederalWithholdingSettingRecord,
) {
  await connection.query(
    `INSERT INTO app.federal_withholding_settings
      (account_id, id, job_id, effective_from, filing_status, pay_periods_per_year,
       step2_checked, step3_credits_cents, step4a_other_income_cents,
       step4b_deductions_cents, step4c_extra_withholding_cents, exempt, deleted_at,
       client_created_at, client_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (account_id, id) DO UPDATE SET
       job_id = EXCLUDED.job_id, effective_from = EXCLUDED.effective_from,
       filing_status = EXCLUDED.filing_status,
       pay_periods_per_year = EXCLUDED.pay_periods_per_year,
       step2_checked = EXCLUDED.step2_checked,
       step3_credits_cents = EXCLUDED.step3_credits_cents,
       step4a_other_income_cents = EXCLUDED.step4a_other_income_cents,
       step4b_deductions_cents = EXCLUDED.step4b_deductions_cents,
       step4c_extra_withholding_cents = EXCLUDED.step4c_extra_withholding_cents,
       exempt = EXCLUDED.exempt, deleted_at = EXCLUDED.deleted_at,
       client_created_at = EXCLUDED.client_created_at,
       client_updated_at = EXCLUDED.client_updated_at`,
    [accountId, entityId, record.jobId, record.effectiveFrom, record.filingStatus,
      record.payPeriodsPerYear, record.step2Checked, record.step3CreditsCents,
      record.step4aOtherIncomeCents, record.step4bDeductionsCents,
      record.step4cExtraWithholdingCents, record.exempt, record.deletedAt,
      record.createdAt, record.updatedAt],
  );
}

async function retainTombstone(
  connection: SyncConnection,
  accountId: string,
  entityType: SyncEntityType,
  entityId: string,
) {
  const table = entityType === "shift" ? "shifts" : "federal_withholding_settings";
  await connection.query(
    `UPDATE app.${table}
     SET deleted_at = COALESCE(deleted_at, transaction_timestamp())
     WHERE account_id = $1 AND id = $2`,
    [accountId, entityId],
  );
}

async function readRemote(
  connection: SyncConnection,
  accountId: string,
  entityType: SyncEntityType,
  entityId: string,
): Promise<RemoteChange | null> {
  const result = await connection.query<DomainRow>(remoteSelect(entityType), [accountId, entityId]);
  const row = result.rows[0];
  return row ? serializeRemote(entityType, row) : null;
}

function remoteSelect(entityType: SyncEntityType) {
  const common = `id, server_version, change_sequence, created_at, updated_at,
    client_created_at, client_updated_at`;
  if (entityType === "job") {
    return `SELECT ${common}, name, hourly_rate_cents, archived_at, overtime_enabled,
      workweek_start_weekday, workweek_start_time
      FROM app.jobs WHERE account_id = $1 AND id = $2`;
  }
  if (entityType === "shift") {
    return `SELECT ${common}, job_id, shift_date, start_time, end_time, duration_seconds,
      tips_cents, hourly_rate_cents, note, deleted_at
      FROM app.shifts WHERE account_id = $1 AND id = $2`;
  }
  return `SELECT ${common}, job_id, effective_from, filing_status, pay_periods_per_year,
    step2_checked, step3_credits_cents, step4a_other_income_cents,
    step4b_deductions_cents, step4c_extra_withholding_cents, exempt, deleted_at
    FROM app.federal_withholding_settings WHERE account_id = $1 AND id = $2`;
}

function serializeRemote(entityType: SyncEntityType, row: DomainRow): RemoteChange {
  return {
    changeSequence: safeDatabaseInteger(row.change_sequence),
    entityId: row.id,
    entityType,
    record: serializeRecord(entityType, row),
    serverCreatedAt: row.created_at.toISOString(),
    serverUpdatedAt: row.updated_at.toISOString(),
    serverVersion: safeDatabaseInteger(row.server_version),
  };
}

function serializeRecord(entityType: SyncEntityType, row: DomainRow): SyncRecord {
  if (entityType === "job") {
    return {
      archivedAt: nullableDate(row.archived_at),
      createdAt: row.client_created_at.toISOString(),
      hourlyRateCents: safeDatabaseInteger(row.hourly_rate_cents),
      name: String(row.name),
      overtimeEnabled: Boolean(row.overtime_enabled),
      updatedAt: row.client_updated_at.toISOString(),
      workweekStartTime: String(row.workweek_start_time),
      workweekStartWeekday: Number(row.workweek_start_weekday),
    };
  }
  if (entityType === "shift") {
    return {
      createdAt: row.client_created_at.toISOString(),
      deletedAt: nullableDate(row.deleted_at),
      durationSeconds: safeDatabaseInteger(row.duration_seconds),
      endTime: nullableText(row.end_time),
      hourlyRateCents: safeDatabaseInteger(row.hourly_rate_cents),
      jobId: String(row.job_id),
      note: nullableText(row.note),
      shiftDate: String(row.shift_date),
      startTime: nullableText(row.start_time),
      tipsCents: safeDatabaseInteger(row.tips_cents),
      updatedAt: row.client_updated_at.toISOString(),
    };
  }
  return {
    createdAt: row.client_created_at.toISOString(),
    deletedAt: nullableDate(row.deleted_at),
    effectiveFrom: String(row.effective_from),
    exempt: Boolean(row.exempt),
    filingStatus: String(row.filing_status) as FederalWithholdingSettingRecord["filingStatus"],
    jobId: String(row.job_id),
    payPeriodsPerYear: Number(row.pay_periods_per_year),
    step2Checked: Boolean(row.step2_checked),
    step3CreditsCents: safeDatabaseInteger(row.step3_credits_cents),
    step4aOtherIncomeCents: safeDatabaseInteger(row.step4a_other_income_cents),
    step4bDeductionsCents: safeDatabaseInteger(row.step4b_deductions_cents),
    step4cExtraWithholdingCents: safeDatabaseInteger(row.step4c_extra_withholding_cents),
    updatedAt: row.client_updated_at.toISOString(),
  };
}

function checksumMutation(mutation: SyncMutation) {
  return createHash("sha256").update(JSON.stringify(mutation)).digest("hex");
}

function safeDatabaseInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the sync wire limit");
  return number;
}

function nullableDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : null;
}

function nullableText(value: unknown) {
  return value === null ? null : String(value);
}

export { InvalidSyncQueryError, InvalidSyncRequestError };
