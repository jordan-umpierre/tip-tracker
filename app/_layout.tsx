import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { AuthProvider } from '../src/auth/AuthProvider';

// This is the only file coupled to the unstable native-tabs API. The route
// files and screens underneath it use ordinary Expo Router and React Native,
// so D11's fallback to JavaScript tabs would be a one-file change.
export default function RootLayout() {
  return (
    <AuthProvider>
      <NativeTabs tintColor="#2563eb" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
            md="analytics"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="log">
          <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit_note" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </AuthProvider>
  );
}
