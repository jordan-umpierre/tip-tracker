import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'tip-tracker.db';
const SCHEMA_VERSION = 1;

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
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    // schema.sql ships as a bundled asset (see metro.config.js), not
    // inlined as a JS string -- that way this file and
    // scripts/test-schema.sh are always running the exact same source of
    // truth. downloadAsync() makes sure the asset is actually on disk
    // before .localUri is usable.
    const asset = await Asset.fromModule(require('./schema.sql')).downloadAsync();
    const schemaSql = await new File(asset.localUri!).text();

    await db.execAsync(schemaSql);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  return db;
}
