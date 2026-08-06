export type AccountSession = {
  accessToken: string;
  userId: string;
};

export type VerifiedAccount = {
  createdAt: string;
  id: string;
};

type RefreshSession = () => Promise<AccountSession | null>;

type RequestOptions = { fetch?: typeof fetch; timeoutMs?: number };

// Both calls below abort on the same schedule. Ten seconds by default, and an
// override has to be a real duration: a caller passing zero or a year would
// otherwise turn the abort into either an instant failure or no timeout at all.
function readTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('The account request timeout is invalid.');
  }
  return timeoutMs;
}

export class AccountDeletedError extends Error {}
export class AccountIdentityMismatchError extends Error {}
export class AccountUnavailableError extends Error {}

export async function verifyBackendAccount(
  apiUrl: string,
  session: AccountSession,
  refreshSession: RefreshSession,
  options: RequestOptions = {}
): Promise<VerifiedAccount> {
  assertSession(session);
  const fetchImplementation = options.fetch ?? fetch;
  const timeoutMs = readTimeoutMs(options.timeoutMs);

  let response = await requestAccount(
    apiUrl,
    session.accessToken,
    fetchImplementation,
    timeoutMs
  );
  let expectedUserId = session.userId;

  if (response.status === 401) {
    let refreshed: AccountSession | null;
    try {
      refreshed = await refreshSession();
    } catch {
      throw new AccountUnavailableError('Your account session could not be refreshed.');
    }
    if (refreshed === null) {
      throw new AccountUnavailableError('Your account session has expired.');
    }
    assertSession(refreshed);
    if (refreshed.userId !== session.userId) {
      throw new AccountIdentityMismatchError(
        'The refreshed session belongs to a different account.'
      );
    }
    expectedUserId = refreshed.userId;
    response = await requestAccount(
      apiUrl,
      refreshed.accessToken,
      fetchImplementation,
      timeoutMs
    );
  }

  if (response.status === 410) {
    throw new AccountDeletedError('This cloud account has been deleted.');
  }
  if (!response.ok) {
    throw new AccountUnavailableError('The cloud account could not be verified.');
  }

  const account = await readAccountResponse(response);
  if (account.id !== expectedUserId) {
    throw new AccountIdentityMismatchError(
      'The app and server returned different account identities.'
    );
  }
  return account;
}

// What the server said about a deletion attempt, reduced to the three answers
// the screen has to act on differently.
//
//   deleted        the cloud copy is gone; drop the local session
//   reauthenticate the token is too old to authorize this; ask for the password
//   pending        the provider failed mid-delete; the account is marked and
//                  repeating the request finishes it
export type AccountDeletionOutcome = 'deleted' | 'pending' | 'reauthenticate';

export async function deleteBackendAccount(
  apiUrl: string,
  session: AccountSession,
  options: RequestOptions = {}
): Promise<AccountDeletionOutcome> {
  assertSession(session);
  const fetchImplementation = options.fetch ?? fetch;
  const timeoutMs = readTimeoutMs(options.timeoutMs);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImplementation(`${apiUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      method: 'DELETE',
      signal: controller.signal,
    });
  } catch {
    throw new AccountUnavailableError('The account deletion request failed.');
  } finally {
    clearTimeout(timeout);
  }

  // 204 is the delete this call performed. 410 is the same account already
  // gone, which is the honest answer to a retry after a dropped response and
  // has to read as success or the user is stuck deleting something that no
  // longer exists.
  if (response.status === 204 || response.status === 410) return 'deleted';

  // 401 is an expired token and 403 is the server's five-minute
  // recent-password rule. Both are fixed the same way -- prove the password
  // again -- so the screen does not need to tell them apart.
  if (response.status === 401 || response.status === 403) return 'reauthenticate';

  // The server tombstoned the account and removed its rows, then Supabase
  // refused to remove the identity. Repeating the request retries only the
  // provider half.
  if (response.status === 503) return 'pending';

  throw new AccountUnavailableError('The cloud account could not be deleted.');
}

async function requestAccount(
  apiUrl: string,
  accessToken: string,
  fetchImplementation: typeof fetch,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImplementation(`${apiUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: 'GET',
      signal: controller.signal,
    });
  } catch {
    throw new AccountUnavailableError('The cloud account request failed.');
  } finally {
    clearTimeout(timeout);
  }
}

async function readAccountResponse(response: Response): Promise<VerifiedAccount> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    throw new AccountUnavailableError('The cloud account response was too large.');
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AccountUnavailableError('The cloud account response could not be read.');
  }
  if (text.length > 4_096) {
    throw new AccountUnavailableError('The cloud account response was too large.');
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AccountUnavailableError('The cloud account response was invalid.');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !isCanonicalAccountId(value.id) ||
    !('createdAt' in value) ||
    typeof value.createdAt !== 'string' ||
    !isIsoTimestamp(value.createdAt)
  ) {
    throw new AccountUnavailableError('The cloud account response was invalid.');
  }
  return { id: value.id, createdAt: value.createdAt };
}

function assertSession(session: AccountSession): void {
  if (!isCanonicalAccountId(session.userId) || session.accessToken.length < 1) {
    throw new AccountUnavailableError('The account session was invalid.');
  }
}

function isCanonicalAccountId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value
  );
}

function isIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
