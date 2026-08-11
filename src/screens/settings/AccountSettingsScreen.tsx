import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AccountPanel from '../../components/AccountPanel';

export default function AccountSettingsScreen() {
  return <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}><AccountPanel /></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#fff' }, content: { padding: 16, paddingBottom: 32 } });
