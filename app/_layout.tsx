import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth/AuthProvider';

// The tabs moved one level down into (tabs)/ so this stack can push screens
// that cover the tab bar. Expo Router's own tab guidance is to nest the tab
// navigator inside a root stack for exactly this reason: anything declared
// here renders over the tabs rather than inside one of them.
//
// AuthProvider wraps the stack rather than the tabs, so a pushed flow is
// inside the same auth context the tabs are.
export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        {/* The tabs draw their own bar and each screen its own title, so the
            stack header would be a second, empty one on top of that. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
