import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth/AuthProvider';

// The root stack keeps Home, income review, settings, and the logging flow in
// one predictable navigation model. AuthProvider wraps every route so local
// mode and optional cloud account state stay consistent across screens.
export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="trends" options={{ title: 'View income' }} />
        <Stack.Screen name="history" options={{ title: 'Shift history' }} />

        {/* Each logging step gets the native stack header, back button, and
            swipe gesture instead of rebuilding those behaviors in the form. */}
        <Stack.Screen name="log-shift/job" options={{ title: 'Log a shift' }} />
        <Stack.Screen name="log-shift/date" options={{ title: 'Log a shift' }} />
        <Stack.Screen name="log-shift/details" options={{ title: 'Shift details' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        {/* No back button: the shift is already written, so stepping back into
            the form would offer to save a second copy of it. */}
        <Stack.Screen
          name="log-shift/done"
          options={{ title: 'Logged', headerBackVisible: false, gestureEnabled: false }}
        />
      </Stack>
    </AuthProvider>
  );
}
