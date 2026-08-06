import {
  acknowledgeMutation,
  acknowledgeUnsyncedPhysicalDelete,
  applyRemoteChanges,
  blockMutation,
  inspectLocalAccountState,
  persistRemoteMutationConflict,
  readBlockedMutations,
  readNextMutationSnapshot,
  readSyncCursor,
  RemoteChangeConflictError,
  SyncAccountMismatchError,
  type JsonValue,
  type SyncDatabase,
} from '../data/sync.ts';
import {
  decodeMutationSuccess,
  decodeSyncPage,
  InvalidSyncResponseError,
  MAX_SYNC_RESPONSE_BYTES,
  readErrorCode,
  serializeMutation,
  toRemoteBatch,
  type RemoteWireChange,
} from './wire.ts';

type SyncSession = {
  accessToken: string;
  userId: string;
};

export type SyncRunResult = {
  pulled: number;
  pushed: number;
  status:
    | 'blocked'
    | 'deleted'
    | 'mismatch'
    | 'pending_offline'
    | 'sign_in_again'
    | 'up_to_date';
};

type Dependencies = {
  apiUrl: string;
  database: SyncDatabase;
  fetch?: typeof fetch;
  now?: () => Date;
  random?: () => number;
  refreshSession: () => Promise<SyncSession | null>;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
};

type RequestResult =
  | { kind: 'response'; response: Response }
  | { kind: 'pending_offline' | 'sign_in_again' | 'mismatch' };

const MAX_TRANSIENT_ATTEMPTS = 3;

export function createSyncRunner(dependencies: Dependencies) {
  let active: Promise<SyncRunResult> | null = null;
  return {
    run(session: SyncSession): Promise<SyncRunResult> {
      if (active) return active;
      active = runSync(dependencies, session).finally(() => {
        active = null;
      });
      return active;
    },
  };
}

async function runSync(
  dependencies: Dependencies,
  initialSession: SyncSession
): Promise<SyncRunResult> {
  assertSession(initialSession);
  const local = await inspectLocalAccountState(dependencies.database);
  if (local.accountId !== initialSession.userId) return result('mismatch');
  if ((await readBlockedMutations(dependencies.database)).length > 0) {
    return result('blocked');
  }

  let session = initialSession;
  let pushed = 0;
  while (true) {
    const snapshot = await readNextMutationSnapshot(dependencies.database);
    if (!snapshot) break;
    if (snapshot.accountId !== session.userId) return result('mismatch', pushed);

    if (snapshot.operation === 'delete' && snapshot.baseServerVersion === null) {
      await acknowledgeUnsyncedPhysicalDelete(dependencies.database, snapshot);
      continue;
    }

    const body = serializeMutation(snapshot);
    const requested = await requestWithRetry(dependencies, session, (accessToken) => ({
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }), '/v1/sync/mutations');
    if (requested.kind !== 'response') return result(requested.kind, pushed);
    session = requested.session;
    const response = requested.response;
    if (response.status === 410) return result('deleted', pushed);

    const decoded = await readBoundedJson(response).catch(() => ({ error: 'invalid_response' }));
    if (response.status === 200) {
      try {
        const change = decodeMutationSuccess(decoded, snapshot.operationId);
        if (change.entityType !== snapshot.entityType || change.entityId !== snapshot.entityId) {
          throw new InvalidSyncResponseError('The mutation response changed identity.');
        }
        await acknowledgeMutation(dependencies.database, {
          accountId: snapshot.accountId,
          localSequence: snapshot.operationId,
          entityType: snapshot.entityType,
          entityId: snapshot.entityId,
          serverVersion: change.serverVersion,
          serverChangeSequence: change.changeSequence,
        });
        pushed += 1;
        continue;
      } catch (error) {
        if (!(error instanceof InvalidSyncResponseError)) throw error;
        await savePermanentFailure(dependencies, snapshot.operationId, 'invalid_response', decoded);
        return result('blocked', pushed);
      }
    }

    const code = readErrorCode(decoded);
    const kind = response.status === 409 && code !== 'idempotency_key_reused'
      ? 'conflict'
      : 'permanent';
    await blockMutation(
      dependencies.database,
      { localSequence: snapshot.operationId, kind, code, response: decoded },
      now(dependencies)
    );
    return result('blocked', pushed);
  }

  let pulled = 0;
  let cursor = await readSyncCursor(dependencies.database, session.userId);
  while (true) {
    const requested = await requestWithRetry(
      dependencies,
      session,
      (accessToken) => ({
        headers: { Authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
      `/v1/sync/changes?after=${cursor}&limit=100`
    );
    if (requested.kind !== 'response') return result(requested.kind, pushed, pulled);
    session = requested.session;
    if (requested.response.status === 410) return result('deleted', pushed, pulled);
    if (requested.response.status !== 200) return result('blocked', pushed, pulled);

    let raw: unknown;
    let page;
    try {
      raw = await readBoundedJson(requested.response);
      page = decodeSyncPage(raw, cursor);
    } catch {
      return result('blocked', pushed, pulled);
    }

    try {
      await applyRemoteChanges(dependencies.database, toRemoteBatch(session.userId, page));
    } catch (error) {
      if (!(error instanceof RemoteChangeConflictError)) throw error;
      const remote = page.changes.find((change) =>
        change.entityType === error.entityType && change.entityId === error.entityId
      );
      if (!remote) throw new InvalidSyncResponseError('The conflicting remote row is missing.');
      await persistRemoteMutationConflict(
        dependencies.database,
        {
          accountId: session.userId,
          entityType: error.entityType,
          entityId: error.entityId,
          response: { error: 'remote_change_conflict', remote },
        },
        now(dependencies)
      );
      return result('blocked', pushed, pulled);
    }
    pulled += page.changes.length;
    cursor = page.nextCursor;
    if (!page.hasMore) return result('up_to_date', pushed, pulled);
  }
}

async function requestWithRetry(
  dependencies: Dependencies,
  initialSession: SyncSession,
  makeRequest: (accessToken: string) => RequestInit,
  path: string
): Promise<RequestResult & { session: SyncSession }> {
  const fetchImplementation = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let session = initialSession;
  let refreshed = false;
  let transientAttempt = 0;

  while (transientAttempt < MAX_TRANSIENT_ATTEMPTS) {
    let response: Response;
    try {
      response = await timedFetch(
        fetchImplementation,
        `${dependencies.apiUrl}${path}`,
        makeRequest(session.accessToken),
        dependencies.timeoutMs ?? 10_000
      );
    } catch {
      transientAttempt += 1;
      if (transientAttempt === MAX_TRANSIENT_ATTEMPTS) {
        return { kind: 'pending_offline', session };
      }
      await sleep(retryDelay(dependencies, transientAttempt));
      continue;
    }

    if (response.status === 401) {
      if (refreshed) return { kind: 'sign_in_again', session };
      const replacement = await dependencies.refreshSession().catch(() => null);
      if (!replacement) return { kind: 'sign_in_again', session };
      assertSession(replacement);
      if (replacement.userId !== initialSession.userId) return { kind: 'mismatch', session };
      session = replacement;
      refreshed = true;
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      transientAttempt += 1;
      if (transientAttempt === MAX_TRANSIENT_ATTEMPTS) {
        return { kind: 'pending_offline', session };
      }
      await sleep(retryDelay(dependencies, transientAttempt));
      continue;
    }
    return { kind: 'response', response, session };
  }
  return { kind: 'pending_offline', session };
}

async function timedFetch(
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('The sync request timeout is invalid.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImplementation(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedJson(response: Response): Promise<{ [key: string]: JsonValue }> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_RESPONSE_BYTES) {
    throw new InvalidSyncResponseError('The sync response was too large.');
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_SYNC_RESPONSE_BYTES) {
    throw new InvalidSyncResponseError('The sync response was too large.');
  }
  const decoded: unknown = JSON.parse(text);
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new InvalidSyncResponseError('The sync response was invalid.');
  }
  return decoded as { [key: string]: JsonValue };
}

async function savePermanentFailure(
  dependencies: Dependencies,
  localSequence: number,
  code: string,
  response: unknown
) {
  await blockMutation(
    dependencies.database,
    { localSequence, kind: 'permanent', code, response },
    now(dependencies)
  );
}

function retryDelay(dependencies: Dependencies, attempt: number) {
  const random = dependencies.random?.() ?? Math.random();
  const jitter = Number.isFinite(random) ? Math.max(0, Math.min(0.999, random)) : 0;
  return 100 * (2 ** (attempt - 1)) + Math.floor(jitter * 50);
}

function now(dependencies: Dependencies) {
  return dependencies.now?.() ?? new Date();
}

function assertSession(session: SyncSession) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      session.userId
    ) ||
    session.accessToken.length === 0
  ) {
    throw new Error('The sync session is invalid.');
  }
}

function result(
  status: SyncRunResult['status'],
  pushed = 0,
  pulled = 0
): SyncRunResult {
  return { status, pushed, pulled };
}
