import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'tip-tracker.db';
const SCHEMA_VERSION = 2;
const upgradeSqlByVersion = [
  require('./schema.sql'),
  require('./migrations/1-to-2.sql'),
];

// Opening a connection is async, and we only want to do it once -- not a
// fresh connection per call. This caches the in-flight (or finished) open,
// so every caller awaits the same promise instead of racing to open twice.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // SQLite turns foreign keys off by default, and it's a per-connection
  // setting -- not something saved in the database file itself. schema.sql's
  // own header comment already flags this: without this line, the
  // FOREIGN KEY on shifts.job_id is decoration and enforces nothing.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // PRAGMA user_version is a plain integer SQLite stores in the database
  // file itself, defaulting to 0. It's not used for anything internally --
  // it's just a slot the app gets to use as "which schema version is this
  // database currently at." That makes it the guard against re-running
  // schema.sql: skip straight past the CREATE TABLE statements if a
  // previous launch already ran them, since running them twice would fail
  // the second time (no "IF NOT EXISTS" in schema.sql, on purpose -- that
  // keeps it identical to what scripts/test-schema.sh loads and tests).
  // PRAGMA user_version always returns one row, including 0 for a new file.
  const currentVersion = (
    await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;')
  )!.user_version;

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database version ${currentVersion} is newer than this app supports (${SCHEMA_VERSION}).`
    );
  }

  if (currentVersion < SCHEMA_VERSION) {
    // SQL ships as bundled assets (see metro.config.js), not duplicated JS
    // strings. downloadAsync() makes sure the asset is on disk before it is
    // read, and the transaction keeps the SQL and version marker atomic.
    // Version 0 gets the complete current schema; version 1 gets the one
    // migration that advances it to version 2. Both assets are statically
    // required above so Metro includes them in native bundles.
    const upgradeSql = await readBundledSql(upgradeSqlByVersion[currentVersion]);

    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(upgradeSql);
      await transaction.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
  }

  return db;
}

async function readBundledSql(moduleId: number): Promise<string> {
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  return new File(asset.localUri!).text();
}
