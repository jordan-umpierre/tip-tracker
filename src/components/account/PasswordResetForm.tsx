import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { MINIMUM_NEW_PASSWORD_LENGTH } from '../../auth/form';
import { accountStyles as styles } from './styles';

// Recovery, in one screen: send a code to an address, then use the code and a
// new password. Both steps live together because the second is useless without
// the first and the user is holding the email open the whole time.
export default function PasswordResetForm() {
  const account = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  async function submit() {
    if (await account.resetPassword(email, code, password)) {
      // Success also signs the user in, so this form is about to be replaced
      // by the connected panel. Clear the secrets instead of leaving them
      // behind a screen the user can navigate back to.
      setCode('');
      setPassword('');
    }
  }

  return (
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
        onChangeText={setEmail}
        placeholder="Email"
        style={styles.input}
        value={email}
      />
      <Pressable
        accessibilityRole="button"
        style={styles.secondaryButton}
        onPress={() => { void account.requestPasswordResetCode(email); }}
      >
        <Text style={styles.secondaryButtonText}>Send code</Text>
      </Pressable>
      <TextInput
        accessibilityLabel="Six-digit recovery code"
        autoCapitalize="none"
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={setCode}
        placeholder="Six-digit code"
        style={styles.input}
        value={code}
      />
      <TextInput
        accessibilityLabel="New password"
        autoCapitalize="none"
        autoComplete="new-password"
        maxLength={1_024}
        onChangeText={setPassword}
        placeholder={`New password (${MINIMUM_NEW_PASSWORD_LENGTH}+ characters)`}
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => { void submit(); }}
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
  );
}
