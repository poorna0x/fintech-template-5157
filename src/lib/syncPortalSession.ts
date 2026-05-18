import { supabase } from './supabase';

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
