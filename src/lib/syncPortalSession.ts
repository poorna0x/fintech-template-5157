// Import from supabaseClient (auth-only, lightweight) instead of supabase.ts.
// supabase.ts is the admin/technician data layer that exposes every RPC + table name
// and lives in the `admin-data` chunk. Pulling it via this eager AuthContext path
// would force the chunk into the public modulepreload graph (CVE: admin business
// logic exposed in client bundle).
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'hro_portal_cookie_sync_v1';
/** Cookie lives 12h; refresh at most twice a day unless login/force. */
const SYNC_TTL_MS = 6 * 60 * 60 * 1000;

let inFlight: Promise<void> | null = null;

function readLastSync(userId: string): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { userId?: string; at?: number }) : null;
    if (!parsed || parsed.userId !== userId || typeof parsed.at !== 'number') return 0;
    return parsed.at;
  } catch {
    return 0;
  }
}

function writeLastSync(userId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** Keep Edge portal cookie aligned with client Supabase session (non-blocking). */
export async function syncPortalSessionCookie(opts?: { force?: boolean }): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const userId = session?.user?.id;
    if (!token || !userId) return;

    if (!opts?.force) {
      const last = readLastSync(userId);
      if (last && Date.now() - last < SYNC_TTL_MS) return;
    }
    if (inFlight) {
      await inFlight;
      if (!opts?.force && Date.now() - readLastSync(userId) < SYNC_TTL_MS) return;
    }

    writeLastSync(userId);
    inFlight = (async () => {
      await fetch('/.netlify/functions/sync-portal-session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  } catch {
    /* non-blocking */
  }
}
