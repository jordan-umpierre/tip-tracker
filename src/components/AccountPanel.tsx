import { Alert, Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import DeleteAccountForm from './account/DeleteAccountForm';
import PasswordResetForm from './account/PasswordResetForm';
import SignInForm from './account/SignInForm';
import SyncStatusPanel from './account/SyncStatusPanel';
import { accountStyles as styles } from './account/styles';

// The cloud account's one entry point, and nothing more: which account state
// is showing, and the copy for the states that are a sentence and a button.
// The four states with real forms in them live in ./account, because this file
// grew to 400 lines once deletion, recovery, and conflict review arrived, and
// components/ is supposed to hold focused pieces of screen UI.
//
// fallow-ignore-next-line complexity -- The branches are mutually exclusive visible account states kept together for accessibility review.
export default function AccountPanel() {
  const account = useAuth();

  // Shared by three states, because signing out is what you do from any of
  // them and the warning has to say the same thing every time.
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

  return (
    <View style={styles.panel} accessibilityRole="summary">
      <Text style={styles.title}>Cloud account</Text>

      {account.phase === 'config_unavailable' ? (
        <Text style={styles.copy}>
          Cloud accounts are unavailable in this build. Everything else stays local and works
          normally.
        </Text>
      ) : null}

      {account.phase === 'signed_out' ? <SignInForm /> : null}
      {account.phase === 'password_reset' ? <PasswordResetForm /> : null}

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
          <Text style={styles.note}>
            Your local data will sync to this account when a sync runs. SQLite remains the local source of truth.
          </Text>
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
          <SyncStatusPanel />
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={confirmSignOut}
          >
            <Text style={styles.secondaryButtonText}>Sign out on this device</Text>
          </Pressable>
          <DeleteAccountForm />
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
