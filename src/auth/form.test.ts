import assert from 'node:assert/strict';
import { readAuthCredentials } from './form.ts';

assert.deepEqual(readAuthCredentials(' person@example.com ', ' pass word '), {
  email: 'person@example.com',
  password: ' pass word ',
});
for (const email of ['', 'person', 'person @example.com', `${'a'.repeat(250)}@x.com`]) {
  assert.throws(() => readAuthCredentials(email, 'password'), /email/);
}
assert.throws(() => readAuthCredentials('person@example.com', ''), /password/);
assert.throws(
  () => readAuthCredentials('person@example.com', 'x'.repeat(1_025)),
  /password/
);

console.log('auth form validation OK');
