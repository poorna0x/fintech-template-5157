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

/** Re-check often enough that a follow-up set after first open still promotes (Admin APK keeps SPA state). */
const FOLLOW_UP_PROMOTE_THROTTLE_MS = 45_000;

export function scheduleAdminFollowUpPromotion(ctx: {
  followUpPromoteAtRef: MutableRefObject<number>;
  statusFilter: AdminStatusFilter;
  currentPage: number;
  loadFilteredJobs: LoadFilteredJobsFn;
  setAllFollowUpJobs: Dispatch<SetStateAction<Job[]>>;
}) {
  const now = Date.now();
  if (now - ctx.followUpPromoteAtRef.current < FOLLOW_UP_PROMOTE_THROTTLE_MS) return;
  ctx.followUpPromoteAtRef.current = now;

  const today = getTodayLocalDate();

  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      if (!session) {
        ctx.followUpPromoteAtRef.current = 0;
        return;
      }
      db.jobs.promoteDueFollowUpsToOngoing(today).then((result) => {
        if (result.error) {
          console.error('Error promoting due follow-up jobs:', result.error);
          ctx.followUpPromoteAtRef.current = 0;
          return;
        }
        if (result.failed && result.failed > 0) {
          console.error('Some follow-up promotions failed:', result.failed, result.errors);
          // Allow retry soon when updates failed (e.g. transient RLS/session).
          ctx.followUpPromoteAtRef.current = 0;
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
      ctx.followUpPromoteAtRef.current = 0;
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
