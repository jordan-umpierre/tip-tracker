import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { createRetryablePromise } from '../lib/retryablePromise';

const DATABASE_NAME = 'tip-tracker.db';
const SCHEMA_VERSION = 6;

// A database that does not exist yet gets the whole current schema in one go.
const freshSchemaSql = require('./schema.sql');

// One entry per hop, keyed by the version it upgrades *from*. Every step has
// to be listed: the runner walks this from the database's current version up
// to SCHEMA_VERSION rather than applying a single file, which is what it used
// to do. That worked only while there was exactly one hop -- a version-1
// database upgrading to version 3 applied 1-to-2.sql and was then stamped as
// version 3, so it claimed a shape it did not have and every later migration
// would have skipped it.
const migrationSqlByFromVersion: Record<number, number> = {
  1: require('./migrations/1-to-2.sql'),
  2: require('./migrations/2-to-3.sql'),
  3: require('./migrations/3-to-4.sql'),
  4: require('./migrations/4-to-5.sql'),
  5: require('./migrations/5-to-6.sql'),
};

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
    // read, so the reads happen here rather than inside the transaction.
    const steps: { sql: string; toVersion: number }[] = [];

    if (currentVersion === 0) {
      steps.push({ sql: await readBundledSql(freshSchemaSql), toVersion: SCHEMA_VERSION });
    } else {
      for (let from = currentVersion; from < SCHEMA_VERSION; from += 1) {
        const asset = migrationSqlByFromVersion[from];
        if (asset === undefined) {
          throw new Error(`No migration from database version ${from}.`);
        }
        steps.push({ sql: await readBundledSql(asset), toVersion: from + 1 });
      }
    }

    // One transaction around the whole chain, not one per step. A failure
    // halfway through a two-hop upgrade would otherwise leave the database at
    // an intermediate version with the app expecting the final one.
    await db.withExclusiveTransactionAsync(async (transaction) => {
      for (const step of steps) {
        await transaction.execAsync(step.sql);
        // Stamped per step so the marker never claims a shape the database
        // does not have, even mid-chain.
        await transaction.execAsync(`PRAGMA user_version = ${step.toVersion};`);
      }
    });
  }

  return db;
}

async function readBundledSql(moduleId: number): Promise<string> {
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  return new File(asset.localUri!).text();
}
