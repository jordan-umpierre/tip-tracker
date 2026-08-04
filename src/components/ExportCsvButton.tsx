import { Directory } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Job } from '../data/jobs';
import type { Shift } from '../data/shifts';
import { isPickerCancelled } from '../lib/pickerCancel';
import { buildShiftExportCsv, shiftExportFileName } from '../lib/shiftExportCsv';

type Props = {
  shifts: Shift[];
  jobs: Job[];
};


export default function ExportCsvButton({ shifts, jobs }: Props) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      // Directory.pickDirectoryAsync rather than writing somewhere and telling
      // the user where: on both platforms this is the system's own "choose a
      // location" UI, and it is the only way the file lands somewhere the user
      // can actually reach. It also keeps this to zero new dependencies --
      // expo-file-system is already here for the import picker.
      const directory = await Directory.pickDirectoryAsync();
      const fileName = shiftExportFileName(new Date());

      // Job names are looked up now rather than stored on the shift, because
      // the export is a snapshot of the current state -- a renamed job should
      // read as its current name.
      const csv = buildShiftExportCsv(
        shifts,
        new Map(jobs.map((job) => [job.id, job.name]))
      );

      const file = directory.createFile(fileName, 'text/csv');
      file.write(csv);

      Alert.alert(
        'Shifts exported',
        `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'} written to ${fileName}.`
      );
    } catch (cause) {
      // Tapping Cancel is a normal choice, not a failure. Returning quietly
      // keeps it out of the error log -- once crash reporting exists, every
      // cancel would otherwise arrive as a reported error -- and spares the
      // user a modal confirming something they just did on purpose.
      if (isPickerCancelled(cause)) {
        return;
      }

      // Anything else genuinely failed. The message still only claims what is
      // certain, that no file was written, because the throw could have come
      // from the pick, the create, or the write, and the caller cannot tell
      // how far it got.
      console.error('Could not export shifts.', cause);
      Alert.alert('Nothing exported', 'No file was written. Nothing on this device changed.');
    } finally {
      setExporting(false);
    }
  }

  const disabled = exporting || shifts.length === 0;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={() => void handleExport()}
      >
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
          {exporting ? 'Exporting…' : 'Export shifts as CSV'}
        </Text>
      </Pressable>
      <Text style={styles.note}>
        {shifts.length === 0
          ? 'Log or import a shift first.'
          : 'Writes every logged shift to a file you choose. Nothing is uploaded.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    padding: 16,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    borderColor: '#d1d5db',
  },
  buttonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: '#9ca3af',
  },
  note: {
    color: '#6b7280',
    fontSize: 12,
  },
});
