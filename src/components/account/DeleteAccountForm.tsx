import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { accountStyles as styles } from './styles';

// The one irreversible control in the app, required in-app by App Store
// guideline 5.1.1(v) for any app that lets people create an account.
export default function DeleteAccountForm() {
  const account = useAuth();
  const [open, setOpen] = useState(false);
  // Its own password field, never the sign-in one. Sharing would leave a
  // password typed to sign in sitting in state one misplaced tap away from
  // deleting an account.
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Two steps on purpose. The alert states exactly what goes and what stays,
  // and the password above it is the other one: a destructive, irreversible
  // action should not be reachable by one tap on an unlocked phone somebody
  // else is holding.
  function confirm() {
    Alert.alert(
      'Delete cloud account?',
      'This permanently deletes the cloud copy of your data and the account itself. It cannot be undone. The jobs and shifts on this device are kept, and this device can connect to a new account afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => { void run(); } },
      ]
    );
  }

  async function run() {
    setDeleting(true);
    try {
      // Only a finished deletion closes the section. 'pending' means the
      // server tombstoned the account but the provider identity is still
      // there, and repeating this exact request is what finishes it, so the
      // form stays open with the message explaining why.
      if (await account.deleteAccount(password) === 'deleted') {
        setOpen(false);
        setPassword('');
      }
    } finally {
      setDeleting(false);
    }
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        style={styles.destructiveOutlineButton}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.destructiveLinkText}>Delete cloud account</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.deleteBox}>
      <Text style={styles.deleteTitle}>Delete cloud account</Text>
      <Text style={styles.copy}>
        Deletes the cloud copy and the account permanently. Your jobs and shifts stay on
        this device.
      </Text>
      <Text style={styles.note}>
        Enter your password to confirm. The server requires a fresh password check before
        it will delete an account.
      </Text>
      {account.message ? <Text style={styles.error}>{account.message}</Text> : null}
      <TextInput
        accessibilityLabel="Password to confirm account deletion"
        autoCapitalize="none"
        autoComplete="current-password"
        editable={!deleting}
        maxLength={1_024}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting }}
          disabled={deleting}
          style={[styles.destructiveButton, deleting ? styles.disabledButton : null]}
          onPress={confirm}
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
            setOpen(false);
            setPassword('');
          }}
        >
          <Text style={styles.secondaryButtonText}>Keep my account</Text>
        </Pressable>
      </View>
    </View>
  );
}
