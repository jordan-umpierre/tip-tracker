import assert from 'node:assert/strict';
import { createRetryablePromise } from './retryablePromise.ts';

let attempts = 0;
const open = createRetryablePromise(async () => {
  attempts += 1;
  if (attempts === 1) throw new Error('temporary open failure');
  return 'database';
});

await assert.rejects(open(), /temporary open failure/);
assert.equal(await open(), 'database', 'a failed open must be retried');
assert.equal(attempts, 2, 'only the failed open and one retry should run');

const concurrentAttempts: number[] = [];
const openOnce = createRetryablePromise(async () => {
  concurrentAttempts.push(1);
  return 'shared database';
});

const [first, second] = await Promise.all([openOnce(), openOnce()]);
assert.equal(first, 'shared database');
assert.equal(second, 'shared database');
assert.equal(concurrentAttempts.length, 1, 'concurrent callers must share one successful open');

console.log('retryable promise OK (6 checks)');
