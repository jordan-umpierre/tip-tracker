import { getDb } from './db';
import {
  readBackupRowsInDatabase,
  restoreBackupInDatabase,
} from './backupRepository';
import { buildBackupJson } from '../lib/backup';
import type { BackupRows, TipTrackerBackup } from '../lib/backup';

export async function createBackupJson(exportedAt = new Date()): Promise<string> {
  const database = await getDb();
  let rows!: BackupRows;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    rows = await readBackupRowsInDatabase(transaction);
  });

  return buildBackupJson(
    rows.jobs,
    rows.shifts,
    rows.federal_withholding_settings,
    exportedAt
  );
}

export async function restoreBackup(backup: TipTrackerBackup): Promise<BackupRows> {
  return restoreBackupInDatabase(await getDb(), backup);
}
