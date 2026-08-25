import type { DatabaseTransaction, TransactionalDatabase } from './databaseTypes.ts';

export const DATABASE_SCHEMA_VERSION = 6;

export type DatabaseSqlFile =
  | 'schema.sql'
  | 'migrations/1-to-2.sql'
  | 'migrations/2-to-3.sql'
  | 'migrations/3-to-4.sql'
  | 'migrations/4-to-5.sql'
  | 'migrations/5-to-6.sql';

const MIGRATION_FILE_BY_FROM_VERSION: Readonly<Record<number, DatabaseSqlFile>> = {
  1: 'migrations/1-to-2.sql',
  2: 'migrations/2-to-3.sql',
  3: 'migrations/3-to-4.sql',
  4: 'migrations/4-to-5.sql',
  5: 'migrations/5-to-6.sql',
};

type SqlLoader = (file: DatabaseSqlFile) => Promise<string>;

export async function migrateDatabase(
  database: TransactionalDatabase,
  loadSql: SqlLoader
): Promise<void> {
  const currentVersion = (
    await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;')
  )?.user_version ?? 0;

  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database version ${currentVersion} is newer than this app supports (${DATABASE_SCHEMA_VERSION}).`
    );
  }

  if (currentVersion === DATABASE_SCHEMA_VERSION) return;

  const steps: { sql: string; toVersion: number }[] = [];
  if (currentVersion === 0) {
    steps.push({ sql: await loadSql('schema.sql'), toVersion: DATABASE_SCHEMA_VERSION });
  } else {
    for (let from = currentVersion; from < DATABASE_SCHEMA_VERSION; from += 1) {
      const file = MIGRATION_FILE_BY_FROM_VERSION[from];
      if (!file) throw new Error(`No migration from database version ${from}.`);
      steps.push({ sql: await loadSql(file), toVersion: from + 1 });
    }
  }

  await database.withExclusiveTransactionAsync(async (transaction: DatabaseTransaction) => {
    for (const step of steps) {
      await transaction.execAsync(step.sql);
      await transaction.execAsync(`PRAGMA user_version = ${step.toVersion};`);
    }
  });
}
