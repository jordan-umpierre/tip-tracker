import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { loadShiftScreenData } from '../data/shiftScreen';
import type { Job } from '../data/jobs';
import type { Shift } from '../data/shifts';

export function useShiftScreenData(screenName: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await loadShiftScreenData();
      setJobs(data.jobs);
      setAllJobs(data.allJobs);
      setShifts(data.shifts);
    } catch (cause) {
      console.error(`Could not load ${screenName}.`, cause);
      setError(screenName === 'Settings' ? 'Settings could not be loaded.' : 'Your jobs and shifts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [screenName]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { loading, error, jobs, allJobs, shifts, refresh };
}
