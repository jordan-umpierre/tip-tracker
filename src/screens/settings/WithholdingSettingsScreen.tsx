import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FederalWithholdingForm from '../../components/FederalWithholdingForm';
import { useShiftScreenData } from '../../hooks/useShiftScreenData';

export default function WithholdingSettingsScreen() {
  const { jobs } = useShiftScreenData('Federal withholding');
  return <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}><FederalWithholdingForm jobs={jobs} /></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#fff' }, content: { padding: 16, paddingBottom: 32 } });
