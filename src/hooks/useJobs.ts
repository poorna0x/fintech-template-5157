import { useState, useCallback } from 'react';
import { db } from '@/lib/supabase';
import { Job } from '@/types';

type StatusFilter = 'ALL' | 'ONGOING' | 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';

export const useJobs = (pageSize: number = 20) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [jobCounts, setJobCounts] = useState<{ongoing: number; followup: number; denied: number; completed: number}>({
    ongoing: 0,
    followup: 0,
    denied: 0,
    completed: 0
  });
  const [deniedDateFilter, setDeniedDateFilter] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [completedDateFilter, setCompletedDateFilter] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const loadJobCounts = useCallback(async () => {
    try {
      const { data, error } = await db.jobs.getCounts();
      if (error) {
        // Silent fail
      } else if (data) {
        setJobCounts(data);
      }
    } catch (error) {
      // Silent fail
    }
  }, []);

  const loadFilteredJobs = useCallback(async (filter: StatusFilter, page: number = 1) => {
    try {
      setLoading(true);
      
      if (filter === 'ALL') {
        // For ALL, we need customers with their jobs - load ongoing jobs only for display
        const { data, error } = await db.jobs.getOngoing();
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
        }
      } else if (filter === 'ONGOING') {
        // Load all ongoing jobs (usually not too many)
        const { data, error } = await db.jobs.getOngoing();
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(data?.length || 0);
          setTotalPages(1);
        }
      } else if (filter === 'COMPLETED' || filter === 'CANCELLED') {
        // Use pagination for completed and denied jobs
        const statuses = filter === 'COMPLETED' ? ['COMPLETED'] : ['DENIED', 'CANCELLED'];
        // Pass date filter for completed or denied jobs
        const dateFilter = filter === 'COMPLETED' ? completedDateFilter : deniedDateFilter;
        const { data, error, count, totalPages: pages } = await db.jobs.getByStatusPaginated(statuses, page, pageSize, dateFilter);
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(count || 0);
          setTotalPages(pages || 0);
        }
      } else if (filter === 'RESCHEDULED') {
        // Load follow-up jobs (usually not too many)
        const { data, error, count, totalPages: pages } = await db.jobs.getByStatusPaginated(['FOLLOW_UP', 'RESCHEDULED'], page, pageSize);
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(count || 0);
          setTotalPages(pages || 0);
        }
      }
    } catch (error) {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [pageSize, deniedDateFilter, completedDateFilter]);

  return {
    jobs,
    loading,
    currentPage,
    totalPages,
    totalCount,
    jobCounts,
    deniedDateFilter,
    completedDateFilter,
    setJobs,
    setCurrentPage,
    setDeniedDateFilter,
    setCompletedDateFilter,
    loadFilteredJobs,
    loadJobCounts
  };
};

