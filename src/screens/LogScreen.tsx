import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateJobForm from '../components/CreateJobForm';
import LogShiftForm from '../components/LogShiftForm';
import ShiftList from '../components/ShiftList';
import ShiftTotals from '../components/ShiftTotals';
import { getDb } from '../data/db';
import { Job, listActiveJobs } from '../data/jobs';
import { listShifts, Shift } from '../data/shifts';

export default function LogScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [addingJob, setAddingJob] = useState(false);

  // SQLite is the source of truth. Re-query after every write and whenever
  // this tab regains focus, rather than maintaining a second shared cache.
  const refresh = useCallback(async () => {
    try {
      setError(null);
      await getDb();
      const [activeJobs, allShifts] = await Promise.all([listActiveJobs(), listShifts()]);
      setJobs(activeJobs);
      setShifts(allShifts);
    } catch (cause) {
      console.error('Could not load the Log screen.', cause);
      setError('Your jobs and shifts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text>Loading...</Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {jobs.length === 0 ? (
        // A shift's job_id is required, so creating the first job is the only
        // useful action until at least one job exists.
        <CreateJobForm onJobCreated={refresh} />
      ) : (
        // The form, totals, and rows share one FlatList. That leaves the list
        // usable on a small phone and gives the decimal keyboard empty space
        // and drag gestures that dismiss it.
        <ShiftList
          shifts={shifts}
          jobs={jobs}
          onShiftDeleted={refresh}
          onShiftPress={setEditingShift}
          header={
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: addingJob }}
                style={styles.addJobButton}
                onPress={() => setAddingJob((current) => !current)}
              >
                <Text style={styles.addJobButtonText}>
                  {addingJob ? 'Cancel adding job' : 'Add another job'}
                </Text>
              </Pressable>
              {addingJob ? (
                <CreateJobForm
                  onJobCreated={() => {
                    setAddingJob(false);
                    void refresh();
                  }}
                />
              ) : null}
              {/* A new key remounts the prop-seeded form when edit targets
                  change, so it cannot retain the previous shift's fields. */}
              <LogShiftForm
                key={editingShift?.id ?? 'new'}
                jobs={jobs}
                editingShift={editingShift}
                onShiftSaved={() => {
                  setEditingShift(null);
                  void refresh();
                }}
                onCancelEdit={() => setEditingShift(null)}
              />
              <ShiftTotals shifts={shifts} />
            </>
          }
        />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: {
    color: '#444',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  addJobButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
  },
  addJobButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
