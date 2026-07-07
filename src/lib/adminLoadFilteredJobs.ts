import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { setModuleJobsListCache, setModuleOngoingJobsSnapshot } from '@/lib/adminDashboardCache';
import { completedJobMatchesDashboardClientFilters } from '@/lib/adminUtils';
import { enrichJobsWithAfterPhotosIfNeeded } from '@/lib/jobReportPhotos';
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
        if (!cacheOnly) deps.setJobs([]);
      } else if (!cacheOnly) {
        deps.setJobs(data || []);
      }
    } else if (filter === 'ONGOING') {
      const { data, error } = await db.jobs.getOngoing();
      if (requestId !== deps.loadJobsRequestRef.current) return;
      if (error) {
        if (!cacheOnly) deps.setJobs([]);
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

      const completedClientFiltersActive =
        filter === 'COMPLETED' &&
        (deps.completedLeadTypeFilter !== 'all' ||
          deps.completedServiceSubTypeFilter !== 'all' ||
          deps.completedByFilter !== 'all');

      const COMPLETED_CLIENT_FILTER_BATCH = 5000;

      let slimResult: Awaited<ReturnType<typeof db.jobs.getByStatusPaginatedSlim>>;
      if (completedClientFiltersActive) {
        slimResult = await db.jobs.getByStatusPaginatedSlim(
          statuses,
          1,
          COMPLETED_CLIENT_FILTER_BATCH,
          dateFilter
        );
      } else {
        slimResult = await db.jobs.getByStatusPaginatedSlim(
          statuses,
          page,
          deps.pageSize,
          dateFilter
        );
      }
      data = slimResult.data || [];
      error = slimResult.error;
      count = slimResult.count || 0;
      pages = slimResult.totalPages || 0;

      if (error) {
        const fallbackPage = completedClientFiltersActive ? 1 : page;
        const fallbackSize = completedClientFiltersActive
          ? COMPLETED_CLIENT_FILTER_BATCH
          : deps.pageSize;
        const fallback = await db.jobs.getByStatusPaginated(
          statuses,
          fallbackPage,
          fallbackSize,
          dateFilter
        );
        data = fallback.data || [];
        error = fallback.error;
        count = fallback.count || 0;
        pages = fallback.totalPages || 0;
      }
      if (requestId !== deps.loadJobsRequestRef.current) return;
      if (error) {
        if (!cacheOnly) deps.setJobs([]);
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

        if (completedClientFiltersActive) {
          const filterPayload = {
            leadType: deps.completedLeadTypeFilter,
            serviceSubType: deps.completedServiceSubTypeFilter,
            completedBy: deps.completedByFilter,
          };
          const filtered = finalData.filter((j: any) =>
            completedJobMatchesDashboardClientFilters(
              j,
              filterPayload,
              deps.techniciansRef.current as any
            )
          );
          const filteredCount = filtered.length;
          const filteredPages =
            filteredCount > 0 ? Math.ceil(filteredCount / deps.pageSize) : 0;
          let effectivePage = page;
          if (filteredPages > 0 && page > filteredPages) effectivePage = filteredPages;
          if (filteredPages === 0) effectivePage = 1;
          finalData = filtered.slice(
            (effectivePage - 1) * deps.pageSize,
            effectivePage * deps.pageSize
          );
          count = filteredCount;
          pages = filteredPages;
          if (effectivePage !== page && !cacheOnly) {
            deps.setCurrentPage(effectivePage);
          }
        }

        if (filter === 'COMPLETED' && finalData.length > 0) {
          finalData = await enrichJobsWithAfterPhotosIfNeeded(finalData);
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
        if (!cacheOnly) deps.setJobs([]);
      } else {
        commitJobs(data || []);
        if (!cacheOnly) {
          deps.setTotalCount(count || 0);
          deps.setTotalPages(pages || 0);
        }
      }
    }
  } catch {
    if (requestId === deps.loadJobsRequestRef.current && !cacheOnly) {
      deps.setJobs([]);
    }
  } finally {
    if (!silent && requestId === deps.loadJobsRequestRef.current) {
      deps.setLoading(false);
    }
  }
}
