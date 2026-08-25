import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { DatabaseTransaction, SqlValue } from './databaseTypes.ts';

export class TestDatabase {
  readonly #database = new DatabaseSync(':memory:');

  async loadSchema(): Promise<void> {
    await this.execAsync(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    await this.execAsync('PRAGMA user_version = 6;');
  }

  async execAsync(source: string): Promise<void> {
    this.#database.exec(source);
  }

  async runAsync(source: string, ...params: SqlValue[]): Promise<unknown> {
    return this.#database.prepare(source).run(...params);
  }

  async getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]> {
    return this.#database.prepare(source).all(...params).map((row) => ({ ...row })) as T[];
  }

  async getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null> {
    const row = this.#database.prepare(source).get(...params);
    return row ? ({ ...row } as T) : null;
  }

  async withExclusiveTransactionAsync(
    task: (transaction: DatabaseTransaction) => Promise<void>
  ): Promise<void> {
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      await task(this);
      this.#database.exec('COMMIT;');
    } catch (cause) {
      this.#database.exec('ROLLBACK;');
      throw cause;
    }
  }

  close(): void {
    this.#database.close();
  }
}

export function createTestDatabase(): TestDatabase {
  return new TestDatabase();
}
