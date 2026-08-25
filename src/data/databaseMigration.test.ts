import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DATABASE_SCHEMA_VERSION,
  migrateDatabase,
  type DatabaseSqlFile,
} from './databaseMigration.ts';
import { readBackupRowsInDatabase } from './backupRepository.ts';
import { createTestDatabase, type TestDatabase } from './testDatabase.ts';

const versionOneSchema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes > 0),
    tips_cents INTEGER NOT NULL CHECK (tips_cents >= 0),
    hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
    note TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT
  );
  INSERT INTO jobs VALUES (
    'job-1', 'Cafe', 1500, NULL,
    '2026-07-30T12:00:00.000Z', '2026-07-30T12:00:00.000Z'
  );
  INSERT INTO shifts VALUES (
    'shift-1', 'job-1', '2026-07-30', 455, 2000, 1500, 'closing', NULL,
    '2026-07-30T12:00:00.000Z', '2026-07-30T12:00:00.000Z'
  );
  PRAGMA user_version = 1;
`;

async function loadSql(file: DatabaseSqlFile): Promise<string> {
  return readFile(new URL(file, import.meta.url), 'utf8');
}

async function userVersion(database: TestDatabase): Promise<number> {
  return (await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'))!
    .user_version;
}

const migrated = createTestDatabase();
try {
  await migrated.execAsync(versionOneSchema);
  await migrateDatabase(migrated, loadSql);

  assert.equal(await userVersion(migrated), DATABASE_SCHEMA_VERSION);
  const rows = await readBackupRowsInDatabase(migrated);
  assert.equal(rows.shifts[0].duration_seconds, 455 * 60);
  assert.equal(rows.shifts[0].tips_cents, 2000);
  assert.equal(rows.jobs[0].name, 'Cafe');
} finally {
  migrated.close();
}

const fresh = createTestDatabase();
try {
  await migrateDatabase(fresh, loadSql);
  assert.equal(await userVersion(fresh), DATABASE_SCHEMA_VERSION);
  assert.deepEqual(await readBackupRowsInDatabase(fresh), {
    jobs: [],
    shifts: [],
    federal_withholding_settings: [],
  });
} finally {
  fresh.close();
}

const rolledBack = createTestDatabase();
try {
  await rolledBack.execAsync(versionOneSchema);
  await assert.rejects(
    migrateDatabase(rolledBack, async (file) =>
      file === 'migrations/2-to-3.sql' ? 'THIS IS NOT SQL;' : loadSql(file)
    )
  );
  assert.equal(await userVersion(rolledBack), 1);
  assert.equal(
    await rolledBack.getFirstAsync<{ minutes: number }>(
      `SELECT minutes FROM shifts WHERE id = 'shift-1';`
    ).then((row) => row?.minutes),
    455
  );
} finally {
  rolledBack.close();
}

console.log('database migration runner OK');
