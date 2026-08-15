import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminDashboardSnapshot, AdminStatusFilter } from '@/lib/adminDashboardCache';
import {
  setModuleOngoingJobsSnapshot,
  writeAdminDashboardCache,
} from '@/lib/adminDashboardCache';
import { transformTechnicianData } from '@/lib/adminDashboardTransforms';
import { ensureAdminSupabaseSession } from '@/lib/auth';
import type { LoadFilteredJobsOptions } from '@/lib/adminLoadFilteredJobs';
import { fetchCustomerIdsWithCompletedJobsMap, db, supabase } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export type LoadFilteredJobsFn = (
  filter: AdminStatusFilter,
  page?: number,
  opts?: LoadFilteredJobsOptions
) => Promise<void>;

export function applyAdminDashboardSnapshot(
  snap: AdminDashboardSnapshot,
  handlers: {
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setTotalCount: Dispatch<SetStateAction<number>>;
    setTotalPages: Dispatch<SetStateAction<number>>;
    setTechnicians: Dispatch<SetStateAction<Technician[]>>;
    setJobCounts: Dispatch<SetStateAction<any>>;
    ongoingJobsSnapshotRef: MutableRefObject<Job[]>;
    techniciansRef: MutableRefObject<Technician[]>;
    countOnlyNonAmcFollowUps: boolean;
  }
) {
  const jobList = (snap.jobs as Job[]) ?? [];
  handlers.setJobs(jobList);
  handlers.ongoingJobsSnapshotRef.current = jobList;
  setModuleOngoingJobsSnapshot(jobList);
  handlers.setTotalCount(jobList.length);
  handlers.setTotalPages(1);
  const transformed = (snap.technicianRows as any[]).map(transformTechnicianData);
  handlers.techniciansRef.current = transformed;
  handlers.setTechnicians(transformed);
  // Counts cached under the other follow-up preference would flash a wrong
  // Followup number until the fresh fetch lands.
  if ((snap.countsExcludeAmcFollowUps === true) === handlers.countOnlyNonAmcFollowUps) {
    handlers.setJobCounts(snap.jobCounts);
  }
}

export async function loadAdminDashboardSecondary(handlers: {
  setCustomerAMCStatus: Dispatch<SetStateAction<Record<string, boolean>>>;
  setCustomerPriorServiceStatus: Dispatch<SetStateAction<Record<string, boolean>>>;
  setTechniciansForReports: Dispatch<SetStateAction<Technician[]>>;
  setAllFollowUpJobs: Dispatch<SetStateAction<Job[]>>;
  loadBrandsAndModels: () => void | Promise<void>;
  countOnlyNonAmcFollowUps: boolean;
}) {
  try {
    const [techniciansAllResult, amcContractsResult, priorCompletedMap] =
      await Promise.all([
        db.technicians.getList(500, { activeRosterOnly: false }),
        supabase.from('amc_contracts').select('customer_id, status').eq('status', 'ACTIVE'),
        fetchCustomerIdsWithCompletedJobsMap(),
      ]);

    const amcStatusMap: Record<string, boolean> = {};
    if (amcContractsResult.data) {
      amcContractsResult.data.forEach((amc: any) => {
        amcStatusMap[amc.customer_id] = true;
      });
    }
    handlers.setCustomerAMCStatus(amcStatusMap);
    handlers.setCustomerPriorServiceStatus((prev) => ({
      ...prev,
      ...priorCompletedMap,
    }));

    if (techniciansAllResult?.data) {
      handlers.setTechniciansForReports(
        techniciansAllResult.data.map(transformTechnicianData)
      );
    }

    void handlers.loadBrandsAndModels();
    void db.jobs
      .getFollowUpForGlow({ excludeAmc: handlers.countOnlyNonAmcFollowUps })
      .then(({ data }) => {
        if (data) handlers.setAllFollowUpJobs(data as Job[]);
      })
      .catch(() => handlers.setAllFollowUpJobs([]));
  } catch (e) {
    console.warn('[AdminDashboard] Secondary load failed:', e);
  }
}

export async function loadAdminDashboardData(
  options: {
    silent?: boolean;
    skipOngoingFetch?: boolean;
    skipTechniciansFetch?: boolean;
  } | undefined,
  ctx: {
    statusFilter: AdminStatusFilter;
    currentPage: number;
    scheduleAmcJobCreation: () => void;
    scheduleFollowUpPromotion: () => void;
    loadFilteredJobs: LoadFilteredJobsFn;
    loadDashboardSecondary: () => void;
    techniciansRef: MutableRefObject<Technician[]>;
    ongoingJobsSnapshotRef: MutableRefObject<Job[]>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setJobCounts: Dispatch<SetStateAction<any>>;
    setTechnicians: Dispatch<SetStateAction<Technician[]>>;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setTotalCount: Dispatch<SetStateAction<number>>;
    setTotalPages: Dispatch<SetStateAction<number>>;
    countOnlyNonAmcFollowUps: boolean;
  }
) {
  const silent = options?.silent === true;
  const skipOngoingFetch = options?.skipOngoingFetch === true;
  const skipTechniciansFetch = options?.skipTechniciansFetch === true;

  try {
    if (!silent) {
      ctx.setLoading(true);
    }

    if (!silent) {
      const sessionReady = await ensureAdminSupabaseSession();
      if (!sessionReady) {
        console.warn('[AdminDashboard] Skipping load — admin Supabase session not ready yet');
        return;
      }
    }

    ctx.scheduleAmcJobCreation();
    ctx.scheduleFollowUpPromotion();

    const [techniciansResult, jobCountsResult, ongoingResult] = await Promise.all([
      skipTechniciansFetch
        ? Promise.resolve({ data: null as Technician[] | null, error: null })
        : db.technicians.getAllForDashboard(100),
      db.jobs.getCounts({
        countOnlyNonAmcFollowUps: ctx.countOnlyNonAmcFollowUps,
      }),
      skipOngoingFetch && ctx.statusFilter === 'ONGOING'
        ? Promise.resolve({ data: null as Job[] | null, error: null })
        : ctx.statusFilter === 'ONGOING'
          ? db.jobs.getOngoing(100)
          : Promise.resolve({ data: null, error: null }),
    ]);

    if (jobCountsResult.data) {
      ctx.setJobCounts(jobCountsResult.data);
    }

    if (techniciansResult.data) {
      const transformedTechnicians = techniciansResult.data.map(transformTechnicianData);
      ctx.techniciansRef.current = transformedTechnicians;
      ctx.setTechnicians(transformedTechnicians);
    } else if (techniciansResult.error) {
      console.error('Failed to load technicians:', techniciansResult.error);
      ctx.techniciansRef.current = [];
      ctx.setTechnicians([]);
    }

    if (!skipOngoingFetch && ctx.statusFilter === 'ONGOING' && ongoingResult) {
      if (ongoingResult.error) {
        ctx.setJobs([]);
      } else {
        const list = ongoingResult.data || [];
        ctx.setJobs(list);
        ctx.ongoingJobsSnapshotRef.current = list;
        setModuleOngoingJobsSnapshot(list);
        ctx.setTotalCount(list.length);
        ctx.setTotalPages(1);
      }
    } else if (!skipOngoingFetch && ctx.statusFilter !== 'ONGOING') {
      await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage, { silent: true });
    }

    const jobsForCache =
      skipOngoingFetch && ctx.statusFilter === 'ONGOING'
        ? undefined
        : ctx.statusFilter === 'ONGOING'
          ? ongoingResult?.data ?? []
          : undefined;

    if (jobsForCache && techniciansResult.data) {
      writeAdminDashboardCache({
        savedAt: Date.now(),
        jobs: jobsForCache,
        technicianRows: techniciansResult.data,
        jobCounts: jobCountsResult.data ?? {
          ongoing: 0,
          followup: 0,
          denied: 0,
          completed: 0,
        },
        countsExcludeAmcFollowUps: ctx.countOnlyNonAmcFollowUps,
      });
    }

    ctx.loadDashboardSecondary();
  } catch (error) {
    if (!silent) {
      toast.error(
        `Failed to load dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } finally {
    if (!silent) {
      ctx.setLoading(false);
    }
  }
}
