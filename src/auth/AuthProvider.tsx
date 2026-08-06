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
import {
  discardBlockedMutation,
  readBlockedMutations,
  releaseSyncAccount,
  SyncAccountMismatchError,
} from '../data/sync';
import type { BlockedMutation } from '../data/sync';
import { createSyncRunner, type SyncRunResult } from '../sync/transport';
import {
  confirmAccountConnection,
  prepareAccountConnection,
} from './accountConnection';
import {
  AccountDeletedError,
  AccountIdentityMismatchError,
  deleteBackendAccount,
  verifyBackendAccount,
} from './accountApi';
import { authSetup } from './config';
import { readAuthCredentials, readEmail, readPasswordReset } from './form';
import { supabaseClient } from './supabase';

type AccountPhase =
  | 'config_unavailable'
  | 'connecting'
  | 'consent_required'
  | 'connected'
  | 'error'
  | 'mismatch'
  | 'password_reset'
  | 'pending_verification'
  | 'signed_out';

type SyncPhase =
  | 'blocked'
  | 'failed'
  | 'idle'
  | 'mismatch'
  | 'pending_offline'
  | 'sign_in_again'
  | 'syncing'
  | 'up_to_date';

// What the screen shows after a delete attempt. Only 'deleted' ends the
// account; the other two leave it exactly as it was.
type DeleteAccountResult = 'deleted' | 'pending' | 'rejected';

type AuthContextValue = {
  blockedMutations: BlockedMutation[];
  confirmConnection(): Promise<void>;
  discardBlocked(localSequence: number): Promise<void>;
  createAccount(email: string, password: string): Promise<boolean>;
  deleteAccount(password: string): Promise<DeleteAccountResult>;
  dismissNotice(): void;
  beginPasswordReset(): void;
  requestPasswordResetCode(email: string): Promise<boolean>;
  resetPassword(email: string, code: string, password: string): Promise<boolean>;
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
  const [blocked, setBlocked] = useState<BlockedMutation[]>([]);
  const syncRunner = useRef<ReturnType<typeof createSyncRunner> | null>(null);
  const pendingVerification = useRef(false);
  // The session as of right now, for code that needs the current token without
  // wanting to re-run every time a refresh mints one. State stays the source
  // of truth for rendering; this ref only ever mirrors it.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  // The stable half of the session. A token refresh replaces the object and
  // the token; the account behind it does not change.
  const signedInUserId = session?.user.id ?? null;
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

  // Read what is currently blocked, so the screen can name the records instead
  // of saying "review needed" and leaving the user to guess which one.
  const refreshBlocked = useCallback(async () => {
    try {
      setBlocked(await readBlockedMutations(await getDb()));
    } catch {
      // A database that will not open is already reported by whatever else
      // needed it. Showing an empty list is honest here: this function does
      // not know of any blocked record.
      setBlocked([]);
    }
  }, []);

  // Resolve one conflict the only way the app can resolve it without inventing
  // merge rules: throw away this device's change and take the account's copy.
  // The user can then make the edit again, which is a fresh mutation against
  // the version they can now see.
  const discardBlocked = useCallback(async (localSequence: number) => {
    try {
      await discardBlockedMutation(await getDb(), localSequence);
      setMessage(null);
    } catch {
      setMessage('That change could not be discarded. Sync and try again.');
    }
    await refreshBlocked();
  }, [refreshBlocked]);

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

  // A sync run needs the newest access token, but must not be *triggered* by
  // getting one. Supabase hands out a new session object on every hourly
  // TOKEN_REFRESHED event, and reading the session straight out of state made
  // this function a new function each time, which re-ran the effect below and
  // started a sync nobody asked for. The token is read from a ref instead, so
  // the run always uses the current one while the triggers stay the three D26
  // lists: a verified connection, an explicit Sync now, and foreground entry.
  const syncNow = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !authSetup.config || !supabaseClient || phase !== 'connected') return;
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
        accessToken: current.access_token,
        userId: current.user.id,
      });
      await applySyncResult(synced);
    } catch {
      // Not 'blocked'. Blocked means the server refused a specific record and
      // a person has to look at it; this catch also sees a database that would
      // not open and a bug in our own code. Telling someone a record needs
      // review when SQLite failed to open sends them looking for a conflict
      // that does not exist.
      setSyncPhase('failed');
    }
    await refreshBlocked();
  }, [phase, refreshBlocked]);

  useEffect(() => {
    if (phase !== 'connected' || !signedInUserId) {
      if (!signedInUserId) setSyncPhase('idle');
      return;
    }

    // Reaching connected means /v1/me and the durable account binding agreed.
    // The same call covers restored sessions and freshly confirmed consent.
    // Keyed on the account id rather than the session object, so an hourly
    // token refresh is not mistaken for a new sign-in.
    void syncNow();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [phase, signedInUserId, syncNow]);

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

  // Password recovery, by emailed six-digit code rather than an emailed link.
  //
  // A link would have to come back into the app as a deep link, which means a
  // redirect-URL allowlist in the provider, universal-link and app-link setup
  // on both platforms, and a session exchanged out of a URL. The code path
  // needs none of that: the user reads six digits and types them here. The
  // cost is one provider-side setting, because Supabase's recovery email
  // template has to include the token rather than only a link.
  const requestPasswordResetCode = useCallback(async (emailInput: string) => {
    if (!supabaseClient) return false;
    let email: string;
    try {
      email = readEmail(emailInput);
    } catch {
      setMessage('Enter a valid email address.');
      return false;
    }

    try {
      await supabaseClient.auth.resetPasswordForEmail(email);
    } catch {
      setMessage('The code could not be sent. Try again.');
      return false;
    }

    // The same answer whether or not that address has an account. Saying "no
    // such account" would turn this form into a way to test which email
    // addresses are registered.
    setMessage('If that email has an account, a six-digit code is on its way.');
    return true;
  }, []);

  const resetPassword = useCallback(
    async (emailInput: string, codeInput: string, passwordInput: string) => {
      if (!supabaseClient) return false;
      let reset;
      try {
        reset = readPasswordReset(emailInput, codeInput, passwordInput);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Check the recovery fields.');
        return false;
      }

      // Verifying the code is what proves the mailbox, and it signs the user
      // in. Only then can the password be replaced: Supabase changes a
      // password through an authenticated session, never through the code.
      try {
        const { error } = await supabaseClient.auth.verifyOtp({
          email: reset.email,
          token: reset.code,
          type: 'recovery',
        });
        if (error) throw error;
      } catch {
        setMessage('That code was not accepted. It may have expired.');
        return false;
      }

      try {
        const { error } = await supabaseClient.auth.updateUser({ password: reset.password });
        if (error) throw error;
      } catch {
        // The code was good, so the session is real and the user is signed in
        // with their old password. Saying so beats implying nothing happened.
        setMessage('You are signed in, but the new password could not be saved.');
        return false;
      }

      setMessage(null);
      return true;
    },
    []
  );

  // Deleting the cloud account, which the App Store requires any app offering
  // account creation to provide in-app.
  //
  // The password is asked for again rather than reused from sign-in: the
  // server refuses a deletion whose token carries no password authentication
  // from the last five minutes, and a session restored from the Keychain days
  // ago carries none. Signing in again is what mints a token that satisfies
  // that rule, and it doubles as proof that whoever is holding the unlocked
  // phone is the account owner.
  //
  // fallow-ignore-next-line complexity -- Each branch is a distinct server outcome with its own user consequence.
  const deleteAccount = useCallback(async (passwordInput: string): Promise<DeleteAccountResult> => {
    const email = session?.user.email;
    if (!supabaseClient || !authSetup.config || !email) return 'rejected';

    let credentials;
    try {
      credentials = readAuthCredentials(email, passwordInput);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the account fields.');
      return 'rejected';
    }

    let proven: Session;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword(credentials);
      if (error || !data.session) throw error ?? new Error('No session was returned.');
      proven = data.session;
    } catch {
      setMessage('The password was not accepted. The account was not deleted.');
      return 'rejected';
    }

    let outcome;
    try {
      outcome = await deleteBackendAccount(authSetup.config.apiUrl, {
        accessToken: proven.access_token,
        userId: proven.user.id,
      });
    } catch {
      setMessage('The account could not be deleted. Nothing was changed.');
      return 'rejected';
    }

    if (outcome === 'reauthenticate') {
      // The password just succeeded, so a refusal here is the server and the
      // provider disagreeing rather than anything the user did wrong.
      setMessage('The account could not be deleted. Try again.');
      return 'rejected';
    }
    if (outcome === 'pending') {
      // The cloud rows are already gone and the account is tombstoned; only
      // the provider identity is left. Do not release the device or sign out,
      // because repeating this exact request is what finishes the job.
      setMessage('Deletion started but did not finish. Try again in a few minutes.');
      return 'pending';
    }

    // The account is gone, so the binding pointing at it has to go too, or
    // this device could never connect to a new account. Local jobs and shifts
    // are untouched -- that is the promise the confirmation made.
    try {
      await releaseSyncAccount(await getDb());
    } catch {
      setMessage(
        'The cloud account was deleted, but this device could not be released. Restart the app and sign out.'
      );
      return 'deleted';
    }

    signedOutNotice.current = {
      message: 'The cloud account was deleted. Your jobs and shifts are still on this device.',
      phase: 'error',
    };
    setSyncPhase('idle');
    await clearSavedLogin(
      'The cloud account was deleted, but the saved login could not be removed.'
    );
    return 'deleted';
  }, [session]);

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

  const value: AuthContextValue = {
    blockedMutations: blocked,
    discardBlocked,
    beginPasswordReset() {
      // Recovery starts from a clean slate: a stale mismatch or deleted-account
      // notice on screen would read as commentary on the reset itself.
      signedOutNotice.current = null;
      pendingVerification.current = false;
      setMessage(null);
      setPhase('password_reset');
    },
    confirmConnection,
    createAccount,
    deleteAccount,
    requestPasswordResetCode,
    resetPassword,
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
