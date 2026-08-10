import { NativeTabs } from 'expo-router/unstable-native-tabs';

// This is the only file coupled to the unstable native-tabs API. The route
// files and screens underneath it use ordinary Expo Router and React Native,
// so D11's fallback to JavaScript tabs would be a one-file change.
//
// AuthProvider used to wrap this. It moved up to the root stack when the log
// flow gained screens that live outside the tabs and still need it.
export default function TabsLayout() {
  return (
    <NativeTabs tintColor="#2563eb" disableTransparentOnScrollEdge>
      {/* Log is first because it is the index route, and the index route is
          what the app opens on. Keeping the bar in the same order means the
          landing tab is also the leftmost one, rather than the app starting
          on a tab that is not where the eye lands. */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit_note" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trends">
        <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
          md="analytics"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
