import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateJobForm from '../components/CreateJobForm';
import ImportCsvForm from '../components/ImportCsvForm';
import LogShiftForm from '../components/LogShiftForm';
import ShiftList from '../components/ShiftList';
import ShiftTotals from '../components/ShiftTotals';
import { getDb } from '../data/db';
import { archiveJob, Job, listActiveJobs, listJobs } from '../data/jobs';
import { listShifts, Shift } from '../data/shifts';
import { formatCents } from '../lib/format';

export default function LogScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [addingJob, setAddingJob] = useState(false);
  // The form and the data tools both start closed. This screen is mostly a
  // history to read, and opening it onto seven input boxes made a glance at
  // last week's shifts feel like being handed paperwork.
  const [loggingShift, setLoggingShift] = useState(false);
  const [managingData, setManagingData] = useState(false);

  // SQLite is the source of truth. Re-query after every write and whenever
  // this tab regains focus, rather than maintaining a second shared cache.
  const refresh = useCallback(async () => {
    try {
      setError(null);
      await getDb();
      const [activeJobs, everyJob, allShifts] = await Promise.all([
        listActiveJobs(),
        listJobs(),
        listShifts(),
      ]);
      setJobs(activeJobs);
      setAllJobs(everyJob);
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
      {/* Keep history visible after the last active job is removed. The form,
          totals, and rows share this one virtualized scroller. */}
      <ShiftList
        shifts={shifts}
        jobs={allJobs}
        onShiftDeleted={refresh}
        onShiftPress={setEditingShift}
        header={
          <LogHeader
            jobs={jobs}
            allJobs={allJobs}
            shifts={shifts}
            editingShift={editingShift}
            addingJob={addingJob}
            loggingShift={loggingShift}
            managingData={managingData}
            refresh={refresh}
            setAddingJob={setAddingJob}
            setEditingShift={setEditingShift}
            setLoggingShift={setLoggingShift}
            setManagingData={setManagingData}
          />
        }
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

// These branches are the visible add/edit/import states of one screen header;
// splitting the two ternaries into helper functions only hides the UI flow.
// fallow-ignore-next-line complexity -- Native device checks cover these visible header states.
function LogHeader({
  jobs,
  allJobs,
  shifts,
  editingShift,
  addingJob,
  loggingShift,
  managingData,
  refresh,
  setAddingJob,
  setEditingShift,
  setLoggingShift,
  setManagingData,
}: {
  jobs: Job[];
  allJobs: Job[];
  shifts: Shift[];
  editingShift: Shift | null;
  addingJob: boolean;
  loggingShift: boolean;
  managingData: boolean;
  refresh: () => Promise<void>;
  setAddingJob: (value: boolean | ((current: boolean) => boolean)) => void;
  setEditingShift: (shift: Shift | null) => void;
  setLoggingShift: (value: boolean) => void;
  setManagingData: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const editingJob = editingShift
    ? allJobs.find((job) => job.id === editingShift.job_id)
    : undefined;
  const formJobs = editingJob && !jobs.some((job) => job.id === editingJob.id)
    ? [...jobs, editingJob]
    : jobs;

  // Editing opens the form whether or not the Log a shift button was used, so
  // tapping a row still lands straight in the fields for that shift.
  const formOpen = loggingShift || editingShift !== null;

  function handleRemoveJob(job: Job) {
    const shiftCount = shifts.filter((shift) => shift.job_id === job.id).length;
    const historyText = shiftCount === 0
      ? 'No shifts are attached to it.'
      : `${shiftCount} ${shiftCount === 1 ? 'shift' : 'shifts'} and their trend history will stay.`;

    Alert.alert(
      `Remove ${job.name}?`,
      `You won't be able to log or import new shifts for this job. ${historyText}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove job',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveJob(job.id);
              if (editingShift?.job_id === job.id) setEditingShift(null);
              await refresh();
            } catch (cause) {
              console.error('Could not remove the job.', cause);
              Alert.alert('Job not removed', 'Nothing changed. Try again.');
            }
          },
        },
      ]
    );
  }

  return (
    <>
      {/* A new key remounts the prop-seeded form when edit targets change,
          so it cannot retain the previous shift's fields or an archived job. */}
      {jobs.length === 0 ? (
        <CreateJobForm
          onJobCreated={() => {
            setAddingJob(false);
            void refresh();
          }}
        />
      ) : formOpen ? (
        <LogShiftForm
          key={`${editingShift?.id ?? 'new'}:${formJobs.map((job) => job.id).join(':')}`}
          jobs={formJobs}
          editingShift={editingShift}
          onShiftSaved={() => {
            setEditingShift(null);
            setLoggingShift(false);
            void refresh();
          }}
          onCancelEdit={() => {
            setEditingShift(null);
            setLoggingShift(false);
          }}
        />
      ) : (
        // Tapping a shift row sets editingShift, which opens the form above on
        // its own. This button only covers the new-entry case.
        <Pressable
          accessibilityRole="button"
          style={styles.logShiftButton}
          onPress={() => setLoggingShift(true)}
        >
          <Text style={styles.logShiftButtonText}>Log a shift</Text>
        </Pressable>
      )}
      <ShiftTotals shifts={shifts} />

      {jobs.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: managingData }}
            style={styles.manageDataButton}
            onPress={() => setManagingData((current) => !current)}
          >
            <Text style={styles.manageDataButtonText}>
              {managingData ? 'Hide data tools' : 'Manage data'}
            </Text>
          </Pressable>
          {/* Jobs and CSV import are both occasional. Behind one toggle they
              cost a single row instead of standing between the totals and the
              history every time the tab opens. */}
          {managingData ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: addingJob }}
                style={styles.manageJobsButton}
                onPress={() => setAddingJob((current) => !current)}
              >
                <Text style={styles.manageJobsButtonText}>
                  {addingJob ? 'Close job manager' : 'Add or remove jobs'}
                </Text>
              </Pressable>
              {addingJob ? (
                <View style={styles.jobManager}>
                  <CreateJobForm
                    onJobCreated={() => {
                      setAddingJob(false);
                      void refresh();
                    }}
                  />
                  <Text style={styles.jobManagerTitle}>Current jobs</Text>
                  {jobs.map((job) => (
                    <View key={job.id} style={styles.jobRow}>
                      <View style={styles.jobText}>
                        <Text style={styles.jobName}>{job.name}</Text>
                        <Text style={styles.jobRate}>
                          {formatCents(job.hourly_rate_cents)}/hr
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${job.name}`}
                        hitSlop={8}
                        style={styles.removeJobButton}
                        onPress={() => handleRemoveJob(job)}
                      >
                        <Text style={styles.removeJobText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              <ImportCsvForm
                key={jobs.map((job) => job.id).join(':')}
                jobs={jobs}
                existingShifts={shifts}
                onImported={refresh}
              />
            </>
          ) : null}
        </>
      ) : null}
      <Text style={styles.historyTitle}>Logged shifts</Text>
    </>
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
  // The one filled button on the screen. Logging a shift is the reason the tab
  // exists, so it should be the thing the eye lands on when the form is closed.
  logShiftButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    margin: 16,
    marginBottom: 0,
  },
  logShiftButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  manageDataButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  manageDataButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  historyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    padding: 16,
  },
  manageJobsButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    margin: 16,
    marginBottom: 0,
    paddingHorizontal: 16,
  },
  manageJobsButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  jobManager: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 8,
  },
  jobManagerTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  jobRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  jobText: { flex: 1 },
  jobName: { color: '#111827', fontWeight: '600' },
  jobRate: { color: '#6b7280', marginTop: 2 },
  removeJobButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 16 },
  removeJobText: { color: '#dc2626', fontWeight: '600' },
});
