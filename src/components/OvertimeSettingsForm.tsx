import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { Job } from '../data/jobs';
import { updateOvertimeSettings } from '../data/jobs';
import { timeInputValue, WEEKDAY_NAMES } from '../lib/dates';

const FULL_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

type Props = {
  job: Job;
  onSaved: () => Promise<void>;
};

// fallow-ignore-next-line complexity -- Native picker and opt-in branches require device checks.
export default function OvertimeSettingsForm({ job, onSaved }: Props) {
  const [enabled, setEnabled] = useState(job.overtime_enabled === 1);
  const [weekday, setWeekday] = useState(job.workweek_start_weekday);
  const [time, setTime] = useState(job.workweek_start_time);
  const [pickingTime, setPickingTime] = useState(false);
  const [saving, setSaving] = useState(false);

  function pickerValue(): Date {
    const value = new Date();
    value.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
    return value;
  }

  function handleTimeChange(value: Date) {
    setTime(
      `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
    );
  }

  function openTimePicker() {
    if (process.env.EXPO_OS === 'android') {
      // Android owns this as a dialog. Its imperative API avoids mounting an
      // invisible picker behind the dialog, the same path proven by the shift
      // form's Android regression.
      DateTimePickerAndroid.open({
        value: pickerValue(),
        mode: 'time',
        display: 'spinner',
        onValueChange: (_, value) => handleTimeChange(value),
      });
      return;
    }

    setPickingTime(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateOvertimeSettings(job.id, enabled, weekday, time);
      await onSaved();
      Alert.alert('Overtime settings saved', `${job.name}'s workweek settings were updated.`);
    } catch (cause) {
      console.error('Could not save overtime settings.', cause);
      Alert.alert('Settings not saved', 'Nothing changed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.title}>Estimate overtime</Text>
          <Text style={styles.explanation}>Only if this job pays 1.5x after 40 hours.</Text>
        </View>
        <Switch
          accessibilityLabel={`Estimate overtime for ${job.name}`}
          disabled={saving}
          value={enabled}
          onValueChange={setEnabled}
        />
      </View>

      {enabled ? (
        <>
          <Text style={styles.label}>Employer workweek starts</Text>
          <View style={styles.weekdays}>
            {WEEKDAY_NAMES.map((name, index) => {
              const selected = weekday === index;
              return (
                <Pressable
                  key={name}
                  accessibilityLabel={`${FULL_WEEKDAY_NAMES[index]} workweek start`}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: saving }}
                  disabled={saving}
                  style={[styles.weekday, selected && styles.weekdaySelected]}
                  onPress={() => setWeekday(index)}
                >
                  <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityLabel={`Workweek start time, ${timeInputValue(time)}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            style={styles.timeButton}
            onPress={openTimePicker}
          >
            <Text style={styles.timeText}>{timeInputValue(time)}</Text>
          </Pressable>

          {pickingTime ? (
            <View style={styles.timePickerPanel}>
              <DateTimePicker
                value={pickerValue()}
                mode="time"
                display="spinner"
                locale="en-US"
                onValueChange={(_, value) => handleTimeChange(value)}
              />
              <Pressable
                accessibilityRole="button"
                style={styles.doneButton}
                onPress={() => setPickingTime(false)}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.note}>
            Shifts without start and end times count wholly on their logged date. Tipped-credit
            and other overtime rules are not included yet.
          </Text>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={() => void handleSave()}
      >
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save overtime settings'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
    marginHorizontal: 16,
    paddingVertical: 16,
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleText: { flex: 1 },
  title: { color: '#111827', fontWeight: '600' },
  explanation: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  label: { color: '#374151', fontWeight: '600' },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekday: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 22,
  },
  weekdaySelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  weekdayText: { color: '#374151' },
  weekdayTextSelected: { color: '#fff', fontWeight: '600' },
  timeButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  timeText: { color: '#111827', fontSize: 16 },
  timePickerPanel: { gap: 8 },
  doneButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  doneText: { color: '#2563eb', fontWeight: '600' },
  note: { color: '#6b7280', fontSize: 12, lineHeight: 18 },
  saveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontWeight: '600' },
});
