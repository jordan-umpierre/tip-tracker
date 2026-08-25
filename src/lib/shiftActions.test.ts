import assert from 'node:assert/strict';
import { deleteShiftWithFeedback } from './shiftActions.ts';

let deletedId: string | null = null;
let refreshCount = 0;
let reportedCause: unknown = null;

await deleteShiftWithFeedback(
  'shift-1',
  async (id) => {
    deletedId = id;
  },
  () => {
    refreshCount += 1;
  },
  (cause) => {
    reportedCause = cause;
  }
);

assert.equal(deletedId, 'shift-1');
assert.equal(refreshCount, 1, 'a successful delete should refresh once');
assert.equal(reportedCause, null, 'a successful delete should not report a failure');

const failure = new Error('database is unavailable');
await deleteShiftWithFeedback(
  'shift-2',
  async () => {
    throw failure;
  },
  () => {
    refreshCount += 1;
  },
  (cause) => {
    reportedCause = cause;
  }
).catch(() => undefined);

assert.equal(refreshCount, 1, 'a failed delete must not refresh the list');
assert.equal(reportedCause, failure, 'a failed delete must reach visible error handling');

console.log('shift actions OK (5 checks)');
