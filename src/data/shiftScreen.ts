import { getDb } from './db';
import { Job, listActiveJobs, listJobs } from './jobs';
import { listShifts, Shift } from './shifts';

export type ShiftScreenData = {
  jobs: Job[];
  allJobs: Job[];
  shifts: Shift[];
};

// The Log and Settings screens need the same consistent local snapshot. Keep
// the read in one place so a future change cannot make one screen refresh only
// part of the data the other screen displays.
export async function loadShiftScreenData(): Promise<ShiftScreenData> {
  await getDb();
  const [jobs, allJobs, shifts] = await Promise.all([
    listActiveJobs(),
    listJobs(),
    listShifts(),
  ]);
  return { jobs, allJobs, shifts };
}
