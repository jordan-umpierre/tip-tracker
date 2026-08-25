import assert from 'node:assert/strict';
import { hoursInputValue, moneyInputValue } from './format.ts';
import { parseShiftDetailsInput } from './shiftDetails.ts';

for (let seconds = 1; seconds <= 24 * 60 * 60; seconds += 1) {
  const result = parseShiftDetailsInput({
    hours: hoursInputValue(seconds),
    tips: '0.00',
    hourlyRate: '15.00',
    note: '',
    startTime: null,
    endTime: null,
    elapsedSeconds: null,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.durationSeconds, seconds);
  }
}

for (const cents of [0, 1, 99, 100, 1501, 1550, 4275, 123456]) {
  const result = parseShiftDetailsInput({
    hours: '1',
    tips: moneyInputValue(cents),
    hourlyRate: moneyInputValue(cents),
    note: '  closing shift  ',
    startTime: null,
    endTime: null,
    elapsedSeconds: null,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.tipsCents, cents);
    assert.equal(result.value.hourlyRateCents, cents);
    assert.equal(result.value.note, 'closing shift');
  }
}

assert.deepEqual(
  parseShiftDetailsInput({
    hours: '',
    tips: '',
    hourlyRate: '20',
    note: '',
    startTime: '21:00',
    endTime: '05:00',
    elapsedSeconds: 8 * 60 * 60,
  }),
  {
    ok: true,
    value: {
      durationSeconds: 8 * 60 * 60,
      tipsCents: 0,
      hourlyRateCents: 2000,
      note: null,
      durationWasEntered: false,
    },
  }
);

const base = {
  hours: '8',
  tips: '10',
  hourlyRate: '20',
  note: '',
  startTime: null,
  endTime: null,
  elapsedSeconds: null,
};

assert.deepEqual(parseShiftDetailsInput({ ...base, hours: '8 hours' }), {
  ok: false,
  error: 'invalid-numbers',
});
assert.deepEqual(parseShiftDetailsInput({ ...base, tips: '-1' }), {
  ok: false,
  error: 'invalid-numbers',
});
assert.deepEqual(parseShiftDetailsInput({ ...base, startTime: '09:00' }), {
  ok: false,
  error: 'incomplete-times',
});
assert.deepEqual(parseShiftDetailsInput({ ...base, hours: '', elapsedSeconds: null }), {
  ok: false,
  error: 'invalid-duration',
});

console.log('shift details OK');
