import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  acknowledgeMutation,
  acknowledgeUnsyncedPhysicalDelete,
  applyRemoteChanges,
  bindSyncAccountIfEmpty,
  bindSyncAccount,
  blockMutation,
  clearBlockedMutation,
  MAX_BLOCKED_RESPONSE_BYTES,
  inspectLocalAccountState,
  readBlockedMutation,
  readBlockedMutations,
  readDeviceId,
  readNextMutationSnapshot,
  readPendingMutations,
  releaseSyncAccount,
  RemoteChangeConflictError,
  StaleMutationError,
  SyncAccountMismatchError,
} from './sync.ts';
import type {
  RemoteChangeBatch,
  RemoteFederalWithholdingSettings,
  RemoteJob,
  RemoteShift,
  SyncDatabase,
} from './sync.ts';

const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-08-05T12:00:00.000Z';
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

type Value = string | number | null;

class TestDatabase implements SyncDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path = ':memory:', initialize = true) {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    if (initialize) this.sqlite.exec(schema);
  }

  close() {
    this.sqlite.close();
  }

  async getFirstAsync<T>(sql: string, ...params: Value[]): Promise<T | null> {
    return (this.sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, ...params: Value[]): Promise<T[]> {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }

  async runAsync(sql: string, ...params: Value[]): Promise<unknown> {
    return this.sqlite.prepare(sql).run(...params);
  }

  async withExclusiveTransactionAsync(
    task: (transaction: TestDatabase) => Promise<void>
  ): Promise<void> {
    this.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      await task(this);
      this.sqlite.exec('COMMIT;');
    } catch (cause) {
      this.sqlite.exec('ROLLBACK;');
      throw cause;
    }
  }
}

class AtomicSnapshotDatabase extends TestDatabase {
  readonly concurrent: DatabaseSync;
  blockedConcurrentEdit = false;

  constructor(path: string) {
    super(path);
    this.concurrent = new DatabaseSync(path);
    this.concurrent.exec('PRAGMA busy_timeout = 0;');
  }

  override close() {
    this.concurrent.close();
    super.close();
  }

  override async getFirstAsync<T>(sql: string, ...params: Value[]): Promise<T | null> {
    const row = await super.getFirstAsync<T>(sql, ...params);
    if (!this.blockedConcurrentEdit && sql.includes('FROM sync_state AS state')) {
      this.blockedConcurrentEdit = true;
      assert.throws(
        () => this.concurrent.prepare(
          "UPDATE jobs SET name = 'Concurrent', updated_at = '2026-08-05T13:00:00.000Z' WHERE id = 'job-a';"
        ).run(),
        /locked/
      );
    }
    return row;
  }
}

async function insertLocalJob(database: TestDatabase, name = 'Diner') {
  await database.runAsync(
    `INSERT INTO jobs
       (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
     VALUES ('job-a', ?, 1000, NULL, ?, ?);`,
    name,
    NOW,
    NOW
  );
}

function job(changes: Partial<RemoteJob> = {}): RemoteJob {
  return {
    id: 'job-a',
    name: 'Diner',
    hourly_rate_cents: 1500,
    archived_at: null,
    created_at: NOW,
    updated_at: NOW,
    overtime_enabled: 1,
    workweek_start_weekday: 3,
    workweek_start_time: '06:00',
    server_version: 1,
    server_change_sequence: 1,
    ...changes,
  };
}

function settings(
  changes: Partial<RemoteFederalWithholdingSettings> = {}
): RemoteFederalWithholdingSettings {
  return {
    id: 'settings-a',
    job_id: 'job-a',
    effective_from: '2026-01-01',
    filing_status: 'single-or-married-filing-separately',
    pay_periods_per_year: 26,
    step2_checked: 0,
    step3_credits_cents: 0,
    step4a_other_income_cents: 0,
    step4b_deductions_cents: 0,
    step4c_extra_withholding_cents: 2500,
    exempt: 0,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    server_version: 1,
    server_change_sequence: 2,
    ...changes,
  };
}

function shift(changes: Partial<RemoteShift> = {}): RemoteShift {
  return {
    id: 'shift-a',
    job_id: 'job-a',
    shift_date: '2026-08-05',
    duration_seconds: 14_400,
    tips_cents: 5000,
    hourly_rate_cents: 1500,
    note: null,
    deleted_at: null,
    created_at: NOW,
    updated_at: NOW,
    start_time: '18:00',
    end_time: '22:00',
    server_version: 1,
    server_change_sequence: 3,
    ...changes,
  };
}

function batch(changes: Partial<RemoteChangeBatch> = {}): RemoteChangeBatch {
  return {
    accountId: ACCOUNT_A,
    lastServerChangeSequence: 3,
    jobs: [job()],
    federalWithholdingSettings: [settings()],
    shifts: [shift()],
    ...changes,
  };
}

test('remote apply is parent-first, suppressed, and records one atomic cursor', async () => {
  const database = new TestDatabase();
  try {
    assert.deepEqual(await readPendingMutations(database), []);
    await applyRemoteChanges(database, batch());

    const state = await database.getFirstAsync<{
      account_id: string;
      applying_remote: number;
      last_server_change_sequence: number;
    }>('SELECT account_id, applying_remote, last_server_change_sequence FROM sync_state;');
    assert.deepEqual({ ...state }, {
      account_id: ACCOUNT_A,
      applying_remote: 0,
      last_server_change_sequence: 3,
    });
    assert.equal((await database.getFirstAsync<{ count: number }>(
      'SELECT count(*) AS count FROM sync_metadata;'
    ))?.count, 3);
    assert.deepEqual(await readPendingMutations(database), []);
  } finally {
    database.close();
  }
});

test('remote failure rolls back rows, metadata, account binding, cursor, and suppression', async () => {
  const database = new TestDatabase();
  try {
    await assert.rejects(
      applyRemoteChanges(database, batch({
        shifts: [shift({ job_id: 'missing-job' })],
      })),
      /FOREIGN KEY/
    );

    const counts = await database.getFirstAsync<{
      jobs: number;
      shifts: number;
      metadata: number;
      outbox: number;
    }>(
      `SELECT (SELECT count(*) FROM jobs) AS jobs,
              (SELECT count(*) FROM shifts) AS shifts,
              (SELECT count(*) FROM sync_metadata) AS metadata,
              (SELECT count(*) FROM sync_outbox) AS outbox;`
    );
    assert.deepEqual({ ...counts }, { jobs: 0, shifts: 0, metadata: 0, outbox: 0 });
    const rollbackState = await database.getFirstAsync<{
      account_id: string | null;
      last_server_change_sequence: number;
      applying_remote: number;
    }>('SELECT account_id, last_server_change_sequence, applying_remote FROM sync_state;');
    assert(rollbackState);
    assert.deepEqual(
      { ...rollbackState },
      { account_id: null, last_server_change_sequence: 0, applying_remote: 0 }
    );
  } finally {
    database.close();
  }
});

test('dirty local rows stop remote overwrite and preserve the pull cursor', async () => {
  const database = new TestDatabase();
  try {
    await database.runAsync(
      `INSERT INTO jobs
         (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
       VALUES ('job-a', 'Local name', 1000, NULL, ?, ?);`,
      NOW,
      NOW
    );

    await assert.rejects(
      applyRemoteChanges(database, batch()),
      RemoteChangeConflictError
    );
    assert.equal(
      (await database.getFirstAsync<{ name: string }>(
        "SELECT name FROM jobs WHERE id = 'job-a';"
      ))?.name,
      'Local name'
    );
    assert.equal(
      (await database.getFirstAsync<{ cursor: number }>(
        'SELECT last_server_change_sequence AS cursor FROM sync_state;'
      ))?.cursor,
      0
    );
  } finally {
    database.close();
  }
});

test('an old acknowledgement cannot erase a newer in-flight edit', async () => {
  const database = new TestDatabase();
  try {
    await database.runAsync(
      `INSERT INTO jobs
         (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
       VALUES ('job-a', 'First', 1000, NULL, ?, ?);`,
      NOW,
      NOW
    );
    const first = (await readPendingMutations(database))[0];
    await database.runAsync(
      "UPDATE jobs SET name = 'Second', updated_at = ? WHERE id = 'job-a';",
      NOW
    );
    const second = (await readPendingMutations(database))[0];
    assert(second.local_sequence > first.local_sequence);

    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: first.local_sequence,
      entityType: 'job',
      entityId: 'job-a',
      serverVersion: 1,
      serverChangeSequence: 1,
    });

    const remaining = await readPendingMutations(database);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].local_sequence, second.local_sequence);
    assert.equal(remaining[0].base_server_version, 1);

    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: second.local_sequence,
      entityType: 'job',
      entityId: 'job-a',
      serverVersion: 3,
      serverChangeSequence: 3,
    });
    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: first.local_sequence,
      entityType: 'job',
      entityId: 'job-a',
      serverVersion: 2,
      serverChangeSequence: 2,
    });
    assert.deepEqual(await readPendingMutations(database), []);
    const metadata = await database.getFirstAsync<{
      base_server_version: number;
      server_change_sequence: number;
    }>(
      `SELECT base_server_version, server_change_sequence
       FROM sync_metadata WHERE entity_type = 'job' AND entity_id = 'job-a';`
    );
    assert(metadata);
    assert.deepEqual(
      { ...metadata },
      { base_server_version: 3, server_change_sequence: 3 }
    );
  } finally {
    database.close();
  }
});

test('one database cannot silently change cloud account ownership', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await assert.rejects(bindSyncAccount(database, ACCOUNT_B), SyncAccountMismatchError);
    assert.equal(
      (await database.getFirstAsync<{ account_id: string }>(
        'SELECT account_id FROM sync_state;'
      ))?.account_id,
      ACCOUNT_A
    );
  } finally {
    database.close();
  }
});

test('account connection detects local data and only auto-binds an empty database', async () => {
  const database = new TestDatabase();
  try {
    assert.deepEqual(await inspectLocalAccountState(database), {
      accountId: null,
      localRecordCount: 0,
    });
    assert.equal(await bindSyncAccountIfEmpty(database, ACCOUNT_A), true);
    assert.equal((await inspectLocalAccountState(database)).accountId, ACCOUNT_A);

    const populated = new TestDatabase();
    try {
      await insertLocalJob(populated);
      assert.deepEqual(await inspectLocalAccountState(populated), {
        accountId: null,
        localRecordCount: 1,
      });
      assert.equal(await bindSyncAccountIfEmpty(populated, ACCOUNT_A), false);
      assert.equal((await inspectLocalAccountState(populated)).accountId, null);
    } finally {
      populated.close();
    }
  } finally {
    database.close();
  }
});

test('the next mutation snapshot keeps sequence, metadata, and record in one SQLite transaction', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tip-tracker-snapshot-'));
  const path = join(directory, 'snapshot.db');
  const database = new AtomicSnapshotDatabase(path);
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await insertLocalJob(database, 'First');
    const pending = (await readPendingMutations(database))[0];

    const snapshot = await readNextMutationSnapshot(database);
    assert(snapshot);
    assert.equal(database.blockedConcurrentEdit, true);
    assert.equal(snapshot.operationId, pending.local_sequence);
    assert.equal(snapshot.accountId, ACCOUNT_A);
    assert.equal(snapshot.baseServerVersion, null);
    assert.equal(snapshot.entityType, 'job');
    assert.equal(snapshot.operation, 'upsert');
    assert.deepEqual(snapshot.record, {
      archivedAt: null,
      createdAt: NOW,
      hourlyRateCents: 1000,
      name: 'First',
      overtimeEnabled: false,
      updatedAt: NOW,
      workweekStartTime: '00:00',
      workweekStartWeekday: 0,
    });

    database.concurrent.prepare(
      "UPDATE jobs SET name = 'Concurrent', updated_at = '2026-08-05T13:00:00.000Z' WHERE id = 'job-a';"
    ).run();
    const newer = (await readPendingMutations(database))[0];
    assert(newer.local_sequence > snapshot.operationId);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('mutation snapshots map archives, tombstones, and physical deletes to D24', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await database.runAsync(
      `INSERT INTO jobs
         (id, name, hourly_rate_cents, archived_at, created_at, updated_at,
          overtime_enabled, workweek_start_weekday, workweek_start_time)
       VALUES ('job-a', 'Diner', 1500, ?, ?, ?, 1, 3, '06:00');`,
      NOW,
      NOW,
      NOW
    );
    await database.runAsync(
      `INSERT INTO federal_withholding_settings
         (id, job_id, effective_from, filing_status, pay_periods_per_year,
          step2_checked, step3_credits_cents, step4a_other_income_cents,
          step4b_deductions_cents, step4c_extra_withholding_cents, exempt,
          created_at, updated_at, deleted_at)
       VALUES ('settings-a', 'job-a', '2026-01-01',
               'single-or-married-filing-separately', 26, 1, 100, 200, 300,
               400, 0, ?, ?, ?);`,
      NOW,
      NOW,
      NOW
    );
    await database.runAsync(
      `INSERT INTO shifts
         (id, job_id, shift_date, start_time, end_time, duration_seconds,
          tips_cents, hourly_rate_cents, note, deleted_at, created_at, updated_at)
       VALUES ('shift-a', 'job-a', '2026-08-05', '18:00', '22:00', 14400,
               5000, 1500, 'Patio', ?, ?, ?);`,
      NOW,
      NOW,
      NOW
    );

    const jobSnapshot = await readNextMutationSnapshot(database);
    assert(jobSnapshot);
    assert.deepEqual(jobSnapshot.record, {
      archivedAt: NOW,
      createdAt: NOW,
      hourlyRateCents: 1500,
      name: 'Diner',
      overtimeEnabled: true,
      updatedAt: NOW,
      workweekStartTime: '06:00',
      workweekStartWeekday: 3,
    });
    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: jobSnapshot.operationId,
      entityType: 'job',
      entityId: 'job-a',
      serverVersion: 1,
      serverChangeSequence: 1,
    });

    const settingSnapshot = await readNextMutationSnapshot(database);
    assert(settingSnapshot);
    assert.deepEqual(settingSnapshot.record, {
      createdAt: NOW,
      deletedAt: NOW,
      effectiveFrom: '2026-01-01',
      exempt: false,
      filingStatus: 'single-or-married-filing-separately',
      jobId: 'job-a',
      payPeriodsPerYear: 26,
      step2Checked: true,
      step3CreditsCents: 100,
      step4aOtherIncomeCents: 200,
      step4bDeductionsCents: 300,
      step4cExtraWithholdingCents: 400,
      updatedAt: NOW,
    });
    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: settingSnapshot.operationId,
      entityType: 'federal_withholding_setting',
      entityId: 'settings-a',
      serverVersion: 1,
      serverChangeSequence: 2,
    });

    const shiftSnapshot = await readNextMutationSnapshot(database);
    assert(shiftSnapshot);
    assert.deepEqual(shiftSnapshot.record, {
      createdAt: NOW,
      deletedAt: NOW,
      durationSeconds: 14_400,
      endTime: '22:00',
      hourlyRateCents: 1500,
      jobId: 'job-a',
      note: 'Patio',
      shiftDate: '2026-08-05',
      startTime: '18:00',
      tipsCents: 5000,
      updatedAt: NOW,
    });
    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: shiftSnapshot.operationId,
      entityType: 'shift',
      entityId: 'shift-a',
      serverVersion: 1,
      serverChangeSequence: 3,
    });

    await database.runAsync("DELETE FROM shifts WHERE id = 'shift-a';");
    const syncedDelete = await readNextMutationSnapshot(database);
    assert(syncedDelete);
    assert.equal(syncedDelete.operation, 'delete');
    assert.equal(syncedDelete.baseServerVersion, 1);
    assert.equal(syncedDelete.record, null);
    await acknowledgeMutation(database, {
      accountId: ACCOUNT_A,
      localSequence: syncedDelete.operationId,
      entityType: 'shift',
      entityId: 'shift-a',
      serverVersion: 2,
      serverChangeSequence: 4,
    });

    await database.runAsync(
      `INSERT INTO shifts
         (id, job_id, shift_date, duration_seconds, tips_cents,
          hourly_rate_cents, note, deleted_at, created_at, updated_at)
       VALUES ('never-synced', 'job-a', '2026-08-05', 1, 0, 0,
               NULL, NULL, ?, ?);`,
      NOW,
      NOW
    );
    await database.runAsync("DELETE FROM shifts WHERE id = 'never-synced';");
    const unsyncedDelete = await readNextMutationSnapshot(database);
    assert(unsyncedDelete);
    assert.equal(unsyncedDelete.operation, 'delete');
    assert.equal(unsyncedDelete.baseServerVersion, null);
    await acknowledgeUnsyncedPhysicalDelete(database, unsyncedDelete);
    assert.deepEqual(await readPendingMutations(database), []);
  } finally {
    database.close();
  }
});

test('failed multi-row local writes roll back their outbox entries', async () => {
  const database = new TestDatabase();
  try {
    await assert.rejects(
      database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO jobs
             (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
           VALUES ('job-a', 'Diner', 1500, NULL, ?, ?);`,
          NOW,
          NOW
        );
        await transaction.runAsync(
          `INSERT INTO shifts
             (id, job_id, shift_date, duration_seconds, tips_cents,
              hourly_rate_cents, note, deleted_at, created_at, updated_at)
           VALUES ('bad-shift', 'missing-job', '2026-08-05', 1, 0, 0,
                   NULL, NULL, ?, ?);`,
          NOW,
          NOW
        );
      }),
      /FOREIGN KEY/
    );
    assert.deepEqual(await readPendingMutations(database), []);
  } finally {
    database.close();
  }
});

test('device ids are canonical, installation-specific, and stable across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tip-tracker-sync-'));
  const path = join(directory, 'device.db');
  const first = new TestDatabase(path);
  const other = new TestDatabase();
  try {
    const firstId = await readDeviceId(first);
    assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(firstId, await readDeviceId(other));
    first.close();

    const reopened = new TestDatabase(path, false);
    try {
      assert.equal(await readDeviceId(reopened), firstId);
    } finally {
      reopened.close();
    }
  } finally {
    try {
      first.close();
    } catch {
      // The first connection is normally closed before the restart assertion.
    }
    other.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('blocked mutations are strict, bounded, durable, and hidden from pending work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tip-tracker-blocked-'));
  const path = join(directory, 'blocked.db');
  const database = new TestDatabase(path);
  try {
    await insertLocalJob(database);
    const mutation = (await readPendingMutations(database))[0];
    await blockMutation(database, {
      localSequence: mutation.local_sequence,
      kind: 'conflict',
      code: 'stale_version',
      response: { error: 'conflict', current: { id: 'job-a', serverVersion: 2 } },
    }, new Date(NOW));

    assert.deepEqual(await readPendingMutations(database), []);
    const blocked = await readBlockedMutation(database, mutation.local_sequence);
    assert(blocked);
    assert.equal(blocked.blocked_kind, 'conflict');
    assert.equal(blocked.blocked_code, 'stale_version');
    assert.deepEqual(blocked.blocked_response, {
      error: 'conflict',
      current: { id: 'job-a', serverVersion: 2 },
    });
    assert.equal(blocked.blocked_at, NOW);
    database.close();

    const reopened = new TestDatabase(path, false);
    try {
      assert.equal((await readBlockedMutations(reopened)).length, 1);
      assert.deepEqual(await readPendingMutations(reopened), []);
    } finally {
      reopened.close();
    }
  } finally {
    try {
      database.close();
    } catch {
      // The connection is normally closed before the restart assertion.
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a new local edit clears stale blocked state and stale actions cannot touch it', async () => {
  const database = new TestDatabase();
  try {
    await insertLocalJob(database);
    const first = (await readPendingMutations(database))[0];
    await blockMutation(database, {
      localSequence: first.local_sequence,
      kind: 'permanent',
      code: 'body_too_large',
      response: { error: 'body_too_large' },
    });

    await database.runAsync(
      "UPDATE jobs SET name = 'Changed', updated_at = ? WHERE id = 'job-a';",
      NOW
    );
    const second = (await readPendingMutations(database))[0];
    assert(second.local_sequence > first.local_sequence);
    assert.deepEqual(await readBlockedMutations(database), []);

    await assert.rejects(
      blockMutation(database, {
        localSequence: first.local_sequence,
        kind: 'conflict',
        code: 'stale_version',
        response: { error: 'conflict' },
      }),
      StaleMutationError
    );
    await assert.rejects(clearBlockedMutation(database, first.local_sequence), StaleMutationError);
    assert.equal((await readPendingMutations(database))[0].local_sequence, second.local_sequence);

    await blockMutation(database, {
      localSequence: second.local_sequence,
      kind: 'conflict',
      code: 'stale_version',
      response: { error: 'conflict' },
    });
    await clearBlockedMutation(database, second.local_sequence);
    assert.equal((await readPendingMutations(database))[0].local_sequence, second.local_sequence);
  } finally {
    database.close();
  }
});

test('blocked response validation rejects non-JSON, bad codes, and oversized input', async () => {
  const database = new TestDatabase();
  try {
    await insertLocalJob(database);
    const sequence = (await readPendingMutations(database))[0].local_sequence;
    const input = { localSequence: sequence, kind: 'conflict' as const, code: 'conflict' };

    await assert.rejects(
      blockMutation(database, { ...input, code: 'Bad-Code', response: {} }),
      /code is invalid/
    );
    await assert.rejects(
      blockMutation(database, { ...input, response: [] }),
      /must be a JSON object/
    );
    await assert.rejects(
      blockMutation(database, { ...input, response: { missing: undefined } }),
      /must be JSON/
    );
    const hiddenValue = {};
    Object.defineProperty(hiddenValue, 'hidden', { value: 'not serialized' });
    await assert.rejects(
      blockMutation(database, { ...input, response: hiddenValue }),
      /must be JSON/
    );
    await assert.rejects(
      blockMutation(database, {
        ...input,
        response: { value: 'x'.repeat(MAX_BLOCKED_RESPONSE_BYTES) },
      }),
      /too large/
    );
    assert.equal((await readPendingMutations(database)).length, 1);
  } finally {
    database.close();
  }
});

test('releasing a deleted account leaves the device connectable again', async () => {
  const database = new TestDatabase();
  try {
    // A device that has been connected and has synced: bound account, a pull
    // cursor, server versions, and a blocked row someone was told to review.
    await applyRemoteChanges(database, batch());
    await database.runAsync(
      `INSERT INTO shifts
         (id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents,
          note, deleted_at, created_at, updated_at, start_time, end_time)
       VALUES ('shift-local', 'job-a', '2026-08-06', 3600, 1000, 1500,
               NULL, NULL, ?, ?, NULL, NULL);`,
      NOW,
      NOW
    );
    const pendingBefore = await readPendingMutations(database);
    assert.equal(pendingBefore.length, 1);
    await blockMutation(database, {
      kind: 'conflict',
      code: 'stale_version',
      localSequence: pendingBefore[0]!.local_sequence,
      response: { error: 'stale_version' },
    });
    const highestSequenceBefore = pendingBefore[0]!.local_sequence;

    await releaseSyncAccount(database);

    // Nothing about the account survives: no binding, no cursor, no versions.
    const state = await database.getFirstAsync<{
      account_id: string | null;
      last_server_change_sequence: number;
    }>('SELECT account_id, last_server_change_sequence FROM sync_state WHERE singleton = 1;');
    assert.equal(state?.account_id, null);
    assert.equal(state?.last_server_change_sequence, 0);
    const metadata = await database.getAllAsync('SELECT * FROM sync_metadata;');
    assert.equal(metadata.length, 0);
    assert.equal((await readBlockedMutations(database)).length, 0);

    // Every local row is offered to whatever account connects next, parents
    // first, and the shift the user made locally is still among them.
    const pending = await readPendingMutations(database);
    assert.deepEqual(
      pending.map((mutation) => `${mutation.entity_type}:${mutation.entity_id}`),
      [
        'job:job-a',
        'federal_withholding_setting:settings-a',
        'shift:shift-a',
        'shift:shift-local',
      ]
    );
    assert.deepEqual(pending.map((mutation) => mutation.base_server_version), [
      null,
      null,
      null,
      null,
    ]);

    // Local sequences are half of the server's idempotency key, so a rebuilt
    // outbox must not hand out a number this device already used.
    assert.equal(pending[0]!.local_sequence > highestSequenceBefore, true);

    // The whole point: a different account can now take this device.
    await bindSyncAccount(database, ACCOUNT_B);
    assert.equal((await inspectLocalAccountState(database)).accountId, ACCOUNT_B);
  } finally {
    database.close();
  }
});
