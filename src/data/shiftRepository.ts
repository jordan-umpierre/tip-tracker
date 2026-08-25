import type { SqlValue } from './databaseTypes.ts';

export type ShiftDatabase = {
  runAsync(source: string, ...params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
};

export type Shift = {
  id: string;
  job_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number;
  tips_cents: number;
  hourly_rate_cents: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export function listShiftsInDatabase(database: ShiftDatabase): Promise<Shift[]> {
  return database.getAllAsync<Shift>(
    `SELECT id, job_id, shift_date, start_time, end_time, duration_seconds,
            tips_cents, hourly_rate_cents, note, created_at, updated_at
     FROM shifts
     WHERE deleted_at IS NULL
     ORDER BY shift_date DESC;`
  );
}

export async function deleteShiftInDatabase(
  database: ShiftDatabase,
  id: string,
  deletedAt: string
): Promise<void> {
  await database.runAsync(
    `UPDATE shifts SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    deletedAt,
    deletedAt,
    id
  );
}
