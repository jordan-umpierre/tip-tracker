import { Slot } from 'expo-router';

// Expo Router owns the app entrypoint now. Slot renders whichever route
// matches the current path; D11's native tab shell replaces this in the next
// commit once both complete screen routes exist.
export default function RootLayout() {
  return <Slot />;
}
