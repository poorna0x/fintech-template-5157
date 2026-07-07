import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminDashboardSnapshot, AdminStatusFilter } from '@/lib/adminDashboardCache';
import {
  consumeAdminDashboardPrefetch,
  getModuleDashboardSessionReady,
  readAdminDashboardCache,
  setModuleDashboardSessionReady,
} from '@/lib/adminDashboardCache';
import { ensureAdminSupabaseSession } from '@/lib/auth';

export type AdminDashboardLoadOptions = {
  silent?: boolean;
  skipOngoingFetch?: boolean;
  skipTechniciansFetch?: boolean;
};

export async function runAdminDashboardSessionBootstrap(ctx: {
  dashboardLoadedWithSessionRef: MutableRefObject<boolean>;
  statusFilter: AdminStatusFilter;
  applyAdminSnapshot: (snap: AdminDashboardSnapshot) => void;
  loadDashboardDataRef: MutableRefObject<
    (options?: AdminDashboardLoadOptions) => void | Promise<void>
  >;
  setIsInitialLoad: Dispatch<SetStateAction<boolean>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
  if (ctx.dashboardLoadedWithSessionRef.current) return;

  if (getModuleDashboardSessionReady()) {
    const cached = readAdminDashboardCache();
    if (cached) {
      ctx.applyAdminSnapshot(cached);
    }
    ctx.setIsInitialLoad(false);
    ctx.setLoading(false);
    ctx.dashboardLoadedWithSessionRef.current = true;
    try {
      await ctx.loadDashboardDataRef.current({
        silent: true,
        skipOngoingFetch: ctx.statusFilter === 'ONGOING',
        skipTechniciansFetch: Boolean(cached?.technicianRows?.length),
      });
    } catch (error) {
      console.error('[AdminDashboard] Resume load failed:', error);
    }
    return;
  }

  let showedInstantData = false;
  let appliedFreshPrefetch = false;
  const cached = readAdminDashboardCache();
  if (cached) {
    ctx.applyAdminSnapshot(cached);
    showedInstantData = true;
    ctx.setIsInitialLoad(false);
    ctx.setLoading(false);
  } else {
    ctx.setLoading(true);
    ctx.setIsInitialLoad(true);
  }

  const sessionOk = await ensureAdminSupabaseSession(1_500);
  if (!sessionOk) {
    toast.error('Could not start your session. Please try again or refresh the page.');
    ctx.setLoading(false);
    ctx.setIsInitialLoad(false);
    return;
  }

  if (!showedInstantData) {
    const prefetched = await consumeAdminDashboardPrefetch();
    if (prefetched) {
      ctx.applyAdminSnapshot(prefetched);
      showedInstantData = true;
      appliedFreshPrefetch = true;
      ctx.setIsInitialLoad(false);
      ctx.setLoading(false);
    }
  }

  try {
    await ctx.loadDashboardDataRef.current({
      silent: true,
      skipOngoingFetch: showedInstantData && ctx.statusFilter === 'ONGOING',
      skipTechniciansFetch: appliedFreshPrefetch,
    });
    ctx.dashboardLoadedWithSessionRef.current = true;
    setModuleDashboardSessionReady(true);
  } catch (error) {
    console.error('[AdminDashboard] Initial load failed:', error);
  } finally {
    ctx.setIsInitialLoad(false);
    ctx.setLoading(false);
  }
}
