import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Job } from '../jobs';
import { createShift } from '../shifts';

type Props = {
  // Fetched once by App.tsx (which already needs the list to decide whether
  // to show this form at all) and passed down, rather than fetched again
  // here -- no reason to hit the database twice for the same data.
  jobs: Job[];
  onShiftLogged: () => void;
};

function todayIsoDate(): string {
  // Matches schema.sql's date-only convention: no time, no timezone.
  // Slicing toISOString() down to 10 characters keeps "YYYY-MM-DD" and
  // drops the time portion, which is what stops a late shift from
  // displaying on the wrong day depending on timezone.
  return new Date().toISOString().slice(0, 10);
}

export default function LogShiftForm({ jobs, onShiftLogged }: Props) {
  const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id ?? '');
  const [shiftDate, setShiftDate] = useState(todayIsoDate());
  const [hours, setHours] = useState('');
  const [tips, setTips] = useState('');
  const [hourlyRate, setHourlyRate] = useState(
    jobs[0] ? String(jobs[0].hourly_rate_cents / 100) : ''
  );
  const [note, setNote] = useState('');

  function handleSelectJob(job: Job) {
    setSelectedJobId(job.id);
    // Default the rate field to the newly selected job's rate -- still
    // editable afterward. This only sets the starting point, the same
    // "inherited but overridable" behavior BRAINSTORM.md's MVP scope calls
    // for (raises happen, so do special events at a different rate).
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

    // Same unit conversions as CreateJobForm: Math.round rather than a bare
    // multiply, to avoid floating point landing one cent off.
    const minutes = Math.round(hoursValue * 60);
    const tipsCents = Math.round(tipsValue * 100);
    const hourlyRateCents = Math.round(rateValue * 100);

    await createShift(
      selectedJobId,
      shiftDate,
      minutes,
      tipsCents,
      hourlyRateCents,
      note.trim() === '' ? null : note.trim()
    );

    // Reset the per-shift fields, but leave the job selected -- logging
    // several shifts at the same job in a row is the common case, not the
    // exception.
    setHours('');
    setTips('');
    setNote('');
    onShiftLogged();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log a shift</Text>

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
        <Text style={styles.buttonText}>Log shift</Text>
      </Pressable>
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
});
