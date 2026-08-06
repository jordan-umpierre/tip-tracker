import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { MINIMUM_NEW_PASSWORD_LENGTH } from '../auth/form';

// fallow-ignore-next-line complexity -- The branches are mutually exclusive visible account states kept together for accessibility review.
export default function AccountPanel() {
  const account = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The delete flow keeps its own password field. Reusing the sign-in one
  // would mean a password typed to sign in is still sitting in state when the
  // delete button appears, which is one misplaced tap from an account nobody
  // meant to delete.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Recovery keeps its own three fields for the same reason the delete flow
  // does: nothing typed for one purpose should be sitting in a field used for
  // another.
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  async function submit(action: 'create' | 'sign-in') {
    const succeeded = action === 'create'
      ? await account.createAccount(email, password)
      : await account.signIn(email, password);
    if (succeeded) setPassword('');
  }

  async function submitReset() {
    if (await account.resetPassword(resetEmail, resetCode, resetPassword)) {
      // A successful reset also signs the user in, so this panel is about to
      // show the connected state. Clear the secrets rather than leave them
      // behind a screen the user can come back to.
      setResetCode('');
      setResetPassword('');
    }
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out on this device?',
      'This removes the saved login only. Jobs, shifts, the account binding, and pending changes stay on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => { void account.signOut(); },
        },
      ]
    );
  }

  // Two steps on purpose. The alert states exactly what goes and what stays,
  // and the password below it is the second one: a destructive, irreversible
  // action should not be reachable by one tap on a phone somebody else is
  // holding.
  function confirmDelete() {
    Alert.alert(
      'Delete cloud account?',
      'This permanently deletes the cloud copy of your data and the account itself. It cannot be undone. The jobs and shifts on this device are kept, and this device can connect to a new account afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => { void runDelete(); } },
      ]
    );
  }

  async function runDelete() {
    setDeleting(true);
    try {
      const result = await account.deleteAccount(deletePassword);
      // Only a finished deletion closes the section. 'pending' means the
      // server tombstoned the account but the provider identity is still
      // there, and repeating the request is what finishes it -- so the form
      // stays open with the message explaining why.
      if (result === 'deleted') {
        setDeleteOpen(false);
        setDeletePassword('');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.panel} accessibilityRole="summary">
      <Text style={styles.title}>Cloud account</Text>
      {account.phase === 'config_unavailable' ? (
        <Text style={styles.copy}>
          Cloud accounts are unavailable in this build. Everything else stays local and works
          normally.
        </Text>
      ) : null}

      {account.phase === 'signed_out' ? (
        <>
          <Text style={styles.copy}>
            Optional. Create an account or sign in without moving your local data yet.
          </Text>
          {account.message ? <Text style={styles.error}>{account.message}</Text> : null}
          <TextInput
            accessibilityLabel="Account email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            maxLength={254}
            onChangeText={setEmail}
            placeholder="Email"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Account password"
            autoCapitalize="none"
            autoComplete="current-password"
            maxLength={1_024}
            onChangeText={setPassword}
            onSubmitEditing={() => { void submit('sign-in'); }}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() => { void submit('sign-in'); }}
            >
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={() => { void submit('create'); }}
            >
              <Text style={styles.secondaryButtonText}>Create account</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.linkButton}
              onPress={() => {
                setPassword('');
                setResetEmail(email);
                account.beginPasswordReset();
              }}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {account.phase === 'password_reset' ? (
        <>
          <Text style={styles.copy}>
            Send a six-digit code to your email, then use it to set a new password.
          </Text>
          {account.message ? (
            <Text style={styles.copy} accessibilityLiveRegion="polite">{account.message}</Text>
          ) : null}
          <TextInput
            accessibilityLabel="Email for password recovery"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            maxLength={254}
            onChangeText={setResetEmail}
            placeholder="Email"
            style={styles.input}
            value={resetEmail}
          />
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => { void account.requestPasswordResetCode(resetEmail); }}
          >
            <Text style={styles.secondaryButtonText}>Send code</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Six-digit recovery code"
            autoCapitalize="none"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={setResetCode}
            placeholder="Six-digit code"
            style={styles.input}
            value={resetCode}
          />
          <TextInput
            accessibilityLabel="New password"
            autoCapitalize="none"
            autoComplete="new-password"
            maxLength={1_024}
            onChangeText={setResetPassword}
            placeholder={`New password (${MINIMUM_NEW_PASSWORD_LENGTH}+ characters)`}
            secureTextEntry
            style={styles.input}
            value={resetPassword}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() => { void submitReset(); }}
            >
              <Text style={styles.primaryButtonText}>Set new password</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={account.dismissNotice}
            >
              <Text style={styles.secondaryButtonText}>Back to sign in</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {account.phase === 'connecting' ? (
        <Text style={styles.copy} accessibilityLiveRegion="polite">
          Verifying account connection...
        </Text>
      ) : null}

      {account.phase === 'pending_verification' ? (
        <>
          <Text style={styles.copy} accessibilityLiveRegion="polite">{account.message}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={account.dismissNotice}
          >
            <Text style={styles.secondaryButtonText}>Return to sign in</Text>
          </Pressable>
        </>
      ) : null}

      {account.phase === 'consent_required' ? (
        <>
          <Text style={styles.copy}>
            This device has {account.localRecordCount}{' '}
            {account.localRecordCount === 1 ? 'local record' : 'local records'}. Connecting
            permanently assigns this local database to {account.email ?? 'this account'}.
          </Text>
          <Text style={styles.note}>Cloud data transfer is not enabled yet.</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() => { void account.confirmConnection(); }}
            >
              <Text style={styles.primaryButtonText}>Connect local data</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={confirmSignOut}
            >
              <Text style={styles.secondaryButtonText}>Cancel and sign out</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {account.phase === 'connected' ? (
        <>
          <Text style={styles.identity}>{account.email ?? 'Signed-in account'}</Text>
          <Text style={styles.copy}>Account connected. SQLite remains the local source of truth.</Text>
          <View style={styles.syncStatus} accessibilityLiveRegion="polite">
            <Text style={styles.syncTitle}>Sync status</Text>
            <Text style={account.syncPhase === 'blocked' ? styles.error : styles.note}>
              {syncStatusCopy(account.syncPhase)}
            </Text>
            {account.syncPhase === 'blocked' ? (
              <Text style={styles.note}>
                Review needed. Conflict editing is not available yet, so sync will not retry this
                record automatically.
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={account.syncPhase === 'syncing'}
              style={[
                styles.primaryButton,
                account.syncPhase === 'syncing' ? styles.disabledButton : null,
              ]}
              onPress={() => { void account.syncNow(); }}
            >
              <Text style={styles.primaryButtonText}>Sync now</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={confirmSignOut}
          >
            <Text style={styles.secondaryButtonText}>Sign out on this device</Text>
          </Pressable>

          {deleteOpen ? (
            <View style={styles.deleteBox}>
              <Text style={styles.deleteTitle}>Delete cloud account</Text>
              <Text style={styles.copy}>
                Deletes the cloud copy and the account permanently. Your jobs and shifts stay
                on this device.
              </Text>
              <Text style={styles.note}>
                Enter your password to confirm. The server requires a fresh password check
                before it will delete an account.
              </Text>
              {account.message ? <Text style={styles.error}>{account.message}</Text> : null}
              <TextInput
                accessibilityLabel="Password to confirm account deletion"
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!deleting}
                maxLength={1_024}
                onChangeText={setDeletePassword}
                placeholder="Password"
                secureTextEntry
                style={styles.input}
                value={deletePassword}
              />
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: deleting }}
                  disabled={deleting}
                  style={[styles.destructiveButton, deleting ? styles.disabledButton : null]}
                  onPress={confirmDelete}
                >
                  <Text style={styles.destructiveButtonText}>
                    {deleting ? 'Deleting...' : 'Permanently delete account'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: deleting }}
                  disabled={deleting}
                  style={styles.secondaryButton}
                  onPress={() => {
                    setDeleteOpen(false);
                    setDeletePassword('');
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Keep my account</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              style={styles.destructiveOutlineButton}
              onPress={() => setDeleteOpen(true)}
            >
              <Text style={styles.destructiveLinkText}>Delete cloud account</Text>
            </Pressable>
          )}
        </>
      ) : null}

      {account.phase === 'error' ? (
        <>
          <Text style={styles.error} accessibilityLiveRegion="polite">{account.message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={account.retryConnection}
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={confirmSignOut}
            >
              <Text style={styles.secondaryButtonText}>Sign out on this device</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {account.phase === 'mismatch' ? (
        <>
          <Text style={styles.error} accessibilityLiveRegion="polite">{account.message}</Text>
          <Text style={styles.note}>You were signed out locally. Jobs and shifts were untouched.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={account.dismissNotice}
          >
            <Text style={styles.secondaryButtonText}>Return to sign in</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 16,
    gap: 10,
  },
  title: { color: '#111827', fontSize: 16, fontWeight: '700' },
  identity: { color: '#111827', fontWeight: '600' },
  copy: { color: '#374151', lineHeight: 20 },
  note: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  syncStatus: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  syncTitle: { color: '#111827', fontWeight: '600' },
  error: { color: '#b91c1c', lineHeight: 20 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#111827',
  },
  actions: { gap: 10 },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  disabledButton: { opacity: 0.6 },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600' },
  // A text-only affordance, still 44pt tall so it meets the touch target
  // minimum the rest of the panel's controls keep.
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#2563eb', fontWeight: '600' },
  // Red, bordered, and set apart from the rest of the panel, so the one
  // irreversible control on this screen never reads as another blue button.
  deleteBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  deleteTitle: { color: '#991b1b', fontWeight: '700' },
  destructiveButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#b91c1c',
    paddingHorizontal: 16,
  },
  destructiveButtonText: { color: '#fff', fontWeight: '600' },
  destructiveOutlineButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#b91c1c',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  destructiveLinkText: { color: '#b91c1c', fontWeight: '600' },
});

function syncStatusCopy(phase: ReturnType<typeof useAuth>['syncPhase']) {
  if (phase === 'syncing') return 'Syncing...';
  if (phase === 'up_to_date') return 'Up to date as of the last completed sync.';
  if (phase === 'pending_offline') return 'Changes are pending. The cloud service is unavailable.';
  if (phase === 'blocked') return 'Review needed before sync can continue.';
  if (phase === 'sign_in_again') return 'Sign in again before sync can continue.';
  if (phase === 'mismatch') return 'This local database belongs to another account.';
  return 'Ready to sync.';
}
