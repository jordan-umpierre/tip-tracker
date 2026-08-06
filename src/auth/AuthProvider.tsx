import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { getDb } from '../data/db';
import { SyncAccountMismatchError } from '../data/sync';
import { createSyncRunner, type SyncRunResult } from '../sync/transport';
import {
  confirmAccountConnection,
  prepareAccountConnection,
} from './accountConnection';
import {
  AccountDeletedError,
  AccountIdentityMismatchError,
  verifyBackendAccount,
} from './accountApi';
import { authSetup } from './config';
import { readAuthCredentials } from './form';
import { supabaseClient } from './supabase';

type AccountPhase =
  | 'config_unavailable'
  | 'connecting'
  | 'consent_required'
  | 'connected'
  | 'error'
  | 'mismatch'
  | 'pending_verification'
  | 'signed_out';

type SyncPhase =
  | 'blocked'
  | 'idle'
  | 'mismatch'
  | 'pending_offline'
  | 'sign_in_again'
  | 'syncing'
  | 'up_to_date';

type AuthContextValue = {
  confirmConnection(): Promise<void>;
  createAccount(email: string, password: string): Promise<boolean>;
  dismissNotice(): void;
  email: string | null;
  localRecordCount: number;
  message: string | null;
  phase: AccountPhase;
  retryConnection(): void;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
  syncPhase: SyncPhase;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Two notices are raised from more than one place, so they live here rather
// than being retyped: a small wording drift between paths would read to the
// user as two different things happening.
const ACCOUNT_DELETED_NOTICE =
  'This cloud account has been deleted. Your local data is still here.';
const DEVICE_BOUND_NOTICE =
  'This device belongs to another account. No local data was changed.';

// Dropping the saved login can itself fail. These replace the notice when it
// does, because the original wording claims the device was disconnected when
// the session is in fact still sitting on disk.
const MISMATCH_SIGN_OUT_FAILED =
  'This device belongs to another account, and the saved login could not be removed.';
const DELETED_SIGN_OUT_FAILED =
  'This cloud account was deleted, and the saved login could not be removed.';

// fallow-ignore-next-line complexity -- One provider owns the coupled auth event, refresh, and account-binding lifecycle.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<AccountPhase>(
    authSetup.config && supabaseClient ? 'connecting' : 'config_unavailable'
  );
  const [message, setMessage] = useState<string | null>(authSetup.error);
  const [localRecordCount, setLocalRecordCount] = useState(0);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const syncRunner = useRef<ReturnType<typeof createSyncRunner> | null>(null);
  const pendingVerification = useRef(false);
  const signedOutNotice = useRef<{ message: string; phase: 'mismatch' | 'error' } | null>(
    null
  );

  useEffect(() => {
    if (!supabaseClient) return;
    const client = supabaseClient;

    // Supabase warns against awaiting other auth calls inside this callback.
    // It only mirrors session state; database and network work happen below.
    let data: ReturnType<typeof client.auth.onAuthStateChange>['data'];
    try {
      ({ data } = client.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      }));
    } catch {
      setPhase('config_unavailable');
      setMessage('Cloud accounts could not start. Local features still work.');
      return;
    }

    // Supabase only refreshes tokens on its own while the app is foregrounded,
    // and it wants to be told when that changes. The web branch this used to
    // carry is gone with the web target (D27).
    const updateRefresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    updateRefresh(AppState.currentState);
    const appStateSubscription = AppState.addEventListener('change', updateRefresh);

    return () => {
      data.subscription.unsubscribe();
      appStateSubscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);

  // fallow-ignore-next-line complexity -- Each branch is a tested account connection state, not interchangeable control flow.
  useEffect(() => {
    if (!authSetup.config || !supabaseClient) return;
    if (!session) {
      const notice = signedOutNotice.current;
      if (notice) {
        setPhase(notice.phase);
        setMessage(notice.message);
      } else if (pendingVerification.current) {
        setPhase('pending_verification');
      } else {
        setPhase('signed_out');
      }
      return;
    }

    pendingVerification.current = false;
    let cancelled = false;
    setPhase('connecting');
    setMessage(null);
    void getDb()
      .then((database) => prepareAccountConnection(database, () => verifySession(session)))
      .then((connection) => {
        if (cancelled) return;
        if (connection.state === 'consent_required') {
          setLocalRecordCount(connection.localRecordCount);
          setPhase('consent_required');
        } else {
          setPhase('connected');
        }
      })
      // fallow-ignore-next-line complexity -- Security failures require distinct sign-out and user-copy outcomes.
      .catch(async (error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof SyncAccountMismatchError ||
          error instanceof AccountIdentityMismatchError
        ) {
          signedOutNotice.current = {
            message:
              'This device is already connected to another account. Nothing changed.',
            phase: 'mismatch',
          };
          setPhase('mismatch');
          setMessage(signedOutNotice.current.message);
          if (!(await clearSavedLogin(MISMATCH_SIGN_OUT_FAILED))) setPhase('error');
          return;
        }
        if (error instanceof AccountDeletedError) {
          signedOutNotice.current = { message: ACCOUNT_DELETED_NOTICE, phase: 'error' };
          setPhase('error');
          setMessage(ACCOUNT_DELETED_NOTICE);
          await clearSavedLogin(DELETED_SIGN_OUT_FAILED);
          return;
        }
        setPhase('error');
        setMessage('The cloud account could not be connected. Your local data still works.');
      });

    return () => {
      cancelled = true;
    };
  }, [connectionAttempt, session]);

  const syncNow = useCallback(async () => {
    if (!session || !authSetup.config || !supabaseClient || phase !== 'connected') return;
    setSyncPhase('syncing');
    try {
      const database = await getDb();
      const client = supabaseClient;
      syncRunner.current ??= createSyncRunner({
        apiUrl: authSetup.config.apiUrl,
        database,
        refreshSession: async () => {
          const { data, error } = await client.auth.refreshSession();
          if (error || !data.session) return null;
          return {
            accessToken: data.session.access_token,
            userId: data.session.user.id,
          };
        },
      });
      const synced = await syncRunner.current.run({
        accessToken: session.access_token,
        userId: session.user.id,
      });
      await applySyncResult(synced);
    } catch {
      setSyncPhase('blocked');
    }
  }, [phase, session]);

  useEffect(() => {
    if (phase !== 'connected' || !session) {
      if (!session) setSyncPhase('idle');
      return;
    }

    // Reaching connected means /v1/me and the durable account binding agreed.
    // The same call covers restored sessions and freshly confirmed consent.
    void syncNow();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [phase, session, syncNow]);

  const verifySession = useCallback(async (currentSession: Session) => {
    if (!authSetup.config || !supabaseClient) {
      throw new Error('Cloud account configuration is unavailable.');
    }
    const client = supabaseClient;
    return verifyBackendAccount(
      authSetup.config.apiUrl,
      {
        accessToken: currentSession.access_token,
        userId: currentSession.user.id,
      },
      async () => {
        const { data, error } = await client.auth.refreshSession();
        if (error || !data.session) return null;
        return {
          accessToken: data.session.access_token,
          userId: data.session.user.id,
        };
      }
    );
  }, []);

  const signIn = useCallback(async (emailInput: string, passwordInput: string) => {
    if (!supabaseClient) return false;
    const credentials = beginCredentialAttempt(emailInput, passwordInput);
    if (credentials === null) return false;
    try {
      const { error } = await supabaseClient.auth.signInWithPassword(credentials);
      if (!error) return true;
    } catch {
      // Provider failures use the same bounded message as rejected credentials.
    }
    setPhase('signed_out');
    setMessage('The email or password was not accepted.');
    return false;
  }, []);

  // fallow-ignore-next-line complexity -- A created session and email verification are distinct provider outcomes.
  const createAccount = useCallback(async (emailInput: string, passwordInput: string) => {
    if (!supabaseClient) return false;
    const credentials = beginCredentialAttempt(emailInput, passwordInput);
    if (credentials === null) return false;
    let createdSession: Session | null = null;
    try {
      const { data, error } = await supabaseClient.auth.signUp(credentials);
      if (error) throw error;
      createdSession = data.session;
    } catch {
      setPhase('signed_out');
      setMessage('The account could not be created.');
      return false;
    }
    if (!createdSession) {
      pendingVerification.current = true;
      setPhase('pending_verification');
      setMessage('Check your email to verify the account, then return here to sign in.');
    }
    return true;
  }, []);

  // fallow-ignore-next-line complexity -- Consent rechecks identity and preserves distinct mismatch and retry states.
  const confirmConnection = useCallback(async () => {
    if (!session) return;
    setPhase('connecting');
    setMessage(null);
    try {
      const database = await getDb();
      await confirmAccountConnection(database, () => verifySession(session));
      setPhase('connected');
    } catch (error) {
      if (
        error instanceof SyncAccountMismatchError ||
        error instanceof AccountIdentityMismatchError
      ) {
        signedOutNotice.current = { message: DEVICE_BOUND_NOTICE, phase: 'mismatch' };
        setPhase('mismatch');
        setMessage(DEVICE_BOUND_NOTICE);
        if (!(await clearSavedLogin(MISMATCH_SIGN_OUT_FAILED))) setPhase('error');
      } else {
        setPhase('error');
        setMessage('The account connection failed. No local data was changed.');
      }
    }
  }, [session, verifySession]);

  const signOut = useCallback(async () => {
    if (!supabaseClient) return;
    signedOutNotice.current = null;
    pendingVerification.current = false;
    if (!(await removeLocalSession())) {
      setPhase('error');
      setMessage('The saved login could not be removed from this device.');
    }
  }, []);

  // Every path that discovers this device may no longer use its cloud session
  // ends the same way: drop the saved login, and if that fails, correct the
  // notice instead of leaving a message that says the device was disconnected.
  // Callers that own `phase` still set it themselves, because some of these
  // paths paint the screen immediately and some leave it to the sign-out
  // effect once the session actually clears.
  async function clearSavedLogin(failureMessage: string): Promise<boolean> {
    if (await removeLocalSession()) return true;
    const notice = signedOutNotice.current;
    if (notice) {
      notice.phase = 'error';
      notice.message = failureMessage;
    }
    setMessage(failureMessage);
    return false;
  }

  // Sign-in and sign-up deliberately share one credential boundary: the same
  // validation, and the same clearing of stale notices before a fresh attempt.
  // Returning null means the input was rejected and the caller should stop.
  function beginCredentialAttempt(emailInput: string, passwordInput: string) {
    let credentials;
    try {
      credentials = readAuthCredentials(emailInput, passwordInput);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the account fields.');
      return null;
    }

    signedOutNotice.current = null;
    pendingVerification.current = false;
    setPhase('connecting');
    setMessage(null);
    return credentials;
  }

  async function applySyncResult(synced: SyncRunResult) {
    if (synced.status === 'deleted') {
      signedOutNotice.current = { message: ACCOUNT_DELETED_NOTICE, phase: 'error' };
      setSyncPhase('idle');
      await clearSavedLogin(DELETED_SIGN_OUT_FAILED);
      return;
    }
    if (synced.status === 'mismatch') {
      signedOutNotice.current = { message: DEVICE_BOUND_NOTICE, phase: 'mismatch' };
      setSyncPhase('mismatch');
      await clearSavedLogin(MISMATCH_SIGN_OUT_FAILED);
      return;
    }
    setSyncPhase(synced.status);
  }

  const value: AuthContextValue = {
    confirmConnection,
    createAccount,
    dismissNotice() {
      signedOutNotice.current = null;
      pendingVerification.current = false;
      setMessage(null);
      setPhase('signed_out');
    },
    email: session?.user.email ?? null,
    localRecordCount,
    message,
    phase,
    retryConnection() {
      setConnectionAttempt((attempt) => attempt + 1);
    },
    signIn,
    signOut,
    syncNow,
    syncPhase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

async function removeLocalSession(): Promise<boolean> {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    return error === null;
  } catch {
    return false;
  }
}
