import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CalendarPicker from './CalendarPicker';
import { Job } from '../data/jobs';
import { createShift, Shift, updateShift } from '../data/shifts';
import { durationSecondsBetween, localDateString, parseCalendarDate, timeInputValue } from '../lib/dates';
import { hoursInputValue, moneyInputValue } from '../lib/format';

type Props = {
  // Fetched once by LogScreen (which already needs the list to decide whether
  // to show this form at all) and passed down, rather than fetched again
  // here -- no reason to hit the database twice for the same data.
  jobs: Job[];

  // When present, this form edits that shift instead of creating a new
  // one: fields pre-fill from it, and submitting calls updateShift instead
  // of createShift. LogScreen is responsible for giving this component a
  // fresh `key` whenever editingShift changes -- this
  // component doesn't need to know that's happening, it just reads
  // editingShift once at mount like any other prop-seeded state.
  editingShift?: Shift | null;

  // Every logged shift, so the calendar can dot the days that already have
  // one. Passed down for the same reason as `jobs` -- LogScreen has already
  // read them.
  existingShifts?: Shift[];

  onShiftSaved: () => void;

  // Only meaningful in edit mode -- lets the user back out without saving.
  onCancelEdit?: () => void;

  // Called when the user picks a date that already has one shift and chooses
  // to edit it rather than add another. This form cannot switch itself into
  // edit mode -- LogScreen owns which shift is being edited and re-keys the
  // form -- so the choice is handed back up.
  onEditExisting?: (shift: Shift) => void;
};

function todayIsoDate(): string {
  // Reads the clock here, does the calendar arithmetic in lib/dates.ts --
  // which is what makes that half testable. See the comment there for why
  // toISOString() is the wrong tool: it answers "what day is it in UTC", and
  // the only day that matters is the one the user is standing in.
  return localDateString(new Date());
}

// fallow-ignore-next-line complexity -- One native form owns one set of fields and submission state.
export default function LogShiftForm({
  jobs,
  editingShift,
  existingShifts = [],
  onShiftSaved,
  onCancelEdit,
  onEditExisting,
}: Props) {
  const isEditing = editingShift != null;

  const [pickingDate, setPickingDate] = useState(false);

  // One dot per day that already has a shift. Two shifts on the same date
  // collapse to one dot, which is the honest signal -- the dot answers "have I
  // logged this day", not "how many".
  const datesWithShifts = useMemo(
    () => new Set(existingShifts.map((shift) => shift.shift_date)),
    [existingShifts]
  );

  const [selectedJobId, setSelectedJobId] = useState(editingShift?.job_id ?? jobs[0]?.id ?? '');
  const [shiftDate, setShiftDate] = useState(editingShift?.shift_date ?? todayIsoDate());
  const [startTime, setStartTime] = useState<string | null>(editingShift?.start_time ?? null);
  const [endTime, setEndTime] = useState<string | null>(editingShift?.end_time ?? null);
  const [pickingTime, setPickingTime] = useState<'start' | 'end' | null>(null);
  // These three used to be a raw division, which is how the edit form ended up
  // showing 7.583333333333333 for a 455-minute shift. The helpers pick a
  // precision that converts back to the identical stored integer, per D6 --
  // the tempting fix of matching the list's "7.6h" would quietly rewrite
  // the stored seconds.
  // fallow-ignore-next-line complexity -- Stored-vs-derived edit behavior is one initialization rule.
  const [hours, setHours] = useState(() => {
    if (!editingShift) return '';
    const elapsed = editingShift.start_time && editingShift.end_time
      ? durationSecondsBetween(editingShift.start_time, editingShift.end_time)
      : null;
    return elapsed === editingShift.duration_seconds
      ? ''
      : hoursInputValue(editingShift.duration_seconds);
  });
  const [hoursTouched, setHoursTouched] = useState(false);
  const [tips, setTips] = useState(editingShift ? moneyInputValue(editingShift.tips_cents) : '');
  const [hourlyRate, setHourlyRate] = useState(() => {
    if (editingShift) {
      return moneyInputValue(editingShift.hourly_rate_cents);
    }
    return jobs[0] ? moneyInputValue(jobs[0].hourly_rate_cents) : '';
  });
  const [note, setNote] = useState(editingShift?.note ?? '');

  // fallow-ignore-next-line complexity -- Each branch is a distinct visible date-conflict choice.
  function handleDateSelected(date: string) {
    setPickingDate(false);

    // The shift being edited is not a conflict with itself. Without this,
    // opening the calendar while editing and tapping the date already in the
    // field would warn that the shift collides with itself.
    const clashes = existingShifts.filter(
      (shift) => shift.shift_date === date && shift.id !== editingShift?.id
    );

    if (clashes.length === 0) {
      setShiftDate(date);
      return;
    }

    // A warning buzz rather than the selection tick a normal day gets, so the
    // hand knows something needs reading before the eyes get there.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    // Doubles are legitimate -- two shifts on one day is a real thing that
    // happens, and the data already contains one -- so this informs rather
    // than blocks. Cancel leaves the date untouched.
    const buttons = [
      { text: 'Add new shift', onPress: () => setShiftDate(date) },
      // Only offered when there is exactly one shift to mean. With several,
      // "the existing shift" has no referent, so the choice is left out rather
      // than guessing which one the user meant.
      ...(clashes.length === 1 && onEditExisting
        ? [{ text: 'Edit existing shift', onPress: () => onEditExisting(clashes[0]) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];

    Alert.alert(
      'A shift already exists for this date.',
      clashes.length === 1 ? undefined : `${clashes.length} shifts are logged on ${date}.`,
      buttons
    );
  }

  function handleSelectJob(job: Job) {
    setSelectedJobId(job.id);
    // Default the rate field to the newly selected job's rate -- still
    // editable afterward. This only sets the starting point, the same
    // "inherited but overridable" behavior docs/product.md's Layer 0 scope
    // calls for (raises happen, so do special events at a different rate).
    // Same behavior in edit mode: switching a shift to a different job resets
    // the rate suggestion, since the old job's rate isn't relevant anymore.
    setHourlyRate(moneyInputValue(job.hourly_rate_cents));
  }

  function pickerValue(time: string | null): Date {
    const value = new Date();
    if (time) value.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
    return value;
  }

  function handleTimeChange(target: 'start' | 'end', value: Date) {
    const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    if (target === 'start') setStartTime(time);
    if (target === 'end') setEndTime(time);
    if (!hoursTouched) setHours('');
  }

  function openTimePicker(target: 'start' | 'end') {
    const value = pickerValue(target === 'start' ? startTime : endTime);

    if (process.env.EXPO_OS === 'android') {
      // Android presents this control as a dialog, so use the package's
      // imperative API instead of mounting an invisible component behind it.
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        display: 'spinner',
        onValueChange: (_, selectedValue) => handleTimeChange(target, selectedValue),
      });
      return;
    }

    setPickingTime(target);
  }

  // fallow-ignore-next-line complexity -- Trust-boundary checks stay explicit beside their messages.
  async function handleSubmit() {
    if (selectedJobId === '') {
      Alert.alert('Choose a job', 'A shift must belong to a job.');
      return;
    }

    if (!parseCalendarDate(shiftDate)) {
      Alert.alert('Check the date', 'Enter a real calendar date as YYYY-MM-DD.');
      return;
    }

    // Number(), paired with the empty-string checks, rejects pasted text such
    // as "7.5 hours". parseFloat() would silently accept that as 7.5.
    const hoursValue = hours.trim() === '' ? null : Number(hours);
    const tipsValue = tips.trim() === '' ? 0 : Number(tips);
    const rateValue = Number(hourlyRate);

    if (
      (hoursValue !== null && !Number.isFinite(hoursValue)) ||
      !Number.isFinite(tipsValue) ||
      tipsValue < 0 ||
      hourlyRate.trim() === '' ||
      !Number.isFinite(rateValue) ||
      rateValue < 0
    ) {
      Alert.alert(
        'Check shift details',
        'Enter valid hours. Tips and hourly rate cannot be negative.'
      );
      return;
    }

    // Same unit conversions either way: Math.round rather than a bare
    // multiply, to avoid floating point landing one cent off.
    const tipsCents = Math.round(tipsValue * 100);
    const hourlyRateCents = Math.round(rateValue * 100);
    const noteValue = note.trim() === '' ? null : note.trim();
    const hasStartTime = startTime !== null;
    const hasEndTime = endTime !== null;

    if (hasStartTime !== hasEndTime) {
      Alert.alert('Check shift times', 'Enter both a start time and an end time, or leave both blank.');
      return;
    }

    const durationSeconds = hoursValue === null
      ? startTime && endTime ? durationSecondsBetween(startTime, endTime) : null
      : Math.round(hoursValue * 3600);

    if (durationSeconds === null || durationSeconds <= 0) {
      Alert.alert('Check hours worked', 'Enter hours greater than zero, or enter different start and end times.');
      return;
    }

    if (editingShift) {
      await updateShift(
        editingShift.id,
        selectedJobId,
        shiftDate,
        durationSeconds,
        tipsCents,
        hourlyRateCents,
        noteValue,
        startTime,
        endTime
      );
    } else {
      await createShift(
        selectedJobId,
        shiftDate,
        durationSeconds,
        tipsCents,
        hourlyRateCents,
        noteValue,
        startTime,
        endTime
      );

      // Reset the per-shift fields, but leave the job selected -- logging
      // several shifts at the same job in a row is the common case, not
      // the exception. Only done for create: after an edit, this component
      // is about to be torn down anyway (LogScreen clears editingShift and
      // remounts back to "new shift" mode), so resetting fields here would
      // just be wasted work.
      setHours('');
      setTips('');
      setNote('');
      setStartTime('');
      setEndTime('');
    }

    onShiftSaved();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isEditing ? 'Edit shift' : 'Log a shift'}</Text>

      <Text style={styles.label}>Job</Text>
      {/* A row of tappable chips instead of a native Picker -- no extra
          dependency needed for a handful of jobs, and it's more obvious at
          a glance which one's selected than a dropdown would be. */}
      <View style={styles.jobRow}>
        {jobs.map((job) => (
          <Pressable
            key={job.id}
            style={[styles.jobChip, job.id === selectedJobId && styles.jobChipSelected]}
            onPress={() => handleSelectJob(job)}
          >
            <Text
              style={[
                styles.jobChipText,
                job.id === selectedJobId && styles.jobChipTextSelected,
              ]}
            >
              {job.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Date</Text>
      {/* Typing stays the primary path -- the icon is an alternative, not a
          replacement, so a keyboard user is never forced through a grid. */}
      <View style={styles.dateRow}>
        <TextInput
          style={[styles.input, styles.dateInput]}
          value={shiftDate}
          onChangeText={setShiftDate}
          placeholder="YYYY-MM-DD"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick a date from a calendar"
          style={styles.calendarButton}
          onPress={() => setPickingDate(true)}
        >
          <Text style={styles.calendarButtonText}>📅</Text>
        </Pressable>
      </View>

      {/* Remounted per opening so the month it shows is re-seeded from the
          field each time, rather than staying wherever it was left. */}
      {pickingDate ? (
        <CalendarPicker
          visible
          selectedDate={shiftDate}
          datesWithShifts={datesWithShifts}
          onSelect={handleDateSelected}
          onClose={() => setPickingDate(false)}
        />
      ) : null}

      <Text style={styles.label}>Start time (optional)</Text>
      <Pressable style={styles.input} onPress={() => openTimePicker('start')}>
        <Text style={[styles.timeText, !startTime && styles.placeholder]}>
          {startTime ? timeInputValue(startTime) : 'Choose start time'}
        </Text>
      </Pressable>

      <Text style={styles.label}>End time (optional)</Text>
      <Pressable style={styles.input} onPress={() => openTimePicker('end')}>
        <Text style={[styles.timeText, !endTime && styles.placeholder]}>
          {endTime ? timeInputValue(endTime) : 'Choose end time'}
        </Text>
      </Pressable>

      {pickingTime ? (
        <View style={styles.timePickerPanel}>
          <DateTimePicker
            value={pickerValue(pickingTime === 'start' ? startTime : endTime)}
            mode="time"
            display="spinner"
            locale="en-US"
            onValueChange={(_, value) => handleTimeChange(pickingTime, value)}
          />
          <Pressable style={styles.timePickerDone} onPress={() => setPickingTime(null)}>
            <Text style={styles.timePickerDoneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {startTime || endTime ? (
        <Pressable
          style={styles.clearTimesButton}
          onPress={() => {
            setStartTime(null);
            setEndTime(null);
            setPickingTime(null);
          }}
        >
          <Text style={styles.clearTimesText}>Clear times</Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>Hours worked (optional with times)</Text>
      <TextInput
        style={styles.input}
        value={hours}
        onChangeText={(value) => {
          setHours(value);
          setHoursTouched(true);
        }}
        placeholder="e.g. 7.5"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Tips ($, optional)</Text>
      <TextInput
        style={styles.input}
        value={tips}
        onChangeText={setTips}
        placeholder="e.g. 45.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Hourly rate ($)</Text>
      <TextInput
        style={styles.input}
        value={hourlyRate}
        onChangeText={setHourlyRate}
        placeholder="e.g. 12.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. slow night" />

      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{isEditing ? 'Save changes' : 'Log shift'}</Text>
      </Pressable>

      {/* Cancel is not just for editing any more: the form is hidden behind a
          button now, so a new entry needs a way back out too. */}
      {onCancelEdit ? (
        <Pressable style={styles.cancelButton} onPress={onCancelEdit}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  label: {
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  timeText: {
    fontSize: 16,
  },
  placeholder: {
    color: '#999',
  },
  clearTimesButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  clearTimesText: {
    color: '#666',
  },
  timePickerPanel: {
    gap: 8,
  },
  timePickerDone: {
    alignSelf: 'flex-end',
    padding: 10,
  },
  timePickerDoneText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // The field takes the leftover width so the button keeps a fixed size
  // whatever the screen is.
  dateInput: {
    flex: 1,
  },
  calendarButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  calendarButtonText: {
    fontSize: 20,
  },
  jobRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  jobChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  jobChipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  jobChipText: {
    color: '#111',
  },
  jobChipTextSelected: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    padding: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
});
