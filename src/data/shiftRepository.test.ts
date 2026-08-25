import assert from 'node:assert/strict';
import { createTestDatabase } from './testDatabase.ts';
import { deleteShiftInDatabase, listShiftsInDatabase } from './shiftRepository.ts';

const database = createTestDatabase();

try {
  await database.loadSchema();
  await database.runAsync(
    `INSERT INTO jobs
       (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?);`,
    'job-1',
    'Cafe',
    1500,
    '2026-08-25T12:00:00.000Z',
    '2026-08-25T12:00:00.000Z'
  );
  await database.runAsync(
    `INSERT INTO shifts
       (id, job_id, shift_date, duration_seconds, tips_cents,
        hourly_rate_cents, note, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?);`,
    'shift-1',
    'job-1',
    '2026-08-25',
    8 * 60 * 60,
    2500,
    1500,
    '2026-08-25T12:00:00.000Z',
    '2026-08-25T12:00:00.000Z'
  );

  assert.deepEqual((await listShiftsInDatabase(database)).map((shift) => shift.id), ['shift-1']);

  await deleteShiftInDatabase(database, 'shift-1', '2026-08-25T13:00:00.000Z');

  assert.deepEqual(await listShiftsInDatabase(database), []);
} finally {
  database.close();
}

console.log('shift repository OK');
