import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackupRestore from '../components/BackupRestore';
import AccountPanel from '../components/AccountPanel';
import CreateJobForm from '../components/CreateJobForm';
import ExportCsvButton from '../components/ExportCsvButton';
import FederalWithholdingForm from '../components/FederalWithholdingForm';
import ImportCsvForm from '../components/ImportCsvForm';
import OvertimeSettingsForm from '../components/OvertimeSettingsForm';
import ShiftList from '../components/ShiftList';
import { getDb } from '../data/db';
import { archiveJob, Job, listActiveJobs, listJobs } from '../data/jobs';
import { listShifts, Shift } from '../data/shifts';
import { formatCents } from '../lib/format';
import { calculateEstimatedGrossByShift, overtimeScope } from '../lib/overtime';

// fallow-ignore-next-line complexity -- Native loading and estimate states require device checks.
export default function LogScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [addingJob, setAddingJob] = useState(false);
  // The data tools start closed. This screen is a history to read, and opening
  // it onto a pile of controls made a glance at last week's shifts feel like
  // being handed paperwork.
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

  const estimatedJobIds = useMemo(
    () => new Set(allJobs.filter((job) => job.overtime_enabled === 1).map((job) => job.id)),
    [allJobs]
  );
  const grossByShift = useMemo(
    () => calculateEstimatedGrossByShift(shifts, allJobs),
    [allJobs, shifts]
  );
  const estimateScope = useMemo(
    () => overtimeScope(shifts, allJobs, null),
    [allJobs, shifts]
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
      {/* Keep history visible after the last active job is removed. The form
          and the rows share this one virtualized scroller. */}
      <ShiftList
        shifts={shifts}
        jobs={allJobs}
        grossByShift={grossByShift}
        estimatedJobIds={estimatedJobIds}
        onShiftDeleted={refresh}
        // Editing is the details step on its own, reached directly. There is no
        // date or job step to walk: the user came here to correct one shift.
        onShiftPress={(shift) =>
          router.push({ pathname: '/log-shift/details', params: { shiftId: shift.id } })
        }
        header={
          <View>
            <Text style={styles.historyTitle}>Logged shifts</Text>
            {estimateScope.estimated && shifts.length > 0 ? (
              <Text style={styles.estimateNote}>
                Est. gross includes configured overtime.
                {estimateScope.hasUntimedEstimate
                  ? ' Shifts without times count wholly on their logged date.'
                  : ''}
              </Text>
            ) : null}
          </View>
        }
        footer={
          <LogControls
            jobs={jobs}
            allJobs={allJobs}
            shifts={shifts}
            addingJob={addingJob}
            managingData={managingData}
            refresh={refresh}
            setAddingJob={setAddingJob}
            setManagingData={setManagingData}
          />
        }
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

// These branches are the visible add/edit/import states of the screen's
// controls; splitting the two ternaries into helper functions only hides the
// UI flow.
//
// They render below the rows rather than above them so that on a cold open --
// every group collapsed, per D15 -- Log a shift sits low on the screen where a
// thumb reaches it, instead of at the top by the status bar.
// fallow-ignore-next-line complexity -- Native device checks cover these visible control states.
function LogControls({
  jobs,
  allJobs,
  shifts,
  addingJob,
  managingData,
  refresh,
  setAddingJob,
  setManagingData,
}: {
  jobs: Job[];
  // Active jobs drive what can be logged; the full list is only here because
  // export has to name the job on a shift whose job was since removed.
  allJobs: Job[];
  shifts: Shift[];
  addingJob: boolean;
  managingData: boolean;
  refresh: () => Promise<void>;
  setAddingJob: (value: boolean | ((current: boolean) => boolean)) => void;
  setManagingData: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  // Which screen the flow opens on. Asking "which job?" of someone who has one
  // job is a tap whose answer is already known, so that step is skipped and the
  // job rides along in the params instead.
  function startLoggingShift() {
    if (jobs.length === 1) {
      router.push({ pathname: '/log-shift/date', params: { jobId: jobs[0].id } });
      return;
    }
    router.push('/log-shift/job');
  }

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
      {/* With no job there is nothing to log against, so the only thing this
          screen can usefully offer is making one. */}
      {jobs.length === 0 ? (
        <CreateJobForm
          onJobCreated={() => {
            setAddingJob(false);
            void refresh();
          }}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          style={styles.logShiftButton}
          onPress={startLoggingShift}
        >
          <Text style={styles.logShiftButtonText}>Log a shift</Text>
        </Pressable>
      )}

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
      {/* Restore has to remain reachable when there are no jobs, because an
          empty database is the only one D19 allows it to write into. */}
      {managingData ? (
        <>
          <AccountPanel />
          {jobs.length > 0 ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: addingJob }}
                style={styles.manageJobsButton}
                onPress={() => setAddingJob((current) => !current)}
              >
                <Text style={styles.manageJobsButtonText}>
                  {addingJob ? 'Close job manager' : 'Manage jobs'}
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
                    <View key={`${job.id}:${job.updated_at}`}>
                      <View style={styles.jobRow}>
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
                      <OvertimeSettingsForm job={job} onSaved={refresh} />
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
              {/* Export takes every shift regardless of job, so it gets the
                  full job list rather than the active one -- a shift belonging
                  to a removed job still needs its name in the file. */}
              <ExportCsvButton shifts={shifts} jobs={allJobs} />
              <FederalWithholdingForm jobs={jobs} />
            </>
          ) : null}
          <BackupRestore onRestored={refresh} />
        </>
      ) : null}
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
    alignItems: 'center',
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
  estimateNote: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
