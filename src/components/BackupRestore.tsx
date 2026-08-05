import { Directory, File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBackupJson, restoreBackup } from '../data/backup';
import {
  backupFileName,
  MAX_BACKUP_BYTES,
  parseBackupJson,
} from '../lib/backup';
import type { TipTrackerBackup } from '../lib/backup';
import { isPickerCancelled } from '../lib/pickerCancel';

type Props = {
  onRestored: () => Promise<void>;
};

type BusyState = 'exporting' | 'reading' | 'restoring' | null;

export default function BackupRestore({ onRestored }: Props) {
  const [busy, setBusy] = useState<BusyState>(null);

  async function handleExport() {
    setBusy('exporting');
    try {
      // Read one consistent SQLite snapshot before opening the picker. The
      // chosen file therefore represents one known database state even if the
      // user leaves the picker open for a while.
      const now = new Date();
      const json = await createBackupJson(now);
      const directory = await Directory.pickDirectoryAsync();
      const fileName = backupFileName(now);
      const file = directory.createFile(fileName, 'application/json');
      file.write(json);
      const backup = parseBackupJson(json);

      Alert.alert(
        'Backup created',
        `${backup.jobs.length} ${countLabel(backup.jobs.length, 'job')} and ${backup.shifts.length} ${countLabel(backup.shifts.length, 'shift')} written to ${fileName}.`
      );
    } catch (cause) {
      if (isPickerCancelled(cause)) return;
      console.error('Could not create the backup.', cause);
      Alert.alert('Backup not created', 'No backup file was written. Nothing on this device changed.');
    } finally {
      setBusy(null);
    }
  }

  async function handleChooseRestore() {
    setBusy('reading');
    try {
      const result = await File.pickFileAsync();
      if (result.canceled) return;

      const file = result.result;
      if (file.size !== null && file.size > MAX_BACKUP_BYTES) {
        throw new Error('The backup is larger than 10 MB.');
      }
      const backup = parseBackupJson(await file.text());
      confirmRestore(backup, file.name);
    } catch (cause) {
      Alert.alert(
        'Backup not restored',
        cause instanceof Error ? cause.message : 'That backup could not be read.'
      );
    } finally {
      setBusy(null);
    }
  }

  function confirmRestore(backup: TipTrackerBackup, fileName: string) {
    Alert.alert(
      `Restore ${fileName}?`,
      `This backup contains ${backup.jobs.length} ${countLabel(backup.jobs.length, 'job')} and ${backup.shifts.length} ${countLabel(backup.shifts.length, 'shift')}. Restore only works when this app has no jobs or shifts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore backup',
          onPress: () => void handleRestore(backup),
        },
      ]
    );
  }

  async function handleRestore(backup: TipTrackerBackup) {
    setBusy('restoring');
    try {
      const restored = await restoreBackup(backup);
      let refreshNote = '';
      try {
        await onRestored();
      } catch (cause) {
        console.error('The backup restored, but the Log screen did not refresh.', cause);
        refreshNote = ' Reopen the Log tab to refresh the screen.';
      }

      Alert.alert(
        'Backup restored',
        `${restored.jobs.length} ${countLabel(restored.jobs.length, 'job')} and ${restored.shifts.length} ${countLabel(restored.shifts.length, 'shift')} restored.${refreshNote}`
      );
    } catch (cause) {
      const message = cause instanceof Error && cause.message.includes('requires an empty')
        ? 'This app already has data. Restore is limited to a fresh or otherwise empty database.'
        : 'The restore failed and was rolled back. Nothing was restored.';
      console.error('Could not restore the backup.', cause);
      Alert.alert('Backup not restored', message);
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Full backup</Text>
      <Text style={styles.note}>
        Saves every job and shift exactly, including removed items and overtime settings.
        The JSON file contains sensitive income data and is not encrypted.
      </Text>
      <View style={styles.actions}>
        <ActionButton
          label={busy === 'exporting' ? 'Creating backup…' : 'Create backup'}
          disabled={disabled}
          onPress={() => void handleExport()}
        />
        <ActionButton
          label={busy === 'reading' || busy === 'restoring' ? 'Restoring…' : 'Restore backup'}
          disabled={disabled}
          onPress={() => void handleChooseRestore()}
        />
      </View>
      <Text style={styles.limitNote}>Restore only works in an empty app and never merges or replaces data.</Text>
    </View>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function countLabel(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 16,
  },
  title: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    color: '#4b5563',
    lineHeight: 18,
  },
  actions: {
    gap: 8,
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
  limitNote: {
    color: '#6b7280',
    fontSize: 12,
  },
});
