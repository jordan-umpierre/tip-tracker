import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import CreateJobForm from './components/CreateJobForm';
import LogShiftForm from './components/LogShiftForm';
import ShiftList from './components/ShiftList';
import { getDb } from './db';
import { Job, listActiveJobs } from './jobs';
import { listShifts, Shift } from './shifts';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // Re-reads jobs and shifts from SQLite. Called once on mount, and again
  // after every create -- SQLite doesn't push updates to the app on its
  // own, so re-querying is how the UI finds out a write actually happened.
  const refresh = useCallback(async () => {
    await getDb(); // makes sure schema.sql has run before anything queries it
    const [activeJobs, allShifts] = await Promise.all([listActiveJobs(), listShifts()]);
    setJobs(activeJobs);
    setShifts(allShifts);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {jobs.length === 0 ? (
        // No jobs yet means createShift has nothing to point at (job_id is
        // NOT NULL with a foreign key), so this is the only thing to show
        // until at least one job exists.
        <CreateJobForm onJobCreated={refresh} />
      ) : (
        <>
          <LogShiftForm jobs={jobs} onShiftLogged={refresh} />
          <ShiftList shifts={shifts} jobs={jobs} />
        </>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
