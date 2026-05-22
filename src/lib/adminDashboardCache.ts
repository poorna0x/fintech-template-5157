/** Fast admin boot: prefetch + session cache for ongoing jobs / roster / counts. */

const STORAGE_KEY = 'hro_admin_dashboard_v1';
const TTL_MS = 5 * 60 * 1000;

export type AdminJobCounts = {
  ongoing: number;
  followup: number;
  denied: number;
  completed: number;
};

export type AdminDashboardSnapshot = {
  savedAt: number;
  jobs: unknown[];
  technicianRows: unknown[];
  jobCounts: AdminJobCounts;
};

let inflightPrefetch: Promise<AdminDashboardSnapshot | null> | null = null;

export function readAdminDashboardCache(): AdminDashboardSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminDashboardSnapshot;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAdminDashboardCache(snapshot: AdminDashboardSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

export function clearAdminDashboardCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  inflightPrefetch = null;
}

/**
 * Drop every stale-able cache the admin dashboard reads from before a manual refresh.
 * Counts (25s TTL) and the returning-customer flag map (120s TTL) survive otherwise,
 * so clicking the refresh button could show data older than the most recent mutation.
 */
export async function invalidateAdminDashboardCaches(): Promise<void> {
  clearAdminDashboardCache();
  try {
    const { cacheInvalidate } = await import('./supabaseQueryCache');
    cacheInvalidate('job_counts_v1');
    cacheInvalidate('completed_customers_map_v1');
  } catch {
    /* ignore */
  }
}

async function fetchCriticalSnapshot(): Promise<AdminDashboardSnapshot | null> {
  try {
    const { ensureAdminSupabaseSession } = await import('@/lib/auth');
    if (!(await ensureAdminSupabaseSession(2_000))) return null;

    const { db } = await import('@/lib/supabase');
    const [jobsResult, techniciansResult, countsResult] = await Promise.all([
      db.jobs.getOngoing(100),
      db.technicians.getAllForDashboard(100),
      db.jobs.getCounts(),
    ]);

    if (jobsResult.error && techniciansResult.error) return null;

    const jobCounts = countsResult.data ?? {
      ongoing: 0,
      followup: 0,
      denied: 0,
      completed: 0,
    };

    return {
      savedAt: Date.now(),
      jobs: jobsResult.data ?? [],
      technicianRows: techniciansResult.data ?? [],
      jobCounts,
    };
  } catch {
    return null;
  }
}

/** Start while AdminPortal waits for dashboard chunk (parallel with auth). */
export function startAdminDashboardPrefetch(): Promise<AdminDashboardSnapshot | null> {
  if (!inflightPrefetch) {
    inflightPrefetch = fetchCriticalSnapshot();
  }
  return inflightPrefetch;
}

export async function consumeAdminDashboardPrefetch(): Promise<AdminDashboardSnapshot | null> {
  const cached = readAdminDashboardCache();
  if (cached) return cached;
  return startAdminDashboardPrefetch();
}
