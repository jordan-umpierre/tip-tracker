import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import CreateJobForm from './components/CreateJobForm';
import LogShiftForm from './components/LogShiftForm';
import ShiftList from './components/ShiftList';
import ShiftTotals from './components/ShiftTotals';
import { getDb } from './data/db';
import { Job, listActiveJobs } from './data/jobs';
import { listShifts, Shift } from './data/shifts';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Re-reads jobs and shifts from SQLite. Called once on mount, and again
  // after every create, edit, or delete -- SQLite doesn't push updates to
  // the app on its own, so re-querying is how the UI finds out a write
  // actually happened.
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
        // The form and totals are handed to ShiftList as its header rather
        // than stacked above it. That makes the whole screen one scrolling
        // surface: the form scrolls out of the way when you want to read the
        // list, instead of permanently occupying most of the screen and
        // leaving the rows crammed into the bottom strip.
        //
        // This is an element, not a function returning one. Passing
        // `() => <LogShiftForm .../>` would create a brand new component type
        // on every render, so React would unmount and remount the form each
        // time -- losing focus and dismissing the keyboard on every keystroke.
        <ShiftList
          shifts={shifts}
          jobs={jobs}
          onShiftDeleted={refresh}
          onShiftPress={setEditingShift}
          header={
            <>
              {/* key forces React to treat "editing shift A" and "editing
                  shift B" (or "not editing") as different component instances
                  rather than the same one with a prop that silently changed
                  underneath it. That's what makes LogShiftForm's useState
                  initializers -- which only run once, at mount -- correctly
                  re-read from whichever shift is now being edited, without
                  needing a useEffect to sync state across renders. */}
              <LogShiftForm
                key={editingShift?.id ?? 'new'}
                jobs={jobs}
                editingShift={editingShift}
                onShiftSaved={() => {
                  setEditingShift(null);
                  refresh();
                }}
                onCancelEdit={() => setEditingShift(null)}
              />
              {/* Summary above the detail it summarizes, and reading the same
                  shifts array ShiftList does -- so the rows below always add
                  up to these numbers rather than being fetched separately and
                  drifting out of sync. */}
              <ShiftTotals shifts={shifts} />
            </>
          }
        />
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
