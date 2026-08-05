export type AccountSession = {
  accessToken: string;
  userId: string;
};

export type VerifiedAccount = {
  createdAt: string;
  id: string;
};

type RefreshSession = () => Promise<AccountSession | null>;

export class AccountDeletedError extends Error {}
export class AccountIdentityMismatchError extends Error {}
export class AccountUnavailableError extends Error {}

export async function verifyBackendAccount(
  apiUrl: string,
  session: AccountSession,
  refreshSession: RefreshSession,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<VerifiedAccount> {
  assertSession(session);
  const fetchImplementation = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('The account request timeout is invalid.');
  }

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
