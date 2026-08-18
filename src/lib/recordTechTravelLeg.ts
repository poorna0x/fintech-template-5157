import { supabase } from '@/lib/supabase';

/** Fire-and-forget: office → this job (or previous job → this job), avoid tolls. */
export function recordTechTravelLeg(jobId: string): void {
  if (!jobId) return;
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      await fetch('/.netlify/functions/tech-travel-leg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId }),
        keepalive: true,
      });
    } catch {
      /* never block Start Work */
    }
  })();
}
