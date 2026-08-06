import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { accountStyles as styles } from './styles';

// The signed-out state: one pair of fields serving sign in, sign up, and the
// way into password recovery. Sign in and create share the fields because they
// take the same two values and the provider tells them apart, not the form.
export default function SignInForm() {
  const account = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(action: 'create' | 'sign-in') {
    const succeeded = action === 'create'
      ? await account.createAccount(email, password)
      : await account.signIn(email, password);
    // Only on success: a rejected password should still be on screen to fix.
    if (succeeded) setPassword('');
  }

  return (
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
            // Drop the password before leaving: it is the wrong one, which is
            // why the user is going to recovery in the first place.
            setPassword('');
            account.beginPasswordReset();
          }}
        >
          <Text style={styles.linkText}>Forgot password?</Text>
        </Pressable>
      </View>
    </>
  );
}
