import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from '../lib/releaseLinks';

const settings = [
  { title: 'Jobs', detail: 'Add jobs, rates, and overtime', path: '/settings/jobs' as const },
  { title: 'Import and export', detail: 'Move shift data in or out', path: '/settings/import-export' as const },
  { title: 'Federal withholding', detail: 'Manage optional tax estimates', path: '/settings/withholding' as const },
  { title: 'Device backup', detail: 'Back up or restore this device', path: '/settings/backup' as const },
];

const helpLinks = [
  { title: 'Privacy policy', detail: 'How Tip Tracker handles your data', url: PRIVACY_POLICY_URL },
  { title: 'Support', detail: 'Get help or report a problem', url: SUPPORT_URL },
];

async function openHelpLink(title: string, url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (cause) {
    console.error(`Could not open the ${title.toLowerCase()} link.`, cause);
    Alert.alert('Link not opened', `Visit ${url} in your browser.`);
  }
}

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Local tools for managing your income data.</Text>
        <View style={styles.list}>
          {settings.map((setting) => (
            <Pressable
              key={setting.path}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(setting.path)}
            >
              <View style={styles.copy}>
                <Text style={styles.title}>{setting.title}</Text>
                <Text style={styles.detail}>{setting.detail}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Help and privacy</Text>
        <View style={styles.list}>
          {helpLinks.map((link) => (
            <Pressable
              key={link.url}
              accessibilityRole="link"
              accessibilityLabel={`${link.title}. Opens in your browser.`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => void openHelpLink(link.title, link.url)}
            >
              <View style={styles.copy}>
                <Text style={styles.title}>{link.title}</Text>
                <Text style={styles.detail}>{link.detail}</Text>
              </View>
              <Text accessibilityElementsHidden style={styles.externalMark}>↗</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { gap: 18, padding: 16, paddingBottom: 32 },
  subtitle: { color: '#6b7280', lineHeight: 20 },
  sectionTitle: { color: '#374151', fontSize: 15, fontWeight: '700', marginTop: 4 },
  list: { gap: 10 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  rowPressed: { backgroundColor: '#eef4ff' },
  copy: { flex: 1, gap: 3 },
  title: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detail: { color: '#6b7280', fontSize: 14 },
  chevron: { color: '#9ca3af', fontSize: 28, fontWeight: '300' },
  externalMark: { color: '#2563eb', fontSize: 20, fontWeight: '600' },
});
