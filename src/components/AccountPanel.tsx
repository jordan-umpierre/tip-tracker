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

// fallow-ignore-next-line complexity -- The branches are mutually exclusive visible account states kept together for accessibility review.
export default function AccountPanel() {
  const account = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(action: 'create' | 'sign-in') {
    const succeeded = action === 'create'
      ? await account.createAccount(email, password)
      : await account.signIn(email, password);
    if (succeeded) setPassword('');
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
          <Text style={styles.copy}>Account connected. Your records still stay on this device.</Text>
          <Text style={styles.note}>Cloud sync is a separate upcoming step.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={confirmSignOut}
          >
            <Text style={styles.secondaryButtonText}>Sign out on this device</Text>
          </Pressable>
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
});
