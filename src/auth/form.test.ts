import assert from 'node:assert/strict';
import {
  MINIMUM_NEW_PASSWORD_LENGTH,
  readAuthCredentials,
  readPasswordReset,
} from './form.ts';

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

// A recovery code is pasted out of an email, so surrounding space is not a
// wrong code -- but six digits is the whole shape, and anything else is.
assert.deepEqual(
  readPasswordReset(' person@example.com ', ' 123456 ', 'a-new-password'),
  { code: '123456', email: 'person@example.com', password: 'a-new-password' }
);
for (const code of ['', '12345', '1234567', '12345a', '12 3456', '\u0661\u0662\u0663\u0664\u0665\u0666']) {
  assert.throws(() => readPasswordReset('person@example.com', code, 'a-new-password'), /six-digit/);
}
assert.throws(() => readPasswordReset('person', '123456', 'a-new-password'), /email/);

// The new password is held to the provider's minimum here so the user learns
// about it before a round trip rather than from a rejected request.
assert.throws(
  () => readPasswordReset('person@example.com', '123456', 'x'.repeat(MINIMUM_NEW_PASSWORD_LENGTH - 1)),
  /at least/
);
assert.deepEqual(
  readPasswordReset('person@example.com', '123456', 'x'.repeat(MINIMUM_NEW_PASSWORD_LENGTH)).password,
  'x'.repeat(MINIMUM_NEW_PASSWORD_LENGTH)
);
assert.throws(
  () => readPasswordReset('person@example.com', '123456', 'x'.repeat(1_025)),
  /too long/
);

console.log('auth form validation OK');
