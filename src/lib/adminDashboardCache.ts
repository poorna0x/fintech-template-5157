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

/** Survives AdminDashboard remounts (e.g. route changes) for instant Ongoing tab restore. */
let moduleOngoingJobsSnapshot: unknown[] = [];
/** Survives remounts for instant Completed / Follow-up tab restore. */
const moduleJobsListCache = new Map<string, unknown[]>();
/** True after first successful dashboard boot this browser session (skips cold boot on /settings return). */
let moduleDashboardSessionReady = false;

export type AdminStatusFilter =
  | 'ALL'
  | 'ONGOING'
  | 'PENDING'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESCHEDULED';

export type AdminDashboardUiState = {
  statusFilter: AdminStatusFilter;
  currentPage: number;
  completedDatePreset: 'day' | 'week' | 'month' | 'custom';
  completedDateFilter: string;
  completedRangeStartDate: string;
  completedRangeEndDate: string;
};

const defaultUiState = (): AdminDashboardUiState => {
  const today = getTodayLocalDate();
  return {
    statusFilter: 'ONGOING',
    currentPage: 1,
    completedDatePreset: 'day',
    completedDateFilter: today,
    completedRangeStartDate: today,
    completedRangeEndDate: today,
  };
};

let moduleUiState: AdminDashboardUiState = defaultUiState();

function getTodayLocalDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getModuleAdminUiState(): AdminDashboardUiState {
  return moduleUiState;
}

export function setModuleAdminUiState(partial: Partial<AdminDashboardUiState>): void {
  moduleUiState = { ...moduleUiState, ...partial };
}

export function buildJobsListCacheKey(
  filter: 'COMPLETED' | 'RESCHEDULED',
  page: number,
  ui: Pick<
    AdminDashboardUiState,
    'completedDatePreset' | 'completedDateFilter' | 'completedRangeStartDate' | 'completedRangeEndDate'
  > & { hideAmcFollowUps?: boolean }
): string {
  if (filter === 'COMPLETED') {
    if (ui.completedDatePreset === 'day') {
      return `COMPLETED:day:${ui.completedDateFilter}:p${page}`;
    }
    return `COMPLETED:${ui.completedDatePreset}:${ui.completedRangeStartDate}:${ui.completedRangeEndDate}:p${page}`;
  }
  return `RESCHEDULED:hide_amc_${ui.hideAmcFollowUps === true}:p${page}`;
}

export function getModuleDashboardSessionReady(): boolean {
  return moduleDashboardSessionReady;
}

export function setModuleDashboardSessionReady(ready: boolean): void {
  moduleDashboardSessionReady = ready;
}

/** Jobs list to paint immediately when AdminDashboard remounts after /settings. */
export function getModuleJobsForUiRestore(ui: AdminDashboardUiState = moduleUiState): unknown[] {
  if (ui.statusFilter === 'ONGOING') {
    if (moduleOngoingJobsSnapshot.length > 0) return moduleOngoingJobsSnapshot;
    const cached = readAdminDashboardCache();
    if (cached?.jobs?.length) return cached.jobs;
    return [];
  }
  if (ui.statusFilter === 'COMPLETED' || ui.statusFilter === 'RESCHEDULED') {
    const key = buildJobsListCacheKey(ui.statusFilter, ui.currentPage, ui);
    return moduleJobsListCache.get(key) ?? [];
  }
  return [];
}

export function getModuleOngoingJobsSnapshot(): unknown[] {
  return moduleOngoingJobsSnapshot;
}

export function setModuleOngoingJobsSnapshot(jobs: unknown[]): void {
  moduleOngoingJobsSnapshot = jobs;
}

export function getModuleJobsListCache(key: string): unknown[] | undefined {
  return moduleJobsListCache.get(key);
}

export function setModuleJobsListCache(key: string, jobs: unknown[]): void {
  moduleJobsListCache.set(key, jobs);
}

export function clearModuleJobsListCache(): void {
  moduleJobsListCache.clear();
}

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
  moduleOngoingJobsSnapshot = [];
  moduleJobsListCache.clear();
  moduleDashboardSessionReady = false;
  moduleUiState = defaultUiState();
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
    cacheInvalidate('job_counts_v2');
    cacheInvalidate('completed_customers_map_v1');
  } catch {
    /* ignore */
  }
}

async function fetchCriticalSnapshot(): Promise<AdminDashboardSnapshot | null> {
  try {
    const { ensureAdminSupabaseSession } = await import('@/lib/auth');
    if (!(await ensureAdminSupabaseSession(2_000))) return null;

    const [{ db }, { readFollowUpDisplaySettings }] = await Promise.all([
      import('@/lib/supabase'),
      import('@/lib/followUpDisplaySettings'),
    ]);
    const { countOnlyNonAmcFollowUps } = readFollowUpDisplaySettings();
    const [jobsResult, techniciansResult, countsResult] = await Promise.all([
      db.jobs.getOngoing(100),
      db.technicians.getAllForDashboard(100),
      db.jobs.getCounts({ countOnlyNonAmcFollowUps }),
    ]);

    if (jobsResult.error && techniciansResult.error) return null;

    const jobCounts = countsResult.data ?? {
      ongoing: 0,
      followup: 0,
      denied: 0,
      completed: 0,
    };

    const jobs = jobsResult.data ?? [];
    setModuleOngoingJobsSnapshot(jobs);

    return {
      savedAt: Date.now(),
      jobs,
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
