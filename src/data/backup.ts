import type * as SQLite from 'expo-sqlite';
import { getDb } from './db';
import {
  assertBackupRowsEqual,
  buildBackupJson,
} from '../lib/backup';
import type {
  BackupJob,
  BackupRows,
  BackupShift,
  TipTrackerBackup,
} from '../lib/backup';

const JOBS_SQL = `
  SELECT id, name, hourly_rate_cents, archived_at, created_at, updated_at,
         overtime_enabled, workweek_start_weekday, workweek_start_time
  FROM jobs
  ORDER BY id;`;

const SHIFTS_SQL = `
  SELECT id, job_id, shift_date, duration_seconds, tips_cents,
         hourly_rate_cents, note, deleted_at, created_at, updated_at,
         start_time, end_time
  FROM shifts
  ORDER BY id;`;

type RowReader = Pick<SQLite.SQLiteDatabase, 'getAllAsync'>;

export async function createBackupJson(exportedAt = new Date()): Promise<string> {
  const db = await getDb();
  let rows!: BackupRows;

  // Both tables have to describe one moment. A job archived between two plain
  // SELECTs would otherwise produce a backup that never existed on the device.
  await db.withExclusiveTransactionAsync(async (transaction) => {
    rows = await readBackupRows(transaction);
  });

  return buildBackupJson(rows.jobs, rows.shifts, exportedAt);
}

export async function restoreBackup(backup: TipTrackerBackup): Promise<BackupRows> {
  const db = await getDb();
  let restored!: BackupRows;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const counts = await transaction.getFirstAsync<{ job_count: number; shift_count: number }>(
      `SELECT (SELECT COUNT(*) FROM jobs) AS job_count,
              (SELECT COUNT(*) FROM shifts) AS shift_count;`
    );
    if (!counts || counts.job_count !== 0 || counts.shift_count !== 0) {
      throw new Error('Restore requires an empty Tip Tracker database.');
    }

    // Jobs are parents of shifts. Ordinary INSERT is deliberate: replacing or
    // merging a matching id could destroy data, which empty-only restore forbids.
    for (const job of backup.jobs) {
      await transaction.runAsync(
        `INSERT INTO jobs
           (id, name, hourly_rate_cents, archived_at, created_at, updated_at,
            overtime_enabled, workweek_start_weekday, workweek_start_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        job.id,
        job.name,
        job.hourly_rate_cents,
        job.archived_at,
        job.created_at,
        job.updated_at,
        job.overtime_enabled,
        job.workweek_start_weekday,
        job.workweek_start_time
      );
    }

    for (const shift of backup.shifts) {
      await transaction.runAsync(
        `INSERT INTO shifts
           (id, job_id, shift_date, duration_seconds, tips_cents,
            hourly_rate_cents, note, deleted_at, created_at, updated_at,
            start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        shift.id,
        shift.job_id,
        shift.shift_date,
        shift.duration_seconds,
        shift.tips_cents,
        shift.hourly_rate_cents,
        shift.note,
        shift.deleted_at,
        shift.created_at,
        shift.updated_at,
        shift.start_time,
        shift.end_time
      );
    }

    const foreignKeyProblems = await transaction.getAllAsync<Record<string, unknown>>(
      'PRAGMA foreign_key_check;'
    );
    if (foreignKeyProblems.length !== 0) {
      throw new Error('The restored rows failed the foreign-key check.');
    }

    const actual = await readBackupRows(transaction);
    assertBackupRowsEqual(backup, actual);
    restored = actual;
  });

  return restored;
}

async function readBackupRows(database: RowReader): Promise<BackupRows> {
  const [jobs, shifts] = await Promise.all([
    database.getAllAsync<BackupJob>(JOBS_SQL),
    database.getAllAsync<BackupShift>(SHIFTS_SQL),
  ]);
  return { jobs, shifts };
}
