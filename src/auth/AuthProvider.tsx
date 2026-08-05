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
import { AppState, Platform } from 'react-native';
import { getDb } from '../data/db';
import { SyncAccountMismatchError } from '../data/sync';
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
};

const AuthContext = createContext<AuthContextValue | null>(null);

// fallow-ignore-next-line complexity -- One provider owns the coupled auth event, refresh, and account-binding lifecycle.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<AccountPhase>(
    authSetup.config && supabaseClient ? 'connecting' : 'config_unavailable'
  );
  const [message, setMessage] = useState<string | null>(authSetup.error);
  const [localRecordCount, setLocalRecordCount] = useState(0);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
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

    let appStateSubscription: { remove(): void } | null = null;
    if (Platform.OS !== 'web') {
      const updateRefresh = (state: string) => {
        if (state === 'active') client.auth.startAutoRefresh();
        else client.auth.stopAutoRefresh();
      };
      updateRefresh(AppState.currentState);
      appStateSubscription = AppState.addEventListener('change', updateRefresh);
    }

    return () => {
      data.subscription.unsubscribe();
      appStateSubscription?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
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
          if (!(await removeLocalSession())) {
            signedOutNotice.current.phase = 'error';
            signedOutNotice.current.message =
              'This device belongs to another account, and the saved login could not be removed.';
            setPhase('error');
            setMessage(signedOutNotice.current.message);
          }
          return;
        }
        if (error instanceof AccountDeletedError) {
          signedOutNotice.current = {
            message: 'This cloud account has been deleted. Your local data is still here.',
            phase: 'error',
          };
          setPhase('error');
          setMessage(signedOutNotice.current.message);
          if (!(await removeLocalSession())) {
            signedOutNotice.current.message =
              'This cloud account was deleted, and the saved login could not be removed.';
            setMessage(signedOutNotice.current.message);
          }
          return;
        }
        setPhase('error');
        setMessage('The cloud account could not be connected. Your local data still works.');
      });

    return () => {
      cancelled = true;
    };
  }, [connectionAttempt, session]);

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

  // fallow-ignore-next-line complexity -- Validation, provider rejection, and provider failure have separate safe UI outcomes.
  const signIn = useCallback(async (emailInput: string, passwordInput: string) => {
    if (!supabaseClient) return false;
    let credentials;
    try {
      credentials = readAuthCredentials(emailInput, passwordInput);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the account fields.');
      return false;
    }

    signedOutNotice.current = null;
    pendingVerification.current = false;
    setPhase('connecting');
    setMessage(null);
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

  // fallow-ignore-next-line code-duplication -- Sign-up intentionally applies the same bounded credential boundary as sign-in.
  // fallow-ignore-next-line complexity -- A created session and email verification are distinct provider outcomes.
  const createAccount = useCallback(async (emailInput: string, passwordInput: string) => {
    if (!supabaseClient) return false;
    let credentials;
    try {
      credentials = readAuthCredentials(emailInput, passwordInput);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the account fields.');
      return false;
    }

    signedOutNotice.current = null;
    pendingVerification.current = false;
    setPhase('connecting');
    setMessage(null);
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
        // fallow-ignore-next-line code-duplication -- Both automatic and consent-time mismatches must enforce identical local sign-out handling.
        signedOutNotice.current = {
          message: 'This device belongs to another account. No local data was changed.',
          phase: 'mismatch',
        };
        setPhase('mismatch');
        setMessage(signedOutNotice.current.message);
        if (!(await removeLocalSession())) {
          signedOutNotice.current.phase = 'error';
          signedOutNotice.current.message =
            'This device belongs to another account, and the saved login could not be removed.';
          setPhase('error');
          setMessage(signedOutNotice.current.message);
        }
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
