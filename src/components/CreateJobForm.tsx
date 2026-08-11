import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createJob } from '../data/jobs';

type Props = {
  // A callback prop: the parent screen passes down a function, and this
  // component calls it when a job's been created. That's how a child tells
  // a parent "something happened" in React -- there's no other direction
  // for data to flow back up.
  onJobCreated: () => void;
};

export default function CreateJobForm({ onJobCreated }: Props) {
  // useState is how a component remembers something between renders, and
  // re-renders itself when that something changes. `name` is the current
  // value; `setName` is the only way to change it. Calling setName doesn't
  // just update the variable -- it tells React "re-render this component
  // with the new value." A plain `let name = ''` would reset to '' on
  // every re-render instead of holding what the user typed.
  //
  // Both fields start as empty strings, matching what an empty TextInput
  // holds before anyone's typed anything.
  const [name, setName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  // Runs when the button is pressed. `async` because createJob (in
  // jobs.ts) is async -- it has to await a SQLite write.
  async function handleSubmit() {
    // TextInput always hands you a string, even for something that's
    // conceptually a number. Number(), paired with the empty-string check,
    // rejects pasted text such as "12 dollars" instead of silently accepting
    // its numeric prefix.
    const rate = Number(hourlyRate);

    if (
      name.trim() === '' ||
      hourlyRate.trim() === '' ||
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      Alert.alert(
        'Check job details',
        'Enter a job name and an hourly rate that is zero or greater.'
      );
      return;
    }

    // Dollars to cents needs Math.round, not a bare multiply. In
    // JavaScript, 19.9 * 100 is 1989.9999999999998, not 1990, because most
    // decimal numbers can't be represented exactly in floating point.
    // Same reasoning schema.sql already documents for money generally.
    const hourlyRateCents = Math.round(rate * 100);

    await createJob(name.trim(), hourlyRateCents);

    // Clear the form, then let the parent refresh its job list. The parent
    // also decides whether this first-job or additional-job form should close.
    setName('');
    setHourlyRate('');
    onJobCreated();
  }

  // JSX: this looks like HTML but isn't -- View/Text/TextInput are React
  // Native's own components, not <div>/<span>/<input>. Each one renders to
  // a real native view on the device, not a DOM element.
  //
  // TextInput here is a "controlled input": its `value` comes from state
  // (name, hourlyRate above) instead of the input owning its own text.
  // `onChangeText` fires on every keystroke and calls the setter, which
  // re-renders the component with the new value, which the TextInput then
  // displays. That round trip is why typing "shows up" -- the input isn't
  // remembering what you typed, React is, and re-rendering it back in.
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add a job</Text>

      <Text style={styles.label}>Job name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Diner"
      />

      <Text style={styles.label}>Hourly rate ($)</Text>
      <TextInput
        style={styles.input}
        value={hourlyRate}
        onChangeText={setHourlyRate}
        placeholder="e.g. 12.00"
        keyboardType="decimal-pad"
      />

      {/* Pressable is React Native's tappable-area component -- there's no
          <button>. onPress is the RN equivalent of onClick. */}
      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Add job</Text>
      </Pressable>
    </View>
  );
}

// StyleSheet.create is React Native's version of CSS. No CSS files, no
// class names -- styles are plain JS objects, using flexbox by default
// (no `display: flex` needed, every View already lays out that way).
const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#dfe3ea',
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    fontSize: 16,
  },
  button: {
    minHeight: 50,
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
