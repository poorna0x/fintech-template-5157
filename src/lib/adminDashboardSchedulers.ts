import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import {
  clearModuleJobsListCache,
  invalidateAdminDashboardCaches,
} from '@/lib/adminDashboardCache';
import { getTodayLocalDate } from '@/lib/adminDashboardDateHelpers';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { db, supabase } from '@/lib/supabase';
import type { Job } from '@/types';

export function scheduleAdminFollowUpPromotion(ctx: {
  followUpPromoteDayRef: MutableRefObject<string | null>;
  statusFilter: AdminStatusFilter;
  currentPage: number;
  loadFilteredJobs: LoadFilteredJobsFn;
  setAllFollowUpJobs: Dispatch<SetStateAction<Job[]>>;
}) {
  const today = getTodayLocalDate();
  if (ctx.followUpPromoteDayRef.current === today) return;
  ctx.followUpPromoteDayRef.current = today;

  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      if (!session) {
        ctx.followUpPromoteDayRef.current = null;
        return;
      }
      db.jobs.promoteDueFollowUpsToOngoing(today).then((result) => {
        if (result.error) {
          console.error('Error promoting due follow-up jobs:', result.error);
          ctx.followUpPromoteDayRef.current = null;
          return;
        }
        if (result.promoted > 0) {
          toast.success(
            `${result.promoted} follow-up job${result.promoted > 1 ? 's' : ''} moved to ongoing`
          );
          invalidateAdminDashboardCaches();
          clearModuleJobsListCache();
          ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage, { silent: true });
          db.jobs
            .getFollowUpForGlow()
            .then(({ data }) => {
              if (data) ctx.setAllFollowUpJobs(data as Job[]);
            })
            .catch(() => {});
        }
      });
    })
    .catch(() => {
      ctx.followUpPromoteDayRef.current = null;
    });
}

export function scheduleAdminAmcJobCreation(ctx: {
  amcAutoCreateAttemptedRef: MutableRefObject<boolean>;
  statusFilter: AdminStatusFilter;
  currentPage: number;
  loadFilteredJobs: LoadFilteredJobsFn;
}) {
  if (ctx.amcAutoCreateAttemptedRef.current) return;
  ctx.amcAutoCreateAttemptedRef.current = true;

  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      if (!session) {
        ctx.amcAutoCreateAttemptedRef.current = false;
        return;
      }
      db.amcContracts.createAMCServiceJobs().then((result) => {
        if (result.error) {
          console.error('Error creating AMC service jobs:', result.error);
          ctx.amcAutoCreateAttemptedRef.current = false;
        } else if (result.created > 0) {
          toast.success(
            `Created ${result.created} AMC service job${result.created > 1 ? 's' : ''} automatically`
          );
          ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage);
        }
      });
    })
    .catch(() => {
      ctx.amcAutoCreateAttemptedRef.current = false;
    });
}
