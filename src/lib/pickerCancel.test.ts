// fallow-ignore-file unused-file -- the pre-commit hook executes this file directly.
// Run from the repo root with: node src/lib/pickerCancel.test.ts
//
// No test runner, same reason as the other files here: Node and node:assert
// already cover a pure module, and the pre-commit hook runs every test file in
// src/lib/.
//
// The point of this file is the two real platform messages below. They were
// read off expo-file-system 57 and confirmed on a device, so if an upgrade
// changes either one, the string in the test is the record of what it used to
// be. The test cannot detect that change on its own -- nothing local can --
// but it pins the behavior against an accidental edit to the pattern.
import assert from 'node:assert/strict';
import { isPickerCancelled } from './pickerCancel.ts';

// The exact messages each platform produces when the user backs out.
assert.equal(
  isPickerCancelled(new Error('File picking was cancelled by the user')),
  true,
  'iOS cancel should be recognized'
);
assert.equal(
  isPickerCancelled(new Error('The file picker was cancelled by the user')),
  true,
  'Android cancel should be recognized'
);

// A real failure must not be swallowed. This is the expensive direction to get
// wrong: a hidden write error means the user believes a backup exists when it
// does not.
assert.equal(
  isPickerCancelled(new Error('Failed to write file: no space left on device')),
  false,
  'a write failure is not a cancel'
);

// Guards the pattern against being loosened to /cancel/. A failure that merely
// mentions cancellation is still a failure, and it has to keep reporting.
assert.equal(
  isPickerCancelled(new Error('Write cancelled: the directory became unavailable')),
  false,
  'a failure mentioning cancellation is not a user cancel'
);

// A catch block receives `unknown`, so anything at all can land here. None of
// these have a `.message` to read, and none should throw on the way through.
assert.equal(isPickerCancelled(undefined), false, 'undefined is not a cancel');
assert.equal(isPickerCancelled(null), false, 'null is not a cancel');
assert.equal(
  isPickerCancelled('File picking was cancelled by the user'),
  false,
  'a bare string is not an Error and should not match'
);
assert.equal(
  isPickerCancelled({ message: 'File picking was cancelled by the user' }),
  false,
  'a plain object shaped like an Error should not match'
);

console.log('picker cancel OK (8 checks)');
