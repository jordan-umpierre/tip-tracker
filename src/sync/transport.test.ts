import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  bindSyncAccount,
  inspectLocalAccountState,
  readBlockedMutations,
  readPendingMutations,
  readSyncCursor,
  type SyncDatabase,
} from '../data/sync.ts';
import { createSyncRunner } from './transport.ts';

const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-08-05T12:00:00.000Z';
const schema = readFileSync(new URL('../data/schema.sql', import.meta.url), 'utf8');
type Value = string | number | null;

class TestDatabase implements SyncDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path = ':memory:', initialize = true) {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    if (initialize) this.sqlite.exec(schema);
  }
  close() { this.sqlite.close(); }
  async getFirstAsync<T>(sql: string, ...params: Value[]): Promise<T | null> {
    return (this.sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: Value[]): Promise<T[]> {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }
  async runAsync(sql: string, ...params: Value[]): Promise<unknown> {
    return this.sqlite.prepare(sql).run(...params);
  }
  async withExclusiveTransactionAsync(task: (transaction: TestDatabase) => Promise<void>) {
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

async function insertJob(database: TestDatabase, name = 'Diner') {
  await database.runAsync(
    `INSERT INTO jobs
       (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
     VALUES ('job-a', ?, 1500, NULL, ?, ?);`,
    name,
    NOW,
    NOW
  );
}

function jobRecord(name = 'Diner') {
  return {
    archivedAt: null,
    createdAt: NOW,
    hourlyRateCents: 1500,
    name,
    overtimeEnabled: false,
    updatedAt: NOW,
    workweekStartTime: '00:00',
    workweekStartWeekday: 0,
  };
}

function remoteJob(changeSequence: number, name = 'Diner') {
  return {
    changeSequence,
    entityId: 'job-a',
    entityType: 'job',
    record: jobRecord(name),
    serverCreatedAt: NOW,
    serverUpdatedAt: NOW,
    serverVersion: 1,
  };
}

function mutationSuccess(operationId: number, changeSequence = 1, name = 'Diner') {
  return Response.json({ operationId, change: remoteJob(changeSequence, name) });
}

function emptyPage(after = 0) {
  return Response.json({ changes: [], hasMore: false, nextCursor: after });
}

function runner(
  database: TestDatabase,
  fetchImplementation: typeof fetch,
  overrides: Partial<Parameters<typeof createSyncRunner>[0]> = {}
) {
  return createSyncRunner({
    apiUrl: 'https://api.example.test',
    database,
    fetch: fetchImplementation,
    now: () => new Date(NOW),
    random: () => 0,
    refreshSession: async () => null,
    sleep: async () => undefined,
    ...overrides,
  });
}

test('push retries exact bytes and an edit during flight survives its acknowledgement', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await insertJob(database);
    const firstSequence = (await readPendingMutations(database))[0].local_sequence;
    const bodies: string[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImplementation: typeof fetch = async (_input, init) => {
      calls += 1;
      if (init?.method === 'GET') return emptyPage();
      bodies.push(String(init?.body));
      if (calls === 1) throw new Error('offline between send and response');
      if (calls === 2) {
        await database.runAsync(
          "UPDATE jobs SET name = 'Edited during flight', updated_at = ? WHERE id = 'job-a';",
          '2026-08-05T13:00:00.000Z'
        );
        return mutationSuccess(firstSequence);
      }
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    };
    const synced = await runner(database, fetchImplementation, {
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    }).run({ accessToken: 'token-a', userId: ACCOUNT_A });

    assert.deepEqual(synced, { status: 'pending_offline', pushed: 1, pulled: 0 });
    assert.equal(bodies[0], bodies[1]);
    const sent = JSON.parse(bodies[0]);
    assert.deepEqual(sent, {
      baseServerVersion: null,
      deviceId: sent.deviceId,
      entityId: 'job-a',
      entityType: 'job',
      operation: 'upsert',
      operationId: firstSequence,
      record: jobRecord(),
    });
    assert.deepEqual(sleeps, [100, 100, 200]);
    const remaining = await readPendingMutations(database);
    assert.equal(remaining.length, 1);
    assert(remaining[0].local_sequence > firstSequence);
  } finally {
    database.close();
  }
});

test('401 refreshes once with the same body and a second 401 requires sign-in', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await insertJob(database);
    const sequence = (await readPendingMutations(database))[0].local_sequence;
    const bodies: string[] = [];
    const tokens: string[] = [];
    let calls = 0;
    const fetchImplementation: typeof fetch = async (_input, init) => {
      calls += 1;
      if (init?.method === 'GET') return emptyPage();
      bodies.push(String(init?.body));
      tokens.push(String(new Headers(init?.headers).get('authorization')));
      return calls === 1 ? new Response('{}', { status: 401 }) : mutationSuccess(sequence);
    };
    let refreshes = 0;
    const success = await runner(database, fetchImplementation, {
      refreshSession: async () => {
        refreshes += 1;
        return { accessToken: 'token-b', userId: ACCOUNT_A };
      },
    }).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(success.status, 'up_to_date');
    assert.equal(refreshes, 1);
    assert.equal(bodies[0], bodies[1]);
    assert.deepEqual(tokens.slice(0, 2), ['Bearer token-a', 'Bearer token-b']);

    await database.runAsync(
      "UPDATE jobs SET name = 'Again', updated_at = ? WHERE id = 'job-a';",
      '2026-08-05T13:00:00.000Z'
    );
    const unauthorized = await runner(
      database,
      async () => new Response('{}', { status: 401 }),
      { refreshSession: async () => ({ accessToken: 'token-c', userId: ACCOUNT_A }) }
    ).run({ accessToken: 'token-b', userId: ACCOUNT_A });
    assert.equal(unauthorized.status, 'sign_in_again');
    assert.equal((await readPendingMutations(database)).length, 1);
  } finally {
    database.close();
  }
});

test('offline retry is bounded and account mismatch makes zero HTTP calls', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await insertJob(database);
    let calls = 0;
    const sleeps: number[] = [];
    const offline = await runner(database, async () => {
      calls += 1;
      throw new Error('offline');
    }, {
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    }).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.deepEqual(offline, { status: 'pending_offline', pushed: 0, pulled: 0 });
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [100, 200]);
    assert.equal((await readPendingMutations(database)).length, 1);

    calls = 0;
    const mismatch = await runner(database, async () => {
      calls += 1;
      return emptyPage();
    }).run({ accessToken: 'token-b', userId: ACCOUNT_B });
    assert.equal(mismatch.status, 'mismatch');
    assert.equal(calls, 0);
  } finally {
    database.close();
  }
});

test('conflicts persist across restart and stop later requests', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tip-tracker-transport-block-'));
  const path = join(directory, 'blocked.db');
  const database = new TestDatabase(path);
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await insertJob(database);
    const sequence = (await readPendingMutations(database))[0].local_sequence;
    const conflictBody = {
      error: 'version_conflict',
      operationId: sequence,
      remote: remoteJob(5, 'Remote'),
    };
    const blocked = await runner(
      database,
      async () => Response.json(conflictBody, { status: 409 })
    ).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(blocked.status, 'blocked');
    assert.deepEqual((await readBlockedMutations(database))[0].blocked_response, conflictBody);
    database.close();

    const reopened = new TestDatabase(path, false);
    try {
      let calls = 0;
      const afterRestart = await runner(reopened, async () => {
        calls += 1;
        return emptyPage();
      }).run({ accessToken: 'token-a', userId: ACCOUNT_A });
      assert.equal(afterRestart.status, 'blocked');
      assert.equal(calls, 0);
    } finally {
      reopened.close();
    }
  } finally {
    try { database.close(); } catch { /* The restart path normally closes it first. */ }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('permanent request failures retain their decoded response for review', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    await insertJob(database);
    const response = { error: 'body_too_large' };
    const synced = await runner(
      database,
      async () => Response.json(response, { status: 413 })
    ).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(synced.status, 'blocked');
    const blocked = await readBlockedMutations(database);
    assert.equal(blocked[0].blocked_kind, 'permanent');
    assert.equal(blocked[0].blocked_code, 'body_too_large');
    assert.deepEqual(blocked[0].blocked_response, response);
  } finally {
    database.close();
  }
});

test('pull accepts noncontiguous pages, applies parents first, and never re-enqueues them', async () => {
  const database = new TestDatabase();
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    const setting = remoteSetting(5);
    const shift = remoteShift(8);
    const pages = [
      { changes: [remoteJob(2)], hasMore: true, nextCursor: 2 },
      { changes: [setting, shift], hasMore: false, nextCursor: 8 },
    ];
    const urls: string[] = [];
    const synced = await runner(database, async (input) => {
      urls.push(String(input));
      return Response.json(pages.shift());
    }).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.deepEqual(synced, { status: 'up_to_date', pushed: 0, pulled: 3 });
    assert.equal(urls[0].endsWith('after=0&limit=100'), true);
    assert.equal(urls[1].endsWith('after=2&limit=100'), true);
    assert.equal(await readSyncCursor(database, ACCOUNT_A), 8);
    assert.deepEqual(await readPendingMutations(database), []);
    assert.equal((await inspectLocalAccountState(database)).localRecordCount, 3);
  } finally {
    database.close();
  }
});

test('malformed pagination cannot loop, and a failed page rolls back rows and cursor', async () => {
  const loopDatabase = new TestDatabase();
  try {
    await bindSyncAccount(loopDatabase, ACCOUNT_A);
    let calls = 0;
    const malformed = await runner(loopDatabase, async () => {
      calls += 1;
      return Response.json({ changes: [], hasMore: true, nextCursor: 0 });
    }).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(malformed.status, 'blocked');
    assert.equal(calls, 1);
    assert.equal(await readSyncCursor(loopDatabase, ACCOUNT_A), 0);
  } finally {
    loopDatabase.close();
  }

  const strictDatabase = new TestDatabase();
  try {
    await bindSyncAccount(strictDatabase, ACCOUNT_A);
    const malformedRecord = remoteJob(1) as ReturnType<typeof remoteJob> & {
      record: ReturnType<typeof jobRecord> & { unknown: boolean };
    };
    malformedRecord.record.unknown = true;
    const strict = await runner(strictDatabase, async () => Response.json({
      changes: [malformedRecord],
      hasMore: false,
      nextCursor: 1,
    })).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(strict.status, 'blocked');
    assert.equal(await readSyncCursor(strictDatabase, ACCOUNT_A), 0);
  } finally {
    strictDatabase.close();
  }

  const rollbackDatabase = new TestDatabase();
  try {
    await bindSyncAccount(rollbackDatabase, ACCOUNT_A);
    await assert.rejects(
      runner(rollbackDatabase, async () => Response.json({
        changes: [remoteJob(1), remoteShift(2, 'missing-job')],
        hasMore: false,
        nextCursor: 2,
      })).run({ accessToken: 'token-a', userId: ACCOUNT_A }),
      /FOREIGN KEY/
    );
    assert.equal(await readSyncCursor(rollbackDatabase, ACCOUNT_A), 0);
    assert.equal((await inspectLocalAccountState(rollbackDatabase)).localRecordCount, 0);
    assert.deepEqual(await readPendingMutations(rollbackDatabase), []);
  } finally {
    rollbackDatabase.close();
  }
});

test('a pull conflict survives restart without cursor movement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tip-tracker-pull-conflict-'));
  const path = join(directory, 'conflict.db');
  const database = new TestDatabase(path);
  try {
    await bindSyncAccount(database, ACCOUNT_A);
    let calls = 0;
    const fetchImplementation: typeof fetch = async (_input, init) => {
      calls += 1;
      if (init?.method === 'POST') {
        const operationId = JSON.parse(String(init.body)).operationId as number;
        return mutationSuccess(operationId);
      }
      await database.runAsync(
        "UPDATE jobs SET name = 'Local after push', updated_at = ? WHERE id = 'job-a';",
        '2026-08-05T13:00:00.000Z'
      );
      return Response.json({
        changes: [remoteJob(2, 'Remote after push')],
        hasMore: false,
        nextCursor: 2,
      });
    };
    await insertJob(database);
    const synced = await runner(database, fetchImplementation).run({
      accessToken: 'token-a', userId: ACCOUNT_A,
    });
    assert.equal(synced.status, 'blocked');
    assert.equal(await readSyncCursor(database, ACCOUNT_A), 0);
    const blocked = await readBlockedMutations(database);
    assert.equal(blocked[0].blocked_code, 'remote_change_conflict');
    assert.equal(
      (blocked[0].blocked_response.remote as { record: { name: string } }).record.name,
      'Remote after push'
    );
    database.close();

    const reopened = new TestDatabase(path, false);
    try {
      assert.equal((await readBlockedMutations(reopened)).length, 1);
      assert.equal(await readSyncCursor(reopened, ACCOUNT_A), 0);
    } finally {
      reopened.close();
    }
    assert.equal(calls, 2);
  } finally {
    try { database.close(); } catch { /* The restart path normally closes it first. */ }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('410 preserves SQLite and concurrent runs share one process mutex', async () => {
  const deletedDatabase = new TestDatabase();
  try {
    await bindSyncAccount(deletedDatabase, ACCOUNT_A);
    await insertJob(deletedDatabase);
    const before = await readPendingMutations(deletedDatabase);
    const deleted = await runner(
      deletedDatabase,
      async () => Response.json({ error: 'account_deleted' }, { status: 410 })
    ).run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(deleted.status, 'deleted');
    assert.deepEqual(await readPendingMutations(deletedDatabase), before);
    assert.deepEqual(await inspectLocalAccountState(deletedDatabase), {
      accountId: ACCOUNT_A,
      localRecordCount: 1,
    });
  } finally {
    deletedDatabase.close();
  }

  const serializedDatabase = new TestDatabase();
  try {
    await bindSyncAccount(serializedDatabase, ACCOUNT_A);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const syncRunner = runner(serializedDatabase, async () => {
      calls += 1;
      await gate;
      return emptyPage();
    });
    const first = syncRunner.run({ accessToken: 'token-a', userId: ACCOUNT_A });
    const second = syncRunner.run({ accessToken: 'token-a', userId: ACCOUNT_A });
    assert.equal(first, second);
    release?.();
    assert.equal((await first).status, 'up_to_date');
    assert.equal(calls, 1);
  } finally {
    serializedDatabase.close();
  }
});

function remoteSetting(changeSequence: number) {
  return {
    changeSequence,
    entityId: 'setting-a',
    entityType: 'federal_withholding_setting',
    record: {
      createdAt: NOW, deletedAt: null, effectiveFrom: '2026-01-01', exempt: false,
      filingStatus: 'single-or-married-filing-separately', jobId: 'job-a',
      payPeriodsPerYear: 26, step2Checked: false, step3CreditsCents: 0,
      step4aOtherIncomeCents: 0, step4bDeductionsCents: 0,
      step4cExtraWithholdingCents: 0, updatedAt: NOW,
    },
    serverCreatedAt: NOW,
    serverUpdatedAt: NOW,
    serverVersion: 1,
  };
}

function remoteShift(changeSequence: number, jobId = 'job-a') {
  return {
    changeSequence,
    entityId: 'shift-a',
    entityType: 'shift',
    record: {
      createdAt: NOW, deletedAt: null, durationSeconds: 3600, endTime: null,
      hourlyRateCents: 1500, jobId, note: null, shiftDate: '2026-08-05',
      startTime: null, tipsCents: 500, updatedAt: NOW,
    },
    serverCreatedAt: NOW,
    serverUpdatedAt: NOW,
    serverVersion: 1,
  };
}
