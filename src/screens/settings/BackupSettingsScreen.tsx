import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackupRestore from '../../components/BackupRestore';
import { useShiftScreenData } from '../../hooks/useShiftScreenData';

export default function BackupSettingsScreen() {
  const { refresh } = useShiftScreenData('Device backup');
  return <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}><BackupRestore onRestored={refresh} /></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#fff' }, content: { padding: 16, paddingBottom: 32 } });
