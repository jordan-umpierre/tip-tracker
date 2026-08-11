import { Stack } from 'expo-router';

// The tabs are the two recurring destinations. Everything else sits above them
// in this stack so settings and the logging flow get normal back navigation.
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ title: 'Shift history' }} />

      {/* Each logging step gets the native stack header, back button, and
          swipe gesture instead of rebuilding those behaviors in the form. */}
      <Stack.Screen name="log-shift/job" options={{ title: 'Log a shift' }} />
      <Stack.Screen name="log-shift/date" options={{ title: 'Log a shift' }} />
      <Stack.Screen name="log-shift/details" options={{ title: 'Shift details' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="settings/jobs" options={{ title: 'Jobs' }} />
      <Stack.Screen name="settings/import-export" options={{ title: 'Import and export' }} />
      <Stack.Screen name="settings/withholding" options={{ title: 'Federal withholding' }} />
      <Stack.Screen name="settings/backup" options={{ title: 'Device backup' }} />
      {/* No back button: the shift is already written, so stepping back into
          the form would offer to save a second copy of it. */}
      <Stack.Screen
        name="log-shift/done"
        options={{ title: 'Logged', headerBackVisible: false, gestureEnabled: false }}
      />
    </Stack>
  );
}
