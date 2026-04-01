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
        // Prefer slim pagination (low PostgREST egress); fallback to legacy if needed
        const statuses = filter === 'COMPLETED' ? ['COMPLETED'] : ['DENIED', 'CANCELLED'];
        const dateFilter = filter === 'COMPLETED' ? completedDateFilter : deniedDateFilter;
        let data: Job[] = [];
        let error: unknown = null;
        let count = 0;
        let pages = 0;
        const slim = await db.jobs.getByStatusPaginatedSlim(statuses, page, pageSize, dateFilter);
        data = (slim.data || []) as Job[];
        error = slim.error;
        count = slim.count || 0;
        pages = slim.totalPages || 0;
        if (error) {
          const fallback = await db.jobs.getByStatusPaginated(statuses, page, pageSize, dateFilter);
          data = (fallback.data || []) as Job[];
          error = fallback.error;
          count = fallback.count || 0;
          pages = fallback.totalPages || 0;
        }
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(count || 0);
          setTotalPages(pages || 0);
        }
      } else if (filter === 'RESCHEDULED') {
        let data: Job[] = [];
        let error: unknown = null;
        let count = 0;
        let pages = 0;
        const slimFu = await db.jobs.getByStatusPaginatedSlim(['FOLLOW_UP', 'RESCHEDULED'], page, pageSize, undefined, {
          includePhotoFields: true,
        });
        data = (slimFu.data || []) as Job[];
        error = slimFu.error;
        count = slimFu.count || 0;
        pages = slimFu.totalPages || 0;
        if (error) {
          const fallback = await db.jobs.getByStatusPaginated(['FOLLOW_UP', 'RESCHEDULED'], page, pageSize);
          data = (fallback.data || []) as Job[];
          error = fallback.error;
          count = fallback.count || 0;
          pages = fallback.totalPages || 0;
        }
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

