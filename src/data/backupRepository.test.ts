import assert from 'node:assert/strict';
import type { TipTrackerBackup } from '../lib/backup.ts';
import {
  readBackupRowsInDatabase,
  restoreBackupInDatabase,
} from './backupRepository.ts';
import {
  deleteShiftInDatabase,
  listShiftsInDatabase,
} from './shiftRepository.ts';
import { createTestDatabase } from './testDatabase.ts';

const createdAt = '2026-08-25T12:00:00.000Z';
const backup: TipTrackerBackup = {
  format: 'tip-tracker-backup',
  version: 3,
  schema_version: 5,
  exported_at: createdAt,
  jobs: [
    {
      id: 'job-1',
      name: 'Cafe',
      hourly_rate_cents: 1500,
      archived_at: null,
      created_at: createdAt,
      updated_at: createdAt,
      overtime_enabled: 0,
      workweek_start_weekday: 0,
      workweek_start_time: '00:00',
    },
  ],
  shifts: [
    {
      id: 'shift-1',
      job_id: 'job-1',
      shift_date: '2026-08-25',
      duration_seconds: 8 * 60 * 60,
      tips_cents: 2500,
      hourly_rate_cents: 1500,
      note: 'closing shift',
      deleted_at: null,
      created_at: createdAt,
      updated_at: createdAt,
      start_time: '09:00',
      end_time: '17:00',
    },
  ],
  federal_withholding_settings: [],
};

const database = createTestDatabase();

try {
  await database.loadSchema();
  assert.deepEqual(await restoreBackupInDatabase(database, backup), {
    jobs: backup.jobs,
    shifts: backup.shifts,
    federal_withholding_settings: [],
  });

  await assert.rejects(
    restoreBackupInDatabase(database, backup),
    /requires an empty Tip Tracker database/
  );

  await deleteShiftInDatabase(database, 'shift-1', '2026-08-25T13:00:00.000Z');
  assert.deepEqual(await listShiftsInDatabase(database), []);
  assert.equal(
    (await readBackupRowsInDatabase(database)).shifts[0].deleted_at,
    '2026-08-25T13:00:00.000Z',
    'a deleted shift must remain in lossless backup data as a tombstone'
  );
} finally {
  database.close();
}

console.log('backup repository OK');
