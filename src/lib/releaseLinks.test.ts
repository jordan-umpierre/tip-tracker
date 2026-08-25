import assert from 'node:assert/strict';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from './releaseLinks.ts';

for (const [name, value, pathname] of [
  ['privacy policy', PRIVACY_POLICY_URL, '/tip-tracker/privacy/'],
  ['support', SUPPORT_URL, '/tip-tracker/support/'],
] as const) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${name} must use HTTPS`);
  assert.equal(url.hostname, 'jordan-umpierre.github.io', `${name} must use the public Pages host`);
  assert.equal(url.pathname, pathname, `${name} must use its published route`);
}

console.log('release links OK (6 checks)');
