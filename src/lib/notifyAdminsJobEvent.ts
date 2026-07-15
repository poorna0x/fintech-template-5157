/**
 * Fire-and-forget push to all admin phones (HRO Admin app) when a
 * technician heads out to or completes a job. Failures are silent — the
 * admin dashboard's realtime refresh still shows the change either way.
 */
import { supabase } from '@/lib/supabase';

export function notifyAdminsJobEvent(jobId: string, event: 'en_route' | 'completed'): void {
  if (!jobId) return;
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      await fetch('/.netlify/functions/notify-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, event }),
        keepalive: true,
      });
    } catch {
      // best-effort only
    }
  })();
}
