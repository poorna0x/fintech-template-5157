import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { setModuleJobsListCache, setModuleOngoingJobsSnapshot } from '@/lib/adminDashboardCache';
import {
  completedByDbMatchValues,
  normalizeLeadType,
  serviceSubTypeDbMatchValues,
} from '@/lib/adminUtils';
import { CUSTOMER_ADMIN_LIST_PATCH_COLUMNS, db, supabase } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export type LoadFilteredJobsOptions = {
  silent?: boolean;
  cacheOnly?: boolean;
};

export type LoadFilteredJobsDeps = {
  pageSize: number;
  deniedDateFilter: string;
  completedDateFilter: string;
  completedDatePreset: 'day' | 'week' | 'month' | 'custom';
  completedRangeStartDate: string;
  completedRangeEndDate: string;
  completedLeadTypeFilter: string;
  completedServiceSubTypeFilter: string;
  completedByFilter: string;
  loadJobsRequestRef: MutableRefObject<number>;
  jobsListCacheRef: MutableRefObject<Map<string, Job[]>>;
  ongoingJobsSnapshotRef: MutableRefObject<Job[]>;
  techniciansRef: MutableRefObject<Technician[]>;
  getJobsListCacheKey: (filter: 'COMPLETED' | 'RESCHEDULED', page: number) => string;
  setJobs: Dispatch<SetStateAction<Job[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setTabCachesStale: Dispatch<SetStateAction<boolean>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
};

function completedListServerFilters(deps: LoadFilteredJobsDeps) {
  const filters: {
    completedByIn?: string[];
    serviceSubTypeIn?: string[];
    leadRequirementsContainVariants?: string[];
  } = {};
  if (deps.completedServiceSubTypeFilter !== 'all') {
    const values = serviceSubTypeDbMatchValues(deps.completedServiceSubTypeFilter);
    if (values.length) filters.serviceSubTypeIn = values;
  }
  if (deps.completedLeadTypeFilter !== 'all') {
    const canon = normalizeLeadType(deps.completedLeadTypeFilter);
    if (canon) filters.leadRequirementsContainVariants = [canon];
  }
  if (deps.completedByFilter !== 'all') {
    const values = completedByDbMatchValues(
      deps.completedByFilter,
      deps.techniciansRef.current
    );
    if (values.length) filters.completedByIn = values;
  }
  return filters;
}

export async function loadFilteredJobsForAdmin(
  filter: AdminStatusFilter,
  page: number,
  opts: LoadFilteredJobsOptions | undefined,
  deps: LoadFilteredJobsDeps
): Promise<void> {
  const silent = opts?.silent === true;
  const cacheOnly = opts?.cacheOnly === true;
  const requestId = silent
    ? deps.loadJobsRequestRef.current
    : ++deps.loadJobsRequestRef.current;

  const commitJobs = (data: Job[]) => {
    if (!cacheOnly) {
      deps.setJobs(data);
      deps.setTabCachesStale(false);
    } else if (filter === 'COMPLETED') {
      deps.setTabCachesStale(false);
    }
    if (filter === 'ONGOING') {
      deps.ongoingJobsSnapshotRef.current = data;
      setModuleOngoingJobsSnapshot(data);
    } else if (filter === 'COMPLETED' || filter === 'RESCHEDULED') {
      const cacheKey = deps.getJobsListCacheKey(filter, page);
      deps.jobsListCacheRef.current.set(cacheKey, data);
      setModuleJobsListCache(cacheKey, data);
    }
  };

  try {
    if (!silent) {
      deps.setLoading(true);
    }

    if (filter === 'ALL') {
      const { data, error } = await db.jobs.getOngoing();
      if (requestId !== deps.loadJobsRequestRef.current) return;
      if (error) {
        console.warn('[admin] kept the job list because the refresh failed', error);
      } else if (!cacheOnly) {
        deps.setJobs(data || []);
      }
    } else if (filter === 'ONGOING') {
      const { data, error } = await db.jobs.getOngoing();
      if (requestId !== deps.loadJobsRequestRef.current) return;
      if (error) {
        console.warn('[admin] kept the ongoing list because the refresh failed', error);
      } else {
        commitJobs(data || []);
        if (!cacheOnly) {
          deps.setTotalCount(data?.length || 0);
          deps.setTotalPages(1);
        }
      }
    } else if (filter === 'COMPLETED' || filter === 'CANCELLED') {
      const statuses = filter === 'COMPLETED' ? ['COMPLETED'] : ['DENIED', 'CANCELLED'];
      let dateFilter: string | { startDate: string; endDate: string } | undefined;
      if (filter === 'COMPLETED') {
        if (deps.completedDatePreset === 'day') {
          dateFilter = deps.completedDateFilter;
        } else {
          const start =
            deps.completedRangeStartDate <= deps.completedRangeEndDate
              ? deps.completedRangeStartDate
              : deps.completedRangeEndDate;
          const end =
            deps.completedRangeStartDate <= deps.completedRangeEndDate
              ? deps.completedRangeEndDate
              : deps.completedRangeStartDate;
          dateFilter = { startDate: start, endDate: end };
        }
      } else if (filter === 'CANCELLED') {
        dateFilter = deps.deniedDateFilter;
      }

      let data: any[] = [];
      let error: any = null;
      let count = 0;
      let pages = 0;

      const listFilters =
        filter === 'COMPLETED' ? completedListServerFilters(deps) : undefined;

      let slimResult: Awaited<ReturnType<typeof db.jobs.getByStatusPaginatedSlim>>;
      slimResult = await db.jobs.getByStatusPaginatedSlim(
        statuses,
        page,
        deps.pageSize,
        dateFilter,
        listFilters
      );
      data = slimResult.data || [];
      error = slimResult.error;
      count = slimResult.count || 0;
      pages = slimResult.totalPages || 0;

      if (error) {
        const fallback = await db.jobs.getByStatusPaginated(
          statuses,
          page,
          deps.pageSize,
          dateFilter,
          listFilters
        );
        data = fallback.data || [];
        error = fallback.error;
        count = fallback.count || 0;
        pages = fallback.totalPages || 0;
      }
      if (requestId !== deps.loadJobsRequestRef.current) return;
      if (error) {
        console.warn('[admin] kept the job list because the refresh failed', error);
      } else {
        let finalData = data || [];
        if ((filter === 'COMPLETED' || filter === 'CANCELLED') && finalData.length > 0) {
          const missingIds = [
            ...new Set(
              finalData
                .filter((j: any) => j.customer_id && !(j as any).customer)
                .map((j: any) => j.customer_id as string)
            ),
          ];
          if (missingIds.length > 0) {
            const { data: custRows } = await supabase
              .from('customers')
              .select(CUSTOMER_ADMIN_LIST_PATCH_COLUMNS)
              .in('id', missingIds);
            const byId = new Map((custRows || []).map((row: any) => [row.id, row]));
            finalData = finalData.map((j: any) =>
              (j as any).customer || !j.customer_id
                ? j
                : { ...j, customer: byId.get(j.customer_id) ?? null }
            );
          }
        }

        commitJobs(finalData);
        if (!cacheOnly) {
          deps.setTotalCount(count || 0);
          deps.setTotalPages(pages || 0);
        }
      }
    } else if (filter === 'RESCHEDULED') {
      let data: any[] = [];
      let error: any = null;
      let count = 0;
      let pages = 0;
      const slimFu = await db.jobs.getByStatusPaginatedSlim(
        ['FOLLOW_UP', 'RESCHEDULED'],
        page,
        deps.pageSize,
        undefined,
        { includePhotoFields: true }
      );
      data = slimFu.data || [];
      error = slimFu.error;
      count = slimFu.count || 0;
      pages = slimFu.totalPages || 0;
      if (error) {
        const fallback = await db.jobs.getByStatusPaginated(
          ['FOLLOW_UP', 'RESCHEDULED'],
          page,
          deps.pageSize
        );
        data = fallback.data || [];
        error = fallback.error;
        count = fallback.count || 0;
        pages = fallback.totalPages || 0;
      }
      if (requestId !== deps.loadJobsRequestRef.current) return;
      if (error) {
        console.warn('[admin] kept the follow-up list because the refresh failed', error);
      } else {
        commitJobs(data || []);
        if (!cacheOnly) {
          deps.setTotalCount(count || 0);
          deps.setTotalPages(pages || 0);
        }
      }
    }
  } catch (error) {
    if (requestId === deps.loadJobsRequestRef.current && !cacheOnly) {
      console.warn('[admin] kept the job list because the refresh failed', error);
    }
  } finally {
    if (!silent && requestId === deps.loadJobsRequestRef.current) {
      deps.setLoading(false);
    }
  }
}
