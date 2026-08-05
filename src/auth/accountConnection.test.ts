import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  confirmAccountConnection,
  prepareAccountConnection,
} from './accountConnection.ts';
import {
  SyncAccountMismatchError,
  type SyncDatabase,
  type SyncTransaction,
} from '../data/sync.ts';

const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002';
const account = { createdAt: '2026-08-05T12:00:00.000Z', id: ACCOUNT_A };
type Value = string | number | null;

class ConnectionDatabase implements SyncDatabase {
  accountId: string | null = null;
  localRecordCount = 0;

  async getAllAsync<T>(): Promise<T[]> { return []; }
  async getFirstAsync<T>(sql: string): Promise<T | null> {
    if (sql.includes('local_record_count')) {
      return {
        account_id: this.accountId,
        applying_remote: 0,
        local_record_count: this.localRecordCount,
      } as T;
    }
    if (sql.includes('AS count')) return { count: this.localRecordCount } as T;
    if (sql.includes('FROM sync_state')) {
      return {
        account_id: this.accountId,
        applying_remote: 0,
        last_server_change_sequence: 0,
      } as T;
    }
    return null;
  }
  async runAsync(_sql: string, ...params: Value[]): Promise<unknown> {
    const accountId = params[0];
    if (typeof accountId === 'string') this.accountId = accountId;
    return { changes: 1 };
  }
  async withExclusiveTransactionAsync(
    task: (transaction: SyncTransaction) => Promise<void>
  ): Promise<void> {
    await task(this);
  }
}

test('verifies first, auto-binds empty data, and leaves populated data unbound', async () => {
  const empty = new ConnectionDatabase();
  let verified = false;
  const connected = await prepareAccountConnection(empty, async () => {
    verified = true;
    assert.equal(empty.accountId, null);
    return account;
  });
  assert.equal(verified, true);
  assert.equal(connected.state, 'connected');
  assert.equal(empty.accountId, ACCOUNT_A);

  const populated = new ConnectionDatabase();
  populated.localRecordCount = 3;
  const pending = await prepareAccountConnection(populated, async () => account);
  assert.deepEqual(pending, { account, localRecordCount: 3, state: 'consent_required' });
  assert.equal(populated.accountId, null);

  await confirmAccountConnection(populated, async () => account);
  assert.equal(populated.accountId, ACCOUNT_A);
});

test('a different durable account blocks connection without mutation', async () => {
  const database = new ConnectionDatabase();
  database.accountId = ACCOUNT_B;
  await assert.rejects(
    prepareAccountConnection(database, async () => account),
    SyncAccountMismatchError
  );
  assert.equal(database.accountId, ACCOUNT_B);
});
