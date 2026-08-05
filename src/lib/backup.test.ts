// Run from the repo root with: node src/lib/backup.test.ts
//
// A backup is a financial-data trust boundary. These direct assertions prove
// malformed or newer documents fail before the data layer can open SQLite.
import assert from 'node:assert/strict';
import {
  backupFileName,
  buildBackupJson,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_JOBS,
  MAX_BACKUP_SHIFTS,
  parseBackupJson,
} from './backup.ts';
import type { BackupJob, BackupShift, TipTrackerBackup } from './backup.ts';

const CREATED = '2026-08-04T12:30:00.000Z';

function job(changes: Partial<BackupJob> = {}): BackupJob {
  return {
    id: 'job-a',
    name: 'Diner',
    hourly_rate_cents: 1200,
    archived_at: null,
    created_at: CREATED,
    updated_at: CREATED,
    overtime_enabled: 0,
    workweek_start_weekday: 0,
    workweek_start_time: '00:00',
    ...changes,
  };
}

function shift(changes: Partial<BackupShift> = {}): BackupShift {
  return {
    id: 'shift-a',
    job_id: 'job-a',
    shift_date: '2026-08-03',
    duration_seconds: 27300,
    tips_cents: 2000,
    hourly_rate_cents: 1550,
    note: null,
    deleted_at: null,
    created_at: CREATED,
    updated_at: CREATED,
    start_time: null,
    end_time: null,
    ...changes,
  };
}

function backup(changes: Partial<TipTrackerBackup> = {}): TipTrackerBackup {
  return {
    format: 'tip-tracker-backup',
    version: 1,
    schema_version: 3,
    exported_at: CREATED,
    jobs: [job()],
    shifts: [shift()],
    ...changes,
  };
}

function parse(value: unknown): TipTrackerBackup {
  return parseBackupJson(JSON.stringify(value));
}

function rejects(value: unknown, pattern: RegExp): void {
  assert.throws(() => parse(value), pattern);
}

const exactJobs = [
  job({ id: 'job-z', name: '', archived_at: CREATED }),
  job({
    id: 'legacy-text-id',
    name: 'Café, 夜',
    overtime_enabled: 1,
    workweek_start_weekday: 3,
    workweek_start_time: '06:00',
  }),
];
const exactShifts = [
  shift({ id: 'shift-z', job_id: 'job-z', tips_cents: 0, hourly_rate_cents: 0, deleted_at: CREATED }),
  shift({
    id: 'shift-a',
    job_id: 'legacy-text-id',
    note: 'Slow, then "busy"\nafter 9 — 夜',
    start_time: '17:30',
    end_time: '01:05',
  }),
];

const json = buildBackupJson(exactJobs, exactShifts, new Date(CREATED));
const exact = parseBackupJson(json);
assert.deepEqual(exact.jobs, [...exactJobs].sort((a, b) => a.id.localeCompare(b.id)));
assert.deepEqual(exact.shifts, [...exactShifts].sort((a, b) => a.id.localeCompare(b.id)));
assert.equal(exact.exported_at, CREATED);
assert.ok(json.endsWith('\n'));
assert.deepEqual(parse({ ...backup(), jobs: [], shifts: [] }).jobs, []);

// The filename uses local wall-clock parts, matching the existing CSV export.
assert.equal(
  backupFileName(new Date(2026, 7, 4, 9, 7, 4)),
  'tip-tracker-backup-2026-08-04-090704.json'
);

assert.throws(() => parseBackupJson('{bad'), /not valid JSON/);
assert.throws(() => parseBackupJson('é'.repeat(MAX_BACKUP_BYTES / 2 + 1)), /larger than 10 MB/);
rejects([], /must be an object/);
rejects({ ...backup(), extra: true }, /missing or unknown fields/);
const missing = backup() as Record<string, unknown>;
delete missing.exported_at;
rejects(missing, /missing or unknown fields/);
rejects({ ...backup(), format: 'other' }, /not a Tip Tracker backup/);
rejects({ ...backup(), version: 2 }, /version is not supported/);
rejects({ ...backup(), schema_version: 4 }, /database version is not supported/);
rejects({ ...backup(), exported_at: 'yesterday' }, /ISO timestamp/);
rejects({ ...backup(), jobs: null }, /jobs and shifts arrays/);
rejects({ ...backup(), jobs: new Array(MAX_BACKUP_JOBS + 1).fill(null) }, /more than 1000 jobs/);
rejects({ ...backup(), shifts: new Array(MAX_BACKUP_SHIFTS + 1).fill(null) }, /more than 20000 shifts/);

rejects({ ...backup(), jobs: [{ ...job(), extra: true }] }, /missing or unknown fields/);
rejects({ ...backup(), jobs: [job({ id: '' })] }, /nonempty text/);
rejects({ ...backup(), jobs: [job({ hourly_rate_cents: -1 })] }, /nonnegative safe integer/);
rejects({ ...backup(), jobs: [job({ overtime_enabled: 2 })] }, /must be 0 or 1/);
rejects({ ...backup(), jobs: [job({ workweek_start_weekday: 7 })] }, /0 through 6/);
rejects({ ...backup(), jobs: [job({ workweek_start_time: '24:00' })] }, /must be HH:MM/);
rejects({ ...backup(), jobs: [job(), job()] }, /duplicate job id/);

rejects({ ...backup(), shifts: [{ ...shift(), extra: true }] }, /missing or unknown fields/);
rejects({ ...backup(), shifts: [shift({ shift_date: '2026-02-30' })] }, /real YYYY-MM-DD/);
rejects({ ...backup(), shifts: [shift({ duration_seconds: 0 })] }, /positive safe integer/);
rejects({ ...backup(), shifts: [shift({ tips_cents: -1 })] }, /nonnegative safe integer/);
rejects({ ...backup(), shifts: [shift({ note: 4 as unknown as string })] }, /must be text/);
rejects({ ...backup(), shifts: [shift({ start_time: '17:30', end_time: null })] }, /set together/);
rejects({ ...backup(), shifts: [shift({ start_time: '7:30', end_time: '08:00' })] }, /must be HH:MM/);
rejects({ ...backup(), shifts: [shift(), shift()] }, /duplicate shift id/);
rejects({ ...backup(), shifts: [shift({ job_id: 'missing' })] }, /job that is not in the backup/);
rejects({
  ...backup(),
  shifts: [shift({ duration_seconds: Number.MAX_SAFE_INTEGER, hourly_rate_cents: 2 })],
}, /too large to calculate safely/);

assert.throws(
  () => buildBackupJson([job({ archived_at: 'bad' })], [], new Date(CREATED)),
  /ISO timestamp/
);

console.log('backup contract OK');
