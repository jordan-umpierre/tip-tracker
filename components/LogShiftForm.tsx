import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Job } from '../jobs';
import { createShift, Shift, updateShift } from '../shifts';

type Props = {
  // Fetched once by App.tsx (which already needs the list to decide whether
  // to show this form at all) and passed down, rather than fetched again
  // here -- no reason to hit the database twice for the same data.
  jobs: Job[];

  // When present, this form edits that shift instead of creating a new
  // one: fields pre-fill from it, and submitting calls updateShift instead
  // of createShift. App.tsx is responsible for giving this component a
  // fresh `key` whenever editingShift changes (see App.tsx for why) -- this
  // component doesn't need to know that's happening, it just reads
  // editingShift once at mount like any other prop-seeded state.
  editingShift?: Shift | null;

  onShiftSaved: () => void;

  // Only meaningful in edit mode -- lets the user back out without saving.
  onCancelEdit?: () => void;
};

function todayIsoDate(): string {
  // Matches schema.sql's date-only convention: no time, no timezone.
  // Slicing toISOString() down to 10 characters keeps "YYYY-MM-DD" and
  // drops the time portion, which is what stops a late shift from
  // displaying on the wrong day depending on timezone.
  return new Date().toISOString().slice(0, 10);
}

export default function LogShiftForm({ jobs, editingShift, onShiftSaved, onCancelEdit }: Props) {
  const isEditing = editingShift != null;

  const [selectedJobId, setSelectedJobId] = useState(editingShift?.job_id ?? jobs[0]?.id ?? '');
  const [shiftDate, setShiftDate] = useState(editingShift?.shift_date ?? todayIsoDate());
  const [hours, setHours] = useState(editingShift ? String(editingShift.minutes / 60) : '');
  const [tips, setTips] = useState(editingShift ? String(editingShift.tips_cents / 100) : '');
  const [hourlyRate, setHourlyRate] = useState(() => {
    if (editingShift) {
      return String(editingShift.hourly_rate_cents / 100);
    }
    return jobs[0] ? String(jobs[0].hourly_rate_cents / 100) : '';
  });
  const [note, setNote] = useState(editingShift?.note ?? '');

  function handleSelectJob(job: Job) {
    setSelectedJobId(job.id);
    // Default the rate field to the newly selected job's rate -- still
    // editable afterward. This only sets the starting point, the same
    // "inherited but overridable" behavior BRAINSTORM.md's MVP scope calls
    // for (raises happen, so do special events at a different rate). Same
    // behavior in edit mode: switching a shift to a different job resets
    // the rate suggestion, since the old job's rate isn't relevant anymore.
    setHourlyRate(String(job.hourly_rate_cents / 100));
  }

  async function handleSubmit() {
    const hoursValue = parseFloat(hours);
    const tipsValue = parseFloat(tips);
    const rateValue = parseFloat(hourlyRate);

    if (
      selectedJobId === '' ||
      Number.isNaN(hoursValue) ||
      hoursValue <= 0 ||
      Number.isNaN(tipsValue) ||
      tipsValue < 0 ||
      Number.isNaN(rateValue) ||
      rateValue < 0
    ) {
      return;
    }

    // Same unit conversions either way: Math.round rather than a bare
    // multiply, to avoid floating point landing one cent off.
    const minutes = Math.round(hoursValue * 60);
    const tipsCents = Math.round(tipsValue * 100);
    const hourlyRateCents = Math.round(rateValue * 100);
    const noteValue = note.trim() === '' ? null : note.trim();

    if (editingShift) {
      await updateShift(editingShift.id, selectedJobId, shiftDate, minutes, tipsCents, hourlyRateCents, noteValue);
    } else {
      await createShift(selectedJobId, shiftDate, minutes, tipsCents, hourlyRateCents, noteValue);

      // Reset the per-shift fields, but leave the job selected -- logging
      // several shifts at the same job in a row is the common case, not
      // the exception. Only done for create: after an edit, this component
      // is about to be torn down anyway (App.tsx clears editingShift and
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
      <TextInput
        style={styles.input}
        value={shiftDate}
        onChangeText={setShiftDate}
        placeholder="YYYY-MM-DD"
      />

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

      {isEditing && onCancelEdit ? (
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
