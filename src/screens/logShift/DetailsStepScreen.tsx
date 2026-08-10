import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CalendarPicker from '../../components/CalendarPicker';
import { Job, listJobs } from '../../data/jobs';
import { createShift, listShifts, Shift, updateShift } from '../../data/shifts';
import { durationSecondsBetween, parseCalendarDate, timeInputValue } from '../../lib/dates';
import { formatClockSpan, formatLongDate, hoursInputValue, moneyInputValue } from '../../lib/format';

// The last step of logging, and the whole of editing.
//
// Creating arrives here with a job and a date already chosen, so the fields are
// only about the money and the time. Editing arrives with a shift id and
// nothing else -- there is no flow to walk, just one shift to correct -- so the
// date becomes a field on this screen and opens the calendar in a sheet.
export default function DetailsStepScreen() {
  const params = useLocalSearchParams<{ jobId?: string; date?: string; shiftId?: string }>();
  const editingId = params.shiftId ?? null;
  const isEditing = editingId !== null;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Advanced holds the two fields most shifts do not need. Start and end times
  // are how D18's overtime gets a workweek to sit in, but a shift logged as
  // "5.5 hours" is complete without them.
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [pickingTime, setPickingTime] = useState<'start' | 'end' | null>(null);

  const editingShift = useMemo(
    () => (editingId === null ? null : shifts.find((shift) => shift.id === editingId) ?? null),
    [editingId, shifts]
  );

  const [selectedJobId, setSelectedJobId] = useState(params.jobId ?? '');
  const [shiftDate, setShiftDate] = useState(params.date ?? '');
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [hoursTouched, setHoursTouched] = useState(false);
  const [tips, setTips] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [note, setNote] = useState('');

  // One read for both lists. Everything the fields start at is seeded here
  // rather than in useState initialisers, because none of it exists until the
  // database answers.
  // fallow-ignore-next-line complexity -- Seeding create and edit from one read is a single rule with two shapes.
  useEffect(() => {
    Promise.all([listJobs(), listShifts()])
      .then(([allJobs, allShifts]) => {
        setJobs(allJobs);
        setShifts(allShifts);

        const existing = params.shiftId
          ? allShifts.find((shift) => shift.id === params.shiftId)
          : undefined;

        if (existing) {
          setSelectedJobId(existing.job_id);
          setShiftDate(existing.shift_date);
          setStartTime(existing.start_time);
          setEndTime(existing.end_time);
          setTips(moneyInputValue(existing.tips_cents));
          setHourlyRate(moneyInputValue(existing.hourly_rate_cents));
          setNote(existing.note ?? '');
          // Hours stays blank when the stored duration is exactly what the two
          // times imply, so editing a timed shift does not pin a number that
          // would then override a time change. Same rule as the old form: the
          // helpers pick a precision that converts back to the identical stored
          // integer per D6, rather than the list's rounded "7.6h".
          const elapsed = existing.start_time && existing.end_time
            ? durationSecondsBetween(existing.start_time, existing.end_time)
            : null;
          setHours(
            elapsed === existing.duration_seconds ? '' : hoursInputValue(existing.duration_seconds)
          );
          // A shift that already carries times has nothing to gain from hiding
          // them behind a toggle the user would have to discover.
          if (existing.start_time || existing.end_time) setAdvanced(true);
        } else {
          // Creating: the rate starts at the job's current rate and stays
          // editable. schema.sql keeps the rate on the shift precisely so a
          // raise later cannot rewrite what last year actually paid.
          const job = allJobs.find((entry) => entry.id === params.jobId);
          if (job) setHourlyRate(moneyInputValue(job.hourly_rate_cents));
        }
      })
      .catch((cause) => {
        console.error('Could not load the shift details screen.', cause);
        Alert.alert('Could not open', 'Your jobs and shifts could not be read. Try again.');
      })
      .finally(() => setLoaded(true));
    // Params are fixed for the life of this screen -- a different shift or date
    // is a different push -- so this deliberately runs once.
  }, [params.jobId, params.shiftId]);

  const datesWithShifts = useMemo(
    () => new Set(shifts.map((shift) => shift.shift_date)),
    [shifts]
  );
  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  // What the two entered times imply, wrapped across midnight by the same
  // helper submission uses. Shown under the fields so the span is readable
  // before submitting, rather than only being checked afterwards.
  const elapsedSeconds = startTime && endTime
    ? durationSecondsBetween(startTime, endTime)
    : null;

  function pickerValue(time: string | null): Date {
    const value = new Date();
    if (time) value.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
    return value;
  }

  function handleTimeChange(target: 'start' | 'end', value: Date) {
    const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    if (target === 'start') setStartTime(time);
    if (target === 'end') setEndTime(time);
    // Times imply a duration, so a untouched hours field defers to them.
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

  // Every check below is a trust boundary between free text and stored integers,
  // carried over from the form this screen replaced. None of it is presentation.
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

    // Math.round rather than a bare multiply, to avoid floating point landing
    // one cent off.
    const tipsCents = Math.round(tipsValue * 100);
    const hourlyRateCents = Math.round(rateValue * 100);
    const noteValue = note.trim() === '' ? null : note.trim();

    if ((startTime !== null) !== (endTime !== null)) {
      Alert.alert('Check shift times', 'Enter both a start time and an end time, or leave both blank.');
      return;
    }

    const durationSeconds = hoursValue === null
      ? elapsedSeconds
      : Math.round(hoursValue * 3600);

    if (durationSeconds === null || durationSeconds <= 0) {
      Alert.alert('Check hours worked', 'Enter hours greater than zero, or enter different start and end times.');
      return;
    }

    // The write, defined before the two places that reach it: the warning below
    // saves either duration depending on which the user picks, so the write
    // cannot live inline in the happy path. Everything it needs is validated by
    // the time it runs.
    async function writeShift(seconds: number) {
      // Guards the double-tap. Without it a slow write can be submitted twice
      // and log the shift twice, which is the one mistake this screen must not
      // make.
      setSaving(true);
      try {
        if (editingId !== null) {
          await updateShift(
            editingId,
            selectedJobId,
            shiftDate,
            seconds,
            tipsCents,
            hourlyRateCents,
            noteValue,
            startTime,
            endTime
          );
          // Editing has no confirmation screen: the user came from the list to
          // change one thing, and the changed row is the confirmation.
          router.dismissAll();
          return;
        }

        const id = await createShift(
          selectedJobId,
          shiftDate,
          seconds,
          tipsCents,
          hourlyRateCents,
          noteValue,
          startTime,
          endTime
        );
        // replace, not push: the form is finished, and backing out of the
        // confirmation should leave the flow rather than re-open a saved shift.
        router.replace({ pathname: '/log-shift/done', params: { shiftId: id } });
      } catch (cause) {
        console.error('Could not save the shift.', cause);
        Alert.alert('Shift not saved', 'Nothing was written. Try again.');
        setSaving(false);
      }
    }

    // An entered duration shorter than the clock span is an unpaid break, which
    // D18 says wins on purpose. Longer than the clock span is not a break --
    // nobody works eight hours inside a two-minute window -- so it is one of
    // the two fields being wrong, and the app cannot tell which. Ask.
    if (hoursValue !== null && elapsedSeconds !== null && durationSeconds > elapsedSeconds) {
      Alert.alert(
        'Hours are longer than the times',
        `Those times are ${formatClockSpan(elapsedSeconds)} apart, but hours worked says ${formatClockSpan(durationSeconds)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Use the times (${formatClockSpan(elapsedSeconds)})`,
            onPress: () => void writeShift(elapsedSeconds),
          },
          {
            text: `Keep ${formatClockSpan(durationSeconds)}`,
            onPress: () => void writeShift(durationSeconds),
          },
        ]
      );
      return;
    }

    await writeShift(durationSeconds);
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headingRow}>
            <View style={styles.headingText}>
              <Text selectable style={styles.title}>{formatLongDate(shiftDate)}</Text>
              {selectedJob ? <Text style={styles.subtitle}>{selectedJob.name}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: advanced }}
              hitSlop={8}
              onPress={() => setAdvanced((current) => !current)}
            >
              <Text style={styles.toggleText}>{advanced ? 'Basic' : 'Advanced'}</Text>
            </Pressable>
          </View>

          {/* Only when editing. Creating chose the date on the step before, and
              a field to change it there would undo that step. */}
          {isEditing ? (
            <>
              <Text style={styles.label}>Date</Text>
              <Pressable style={styles.input} onPress={() => setPickingDate(true)}>
                <Text style={styles.inputText}>{shiftDate}</Text>
              </Pressable>
              {pickingDate ? (
                <CalendarPicker
                  visible
                  selectedDate={shiftDate}
                  datesWithShifts={datesWithShifts}
                  onSelect={(date) => {
                    setShiftDate(date);
                    setPickingDate(false);
                  }}
                  onClose={() => setPickingDate(false)}
                />
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>Hourly wage</Text>
          <TextInput
            style={styles.input}
            value={hourlyRate}
            onChangeText={setHourlyRate}
            placeholder="e.g. 12.00"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Tips</Text>
          <TextInput
            style={styles.input}
            value={tips}
            onChangeText={setTips}
            placeholder="Enter tips"
            keyboardType="decimal-pad"
          />

          {advanced ? (
            <>
              <Text style={styles.label}>Start time</Text>
              <Pressable style={styles.input} onPress={() => openTimePicker('start')}>
                <Text style={[styles.inputText, !startTime && styles.placeholder]}>
                  {startTime ? timeInputValue(startTime) : 'Choose start time'}
                </Text>
              </Pressable>

              <Text style={styles.label}>End time</Text>
              <Pressable style={styles.input} onPress={() => openTimePicker('end')}>
                <Text style={[styles.inputText, !endTime && styles.placeholder]}>
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

              {/* Says the span in minutes, which formatHours cannot: it renders
                  one decimal, so two minutes read as "0.0h" and looked like it
                  agreed with whatever was in Hours. */}
              {elapsedSeconds !== null ? (
                <Text style={styles.spanHint}>
                  These times are {formatClockSpan(elapsedSeconds)} apart. Leave Hours blank to
                  use that, or enter fewer hours for an unpaid break.
                </Text>
              ) : null}

              {startTime || endTime ? (
                <Pressable
                  style={styles.clearTimes}
                  onPress={() => {
                    setStartTime(null);
                    setEndTime(null);
                    setPickingTime(null);
                  }}
                >
                  <Text style={styles.clearTimesText}>Clear times</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>Hours</Text>
          <TextInput
            style={styles.input}
            value={hours}
            onChangeText={(value) => {
              setHours(value);
              setHoursTouched(true);
            }}
            placeholder={advanced ? 'Optional when times are set' : 'e.g. 7.5'}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Enter note (optional)"
            multiline
          />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Log shift'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  content: { gap: 8, padding: 20, paddingBottom: 32 },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  headingText: { flex: 1, gap: 2 },
  title: { color: '#111827', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#6b7280', fontSize: 15 },
  toggleText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  label: { color: '#374151', fontWeight: '600', marginTop: 8 },
  input: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  inputText: { fontSize: 16 },
  placeholder: { color: '#9ca3af' },
  noteInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  timePickerPanel: { gap: 8 },
  timePickerDone: { alignSelf: 'flex-end', padding: 10 },
  timePickerDoneText: { color: '#2563eb', fontWeight: '600' },
  spanHint: { color: '#6b7280', fontSize: 13, lineHeight: 18, marginTop: 4 },
  clearTimes: { alignSelf: 'flex-start', paddingVertical: 4 },
  clearTimesText: { color: '#6b7280' },
  // Outside the scroller, so the action stays put while the fields move.
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 20,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  primaryButtonDisabled: { backgroundColor: '#93b4f5' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
