import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
      <NativeTabs tintColor="#2563eb" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Log income</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit_note" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="trends">
          <NativeTabs.Trigger.Label>View income</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
            md="analytics"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
  );
}
