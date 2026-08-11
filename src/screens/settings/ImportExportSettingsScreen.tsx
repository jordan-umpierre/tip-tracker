import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ExportCsvButton from '../../components/ExportCsvButton';
import ImportCsvForm from '../../components/ImportCsvForm';
import { useShiftScreenData } from '../../hooks/useShiftScreenData';

export default function ImportExportSettingsScreen() {
  const { jobs, allJobs, shifts, refresh } = useShiftScreenData('Import and export');
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ImportCsvForm jobs={jobs} existingShifts={shifts} onImported={refresh} />
        <ExportCsvButton shifts={shifts} jobs={allJobs} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#fff' }, content: { gap: 16, padding: 16, paddingBottom: 32 } });
