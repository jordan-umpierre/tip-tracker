import assert from 'node:assert/strict';
import { loadAuthSetup, readAuthConfig } from './config.ts';

const complete = {
  EXPO_PUBLIC_API_URL: 'https://api.example.com/',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
};

assert.equal(readAuthConfig({}), null);
assert.deepEqual(readAuthConfig(complete), {
  apiUrl: 'https://api.example.com',
  supabasePublishableKey: 'sb_publishable_test',
  supabaseUrl: 'https://project.supabase.co',
});

assert.throws(
  () => readAuthConfig({ ...complete, EXPO_PUBLIC_API_URL: '' }),
  /incomplete/
);
for (const badUrl of [
  'not-a-url',
  'ftp://api.example.com',
  'https://user:password@api.example.com',
  'https://api.example.com/path',
  'https://api.example.com?secret=value',
]) {
  assert.throws(
    () => readAuthConfig({ ...complete, EXPO_PUBLIC_API_URL: badUrl }),
    /EXPO_PUBLIC_API_URL/
  );
}

assert.throws(
  () => readAuthConfig({ ...complete, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000' }),
  /HTTPS/
);
assert.equal(
  readAuthConfig(
    { ...complete, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000' },
    true
  )?.apiUrl,
  'http://127.0.0.1:3000'
);
assert.deepEqual(
  loadAuthSetup({ ...complete, EXPO_PUBLIC_SUPABASE_URL: 'broken' }),
  { config: null, error: 'Cloud account configuration is invalid.' }
);

console.log('auth config OK');
