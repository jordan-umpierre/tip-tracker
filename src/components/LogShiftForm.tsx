import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CalendarPicker from './CalendarPicker';
import { Job } from '../data/jobs';
import { createShift, Shift, updateShift } from '../data/shifts';
import { localDateString, parseCalendarDate } from '../lib/dates';
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
  // These three used to be a raw division, which is how the edit form ended up
  // showing 7.583333333333333 for a 455-minute shift. The helpers pick a
  // precision that converts back to the identical stored integer, per D6 --
  // the tempting fix of matching the list's "7.6h" would quietly rewrite
  // the stored seconds.
  const [hours, setHours] = useState(
    editingShift ? hoursInputValue(editingShift.duration_seconds) : ''
  );
  const [tips, setTips] = useState(editingShift ? moneyInputValue(editingShift.tips_cents) : '');
  const [hourlyRate, setHourlyRate] = useState(() => {
    if (editingShift) {
      return moneyInputValue(editingShift.hourly_rate_cents);
    }
    return jobs[0] ? moneyInputValue(jobs[0].hourly_rate_cents) : '';
  });
  const [note, setNote] = useState(editingShift?.note ?? '');

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
    const hoursValue = Number(hours);
    const tipsValue = Number(tips);
    const rateValue = Number(hourlyRate);

    if (
      hours.trim() === '' ||
      !Number.isFinite(hoursValue) ||
      tips.trim() === '' ||
      !Number.isFinite(tipsValue) ||
      tipsValue < 0 ||
      hourlyRate.trim() === '' ||
      !Number.isFinite(rateValue) ||
      rateValue < 0
    ) {
      Alert.alert(
        'Check shift details',
        'Enter hours greater than zero. Tips and hourly rate cannot be negative.'
      );
      return;
    }

    // Same unit conversions either way: Math.round rather than a bare
    // multiply, to avoid floating point landing one cent off.
    const durationSeconds = Math.round(hoursValue * 3600);
    const tipsCents = Math.round(tipsValue * 100);
    const hourlyRateCents = Math.round(rateValue * 100);
    const noteValue = note.trim() === '' ? null : note.trim();

    // A tiny positive decimal can still round to zero stored seconds. Catch it
    // here instead of letting SQLite's CHECK constraint surface as an error.
    if (durationSeconds <= 0) {
      Alert.alert('Check hours worked', 'Hours worked must round to at least one second.');
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
        noteValue
      );
    } else {
      await createShift(
        selectedJobId,
        shiftDate,
        durationSeconds,
        tipsCents,
        hourlyRateCents,
        noteValue
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

      <Text style={styles.label}>Hours worked</Text>
      <TextInput
        style={styles.input}
        value={hours}
        onChangeText={setHours}
        placeholder="e.g. 7.5"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Tips ($)</Text>
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
