/**
 * Fire-and-forget push notification to a technician's Android app
 * (job assigned / reassigned). Silently does nothing if the technician
 * hasn't installed the app or the push can't be delivered — the existing
 * in-app notification/realtime refresh still covers them.
 */
import { supabase } from '@/lib/supabase';

export function notifyTechnicianJobPush(opts: {
  technicianId: string;
  title: string;
  body?: string;
}): void {
  const { technicianId, title, body } = opts;
  if (!technicianId || !title) return;

  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      await fetch('/.netlify/functions/send-tech-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ technicianId, title, body }),
      });
    } catch {
      // best-effort
    }
  })();
}

/** Standard copy for assignment pushes. */
export function jobAssignPushText(opts: {
  jobNumber?: string | null;
  customerName?: string | null;
  reassigned?: boolean;
}): { title: string; body: string } {
  const { jobNumber, customerName, reassigned } = opts;
  const parts = [jobNumber ? `Job ${jobNumber}` : 'A job', customerName ? `— ${customerName}` : '']
    .filter(Boolean)
    .join(' ');
  return {
    title: reassigned ? 'Job reassigned to you' : 'New job assigned',
    body: `${parts}. Open the app to see details.`,
  };
}
