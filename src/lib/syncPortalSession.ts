// Import from supabaseClient (auth-only, lightweight) instead of supabase.ts.
// supabase.ts is the admin/technician data layer that exposes every RPC + table name
// and lives in the `admin-data` chunk. Pulling it via this eager AuthContext path
// would force the chunk into the public modulepreload graph (CVE: admin business
// logic exposed in client bundle).
import { supabase } from './supabaseClient';

/** Keep Edge portal cookie aligned with client Supabase session (non-blocking). */
export async function syncPortalSessionCookie(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch('/.netlify/functions/sync-portal-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    /* non-blocking */
  }
}
