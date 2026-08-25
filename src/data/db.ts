import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { createRetryablePromise } from '../lib/retryablePromise';
import {
  migrateDatabase,
  type DatabaseSqlFile,
} from './databaseMigration';

const DATABASE_NAME = 'tip-tracker.db';

// Opening a connection is async, and we only want one successful connection --
// not a fresh connection per call. Concurrent callers share the same attempt,
// while a rejected attempt clears itself so a visible Retry action can recover.
const openDbOnce = createRetryablePromise(openDb);

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  return openDbOnce();
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // SQLite turns foreign keys off by default, and it's a per-connection
  // setting -- not something saved in the database file itself. schema.sql's
  // own header comment already flags this: without this line, the
  // FOREIGN KEY on shifts.job_id is decoration and enforces nothing.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await migrateDatabase(db, readBundledSql);

  return db;
}

async function readBundledSql(file: DatabaseSqlFile): Promise<string> {
  let moduleId: number;
  switch (file) {
    case 'schema.sql':
      moduleId = require('./schema.sql');
      break;
    case 'migrations/1-to-2.sql':
      moduleId = require('./migrations/1-to-2.sql');
      break;
    case 'migrations/2-to-3.sql':
      moduleId = require('./migrations/2-to-3.sql');
      break;
    case 'migrations/3-to-4.sql':
      moduleId = require('./migrations/3-to-4.sql');
      break;
    case 'migrations/4-to-5.sql':
      moduleId = require('./migrations/4-to-5.sql');
      break;
    case 'migrations/5-to-6.sql':
      moduleId = require('./migrations/5-to-6.sql');
      break;
  }
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  return new File(asset.localUri!).text();
}
