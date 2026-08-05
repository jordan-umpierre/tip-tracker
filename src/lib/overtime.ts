import type { Job } from '../data/jobs';
import type { Shift } from '../data/shifts';
import { parseCalendarDate } from './dates.ts';
import { calculateShiftGrossCents } from './totals.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const OVERTIME_AFTER_SECONDS = 40 * 60 * 60;

export type OvertimeShift = {
  shiftId: string;
  regularSeconds: number;
  overtimeSeconds: number;
  estimatedGrossCents: number;
};

type WorkSegment = {
  shift: Shift;
  weekStart: number;
  startedAt: number;
  durationSeconds: number;
  inputIndex: number;
};

function timeMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

function dateTimestamp(shift: Shift): number {
  const date = parseCalendarDate(shift.shift_date);
  if (!date) throw new Error(`Invalid shift date: ${shift.shift_date}`);
  return Date.UTC(date.year, date.month - 1, date.day);
}

function workweekStart(
  timestamp: number,
  weekday: number,
  startMinutes: number
): number {
  const date = new Date(timestamp);
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceStart = (date.getUTCDay() - weekday + 7) % 7;
  let boundary = dayStart - daysSinceStart * DAY_MS + startMinutes * 60 * 1000;
  if (boundary > timestamp) boundary -= WEEK_MS;
  return boundary;
}

// fallow-ignore-next-line complexity -- Boundary branches are asserted in overtime.test.ts.
function shiftSegments(shift: Shift, job: Job, inputIndex: number): WorkSegment[] {
  const dayStart = dateTimestamp(shift);

  // Old shifts have no clock times. Grouping their whole duration by date and
  // weekday is the midnight approximation recorded in D18; using the job's
  // hour here would pretend to know which side of that hour the work occurred.
  if (!shift.start_time || !shift.end_time) {
    const weekStart = workweekStart(dayStart, job.workweek_start_weekday, 0);
    return [{ shift, weekStart, startedAt: dayStart, durationSeconds: shift.duration_seconds, inputIndex }];
  }

  const startedAt = dayStart + timeMinutes(shift.start_time) * 60 * 1000;
  let endedAt = dayStart + timeMinutes(shift.end_time) * 60 * 1000;
  if (endedAt <= startedAt) endedAt += DAY_MS;

  const startMinutes = timeMinutes(job.workweek_start_time);
  const firstWeekStart = workweekStart(startedAt, job.workweek_start_weekday, startMinutes);
  const nextWeekStart = firstWeekStart + WEEK_MS;

  if (endedAt <= nextWeekStart) {
    return [{ shift, weekStart: firstWeekStart, startedAt, durationSeconds: shift.duration_seconds, inputIndex }];
  }

  // Clock times place the work, while duration_seconds remains authoritative.
  // If paid duration differs from elapsed time because of a break, divide it
  // across the boundary in the same proportion and keep the rounded remainder
  // on the second side so no stored second is lost.
  const firstDuration = Math.round(
    shift.duration_seconds * ((nextWeekStart - startedAt) / (endedAt - startedAt))
  );

  return [
    { shift, weekStart: firstWeekStart, startedAt, durationSeconds: firstDuration, inputIndex },
    {
      shift,
      weekStart: nextWeekStart,
      startedAt: nextWeekStart,
      durationSeconds: shift.duration_seconds - firstDuration,
      inputIndex,
    },
  ];
}

export function calculateOvertime(shifts: Shift[], job: Job): OvertimeShift[] {
  const jobShifts = shifts.filter((shift) => shift.job_id === job.id);
  const results = new Map(
    jobShifts.map((shift) => [
      shift.id,
      {
        shiftId: shift.id,
        regularSeconds: shift.duration_seconds,
        overtimeSeconds: 0,
        estimatedGrossCents: calculateShiftGrossCents(shift),
      },
    ])
  );

  if (!job.overtime_enabled) return [...results.values()];

  const segments = jobShifts
    .flatMap((shift, index) => shiftSegments(shift, job, index))
    .sort((a, b) =>
      a.weekStart - b.weekStart || a.startedAt - b.startedAt || a.inputIndex - b.inputIndex
    );

  let currentWeek = Number.NaN;
  let workedSeconds = 0;

  for (const segment of segments) {
    if (segment.weekStart !== currentWeek) {
      currentWeek = segment.weekStart;
      workedSeconds = 0;
    }

    const regularSeconds = Math.min(
      segment.durationSeconds,
      Math.max(0, OVERTIME_AFTER_SECONDS - workedSeconds)
    );
    const overtimeSeconds = segment.durationSeconds - regularSeconds;
    const result = results.get(segment.shift.id)!;

    result.regularSeconds += regularSeconds - segment.durationSeconds;
    result.overtimeSeconds += overtimeSeconds;
    workedSeconds += segment.durationSeconds;
  }

  for (const shift of jobShifts) {
    const result = results.get(shift.id)!;
    // Straight-time gross already follows D5's per-shift rounding rule. Add
    // the extra half-rate once per shift so no-overtime results stay identical
    // to every existing Log, Trends, and export calculation.
    result.estimatedGrossCents += Math.round(
      (result.overtimeSeconds * shift.hourly_rate_cents) / (2 * 60 * 60)
    );
  }

  return [...results.values()];
}
