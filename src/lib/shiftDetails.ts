export type ShiftDetailsInput = {
  hours: string;
  tips: string;
  hourlyRate: string;
  note: string;
  startTime: string | null;
  endTime: string | null;
  elapsedSeconds: number | null;
};

export type ShiftDetailsValue = {
  durationSeconds: number;
  tipsCents: number;
  hourlyRateCents: number;
  note: string | null;
  durationWasEntered: boolean;
};

export type ShiftDetailsResult =
  | { ok: true; value: ShiftDetailsValue }
  | { ok: false; error: 'invalid-numbers' | 'incomplete-times' | 'invalid-duration' };

export function parseShiftDetailsInput(input: ShiftDetailsInput): ShiftDetailsResult {
  const hoursValue = input.hours.trim() === '' ? null : Number(input.hours);
  const tipsValue = input.tips.trim() === '' ? 0 : Number(input.tips);
  const rateValue = Number(input.hourlyRate);

  if (
    (hoursValue !== null && !Number.isFinite(hoursValue)) ||
    !Number.isFinite(tipsValue) ||
    tipsValue < 0 ||
    input.hourlyRate.trim() === '' ||
    !Number.isFinite(rateValue) ||
    rateValue < 0
  ) {
    return { ok: false, error: 'invalid-numbers' };
  }

  if ((input.startTime !== null) !== (input.endTime !== null)) {
    return { ok: false, error: 'incomplete-times' };
  }

  const durationSeconds = hoursValue === null
    ? input.elapsedSeconds
    : Math.round(hoursValue * 3600);

  if (durationSeconds === null || durationSeconds <= 0) {
    return { ok: false, error: 'invalid-duration' };
  }

  return {
    ok: true,
    value: {
      durationSeconds,
      tipsCents: Math.round(tipsValue * 100),
      hourlyRateCents: Math.round(rateValue * 100),
      note: input.note.trim() === '' ? null : input.note.trim(),
      durationWasEntered: hoursValue !== null,
    },
  };
}
