import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import type { ShiftImportRow } from '../lib/shiftImportCsv';

// Matches schema.sql's shifts columns verbatim, same reasoning as jobs.ts's
// Job type -- no camelCase mapping layer until something actually needs one.
export type Shift = {
  id: string;
  job_id: string;
  shift_date: string;
  duration_seconds: number;
  tips_cents: number;
  hourly_rate_cents: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export async function createShift(
  jobId: string,
  shiftDate: string,
  durationSeconds: number,
  tipsCents: number,
  hourlyRateCents: number,
  note: string | null
): Promise<string> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  // hourlyRateCents is a required argument here, not something this function
  // looks up from the job. schema.sql is explicit about why: this column is
  // a copy of the job's rate at the moment the shift happened, not a live
  // lookup -- a raise later must not rewrite what last year actually paid.
  // LogShiftForm decides the value: it defaults to the job's current rate,
  // but the user can override it for a special shift.
  //
  // deleted_at is explicitly NULL: a brand new shift is never deleted.
  await db.runAsync(
    `INSERT INTO shifts
       (id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents, note, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);`,
    id,
    jobId,
    shiftDate,
    durationSeconds,
    tipsCents,
    hourlyRateCents,
    note,
    now,
    now
  );

  return id;
}

export async function listShifts(): Promise<Shift[]> {
  const db = await getDb();

  // No filter arguments -- returns every non-deleted shift and leaves any
  // grouping (by job, by month, whatever a screen needs) to the caller.
  // Simplest thing that works for MVP: the dataset is a few thousand rows at
  // most, so there's no performance reason to push filtering into SQL yet,
  // and every screen that exists so far wants "all of it" anyway. Add a
  // filtered variant when a screen actually needs one instead of guessing at
  // the shape now.
  //
  // deleted_at IS NULL is the D4 filter -- a deleted shift keeps its row as
  // a tombstone and has to be excluded here, same as archived_at on jobs.
  // Most recent first, since that's the natural order for a list a user
  // scrolls through.
  return db.getAllAsync<Shift>(
    `SELECT id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents, note, created_at, updated_at
     FROM shifts
     WHERE deleted_at IS NULL
     ORDER BY shift_date DESC;`
  );
}

export async function updateShift(
  id: string,
  jobId: string,
  shiftDate: string,
  durationSeconds: number,
  tipsCents: number,
  hourlyRateCents: number,
  note: string | null
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Same columns as createShift's INSERT, minus id/deleted_at/created_at --
  // this changes what a shift says, not when it was made or whether it's
  // gone. created_at stays untouched on purpose: it records when the row
  // was first made, not last edited. updated_at moves to now, same as
  // deleteShift -- both are writes, and updated_at exists to track "when
  // did this row last change" for eventual sync conflict resolution.
  await db.runAsync(
    `UPDATE shifts
     SET job_id = ?, shift_date = ?, duration_seconds = ?, tips_cents = ?, hourly_rate_cents = ?, note = ?, updated_at = ?
     WHERE id = ?;`,
    jobId,
    shiftDate,
    durationSeconds,
    tipsCents,
    hourlyRateCents,
    note,
    now,
    id
  );
}

export async function deleteShift(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Soft delete, per D4: set the tombstone instead of removing the row.
  // The row has to stay so a second device, once sync exists, has
  // something to receive that says "this one's gone" -- a row that's
  // truly deleted is invisible to a device that never saw it in the first
  // place, and it would just reappear on the next sync.
  await db.runAsync(`UPDATE shifts SET deleted_at = ?, updated_at = ? WHERE id = ?;`, now, now, id);
}

export async function importShifts(jobId: string, rows: ShiftImportRow[]): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();

  // An import is one user action. If row 845 fails, the first 844 must roll
  // back too; a partial financial history is harder to repair than no import.
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const row of rows) {
      await transaction.runAsync(
        `INSERT INTO shifts
           (id, job_id, shift_date, duration_seconds, tips_cents, hourly_rate_cents, note, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);`,
        Crypto.randomUUID(),
        jobId,
        row.shiftDate,
        row.durationSeconds,
        row.tipsCents,
        row.hourlyRateCents,
        row.note,
        now,
        now
      );
    }
  });

  return rows.length;
}
