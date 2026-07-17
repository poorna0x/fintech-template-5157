/**
 * Fire-and-forget FCM nudge when customer brand / purifier photo is missing
 * at complete-job start or end.
 */
import { supabase } from '@/lib/supabase';
import { getCustomerProfileGaps } from '@/lib/jobAssignMessageDetails';
import { toast } from 'sonner';

export function nudgeTechCustomerProfileGaps(opts: {
  jobId: string;
  customer: Record<string, unknown> | null | undefined;
  phase: 'start' | 'end';
  /** Show an in-app toast as well (useful while the complete dialog is open). */
  showToast?: boolean;
}): void {
  const gaps = getCustomerProfileGaps(opts.customer);
  if (!gaps.missingBrand && !gaps.missingPhoto) return;
  if (!opts.jobId) return;

  if (opts.showToast) {
    if (gaps.missingBrand && gaps.missingPhoto) {
      toast.warning('Please add the purifier brand and a photo for this customer.');
    } else if (gaps.missingBrand) {
      toast.warning('Please add the equipment brand name for this customer.');
    } else {
      toast.warning('Please add a purifier photo for this customer.');
    }
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
          missingBrand: gaps.missingBrand,
          missingPhoto: gaps.missingPhoto,
        }),
        keepalive: true,
      });
    } catch {
      /* best-effort */
    }
  })();
}
