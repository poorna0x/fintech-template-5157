/**
 * Fire-and-forget FCM nudge when customer purifier photo is missing
 * at complete-job start or end.
 */
import { supabase } from '@/lib/supabase';
import { customerMissingPurifierPhoto } from '@/lib/jobAssignMessageDetails';
import { toast } from 'sonner';

export function nudgeTechCustomerProfileGaps(opts: {
  jobId: string;
  customer: Record<string, unknown> | null | undefined;
  phase: 'start' | 'end';
  /** Show an in-app toast as well (useful while the complete dialog is open). */
  showToast?: boolean;
}): void {
  if (!customerMissingPurifierPhoto(opts.customer)) return;
  if (!opts.jobId) return;

  if (opts.showToast) {
    toast.warning('Please add a purifier photo for this customer.');
  }

  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      await fetch('/.netlify/functions/nudge-tech-customer-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId: opts.jobId,
          phase: opts.phase,
          missingPhoto: true,
        }),
        keepalive: true,
      });
    } catch {
      /* best-effort */
    }
  })();
}
