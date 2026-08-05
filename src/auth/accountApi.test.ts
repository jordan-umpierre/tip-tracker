import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AccountDeletedError,
  AccountIdentityMismatchError,
  AccountUnavailableError,
  verifyBackendAccount,
} from './accountApi.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const session = { accessToken: 'token-one', userId: USER };
const accountBody = JSON.stringify({
  createdAt: '2026-08-05T12:00:00.000Z',
  id: USER,
});

test('verifies the backend identity with only a bearer token', async () => {
  const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const account = await verifyBackendAccount('https://api.example.com', session, async () => null, {
    fetch: async (input, init) => {
      requests.push({ input, init });
      return new Response(accountBody, { status: 200 });
    },
  });

  assert.equal(account.id, USER);
  assert.equal(requests[0]?.input, 'https://api.example.com/v1/me');
  assert.deepEqual(requests[0]?.init?.headers, { Authorization: 'Bearer token-one' });
  assert.equal(requests[0]?.init?.method, 'GET');
});

test('refreshes once after 401 and retries with the replacement token', async () => {
  const tokens: string[] = [];
  let refreshes = 0;
  const account = await verifyBackendAccount(
    'https://api.example.com',
    session,
    async () => {
      refreshes += 1;
      return { accessToken: 'token-two', userId: USER };
    },
    {
      fetch: async (_input, init) => {
        tokens.push((init?.headers as Record<string, string>).Authorization);
        return tokens.length === 1
          ? new Response('', { status: 401 })
          : new Response(accountBody, { status: 200 });
      },
    }
  );

  assert.equal(account.id, USER);
  assert.equal(refreshes, 1);
  assert.deepEqual(tokens, ['Bearer token-one', 'Bearer token-two']);
});

test('rejects deleted, mismatched, malformed, and repeated unauthorized responses', async () => {
  await assert.rejects(
    verifyBackendAccount('https://api.example.com', session, async () => null, {
      fetch: async () => new Response('', { status: 410 }),
    }),
    AccountDeletedError
  );
  await assert.rejects(
    verifyBackendAccount('https://api.example.com', session, async () => null, {
      fetch: async () =>
        new Response(JSON.stringify({ createdAt: '2026-08-05T12:00:00.000Z', id: OTHER })),
    }),
    AccountIdentityMismatchError
  );
  await assert.rejects(
    verifyBackendAccount('https://api.example.com', session, async () => null, {
      fetch: async () => new Response('{bad json'),
    }),
    AccountUnavailableError
  );
  let calls = 0;
  await assert.rejects(
    verifyBackendAccount(
      'https://api.example.com',
      session,
      async () => ({ accessToken: 'token-two', userId: USER }),
      { fetch: async () => { calls += 1; return new Response('', { status: 401 }); } }
    ),
    AccountUnavailableError
  );
  assert.equal(calls, 2);

  await assert.rejects(
    verifyBackendAccount(
      'https://api.example.com',
      session,
      async () => { throw new Error('provider detail'); },
      { fetch: async () => new Response('', { status: 401 }) }
    ),
    (error: unknown) =>
      error instanceof AccountUnavailableError && !error.message.includes('provider detail')
  );
});

test('bounds responses and aborts requests at the configured timeout', async () => {
  await assert.rejects(
    verifyBackendAccount('https://api.example.com', session, async () => null, {
      fetch: async () => new Response('x'.repeat(4_097)),
    }),
    /too large/
  );

  await assert.rejects(
    verifyBackendAccount('https://api.example.com', session, async () => null, {
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    }),
    AccountUnavailableError
  );
});
