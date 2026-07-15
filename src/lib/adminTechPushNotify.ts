/**
 * Fire-and-forget push notification to a technician's Android app
 * (job assigned / reassigned). Silently does nothing if the technician
 * hasn't installed the app or the push can't be delivered — the existing
 * in-app notification/realtime refresh still covers them.
 */
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getJobCustomTimeLabel, getLeadSourceFromJob } from '@/lib/adminUtils';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';

/** Notification accent colors — technicians can tell the type at a glance. */
export const TECH_PUSH_COLOR_ASSIGNED = '#16A34A'; // green: you got a job
export const TECH_PUSH_COLOR_REMOVED = '#DC2626'; // red: a job was taken away

export function notifyTechnicianJobPush(opts: {
  technicianId: string;
  title: string;
  body?: string;
  /** Hex accent color for the notification icon (e.g. green assigned, red removed). */
  color?: string;
}): void {
  const { technicianId, title, body, color } = opts;
  if (!technicianId || !title) return;

  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        console.warn('[tech-push] skipped: no admin session in this browser');
        return;
      }
      // keepalive: the request survives even if the page navigates away
      // right after assigning (e.g. opening WhatsApp on mobile).
      const res = await fetch('/.netlify/functions/send-tech-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ technicianId, title, body, color }),
        keepalive: true,
      });
      const out = (await res.json().catch(() => null)) as
        | { sent?: boolean; reason?: string; error?: string }
        | null;
      if (!res.ok) {
        console.warn('[tech-push] failed:', res.status, out?.error || '');
        toast.warning('App notification could not be sent to the technician.');
      } else if (out?.sent === false) {
        console.warn('[tech-push] not sent:', out.reason);
        if (out.reason === 'no_token') {
          toast.warning("No app notification — technician hasn't installed the app.");
        }
      }
    } catch (err) {
      console.warn('[tech-push] error:', err);
    }
  })();
}

/**
 * Same copy as the WhatsApp assign template:
 * "New amc service assigned - Amrita - Electronic City - Direct call, Time : 1 PM"
 * Split as notification title (what happened) + body (the details).
 */
function jobPushDetails(
  job: Record<string, unknown>,
  customer?: Record<string, unknown> | null
): { serviceSubType: string; body: string } {
  const serviceSubType = String(
    (job as { service_sub_type?: string; serviceSubType?: string }).service_sub_type ||
      (job as { serviceSubType?: string }).serviceSubType ||
      'Service'
  );
  const customerRecord =
    customer || ((job as { customer?: Record<string, unknown> }).customer ?? {});
  const customerName = String(
    (customerRecord as { full_name?: string }).full_name ||
      (customerRecord as { fullName?: string }).fullName ||
      'Customer'
  );

  let location = '';
  let leadSource = '';
  let customTime = '';
  try {
    location =
      getJobLocationLabelForWhatsApp(
        job as { service_site?: string; service_address?: unknown },
        customerRecord as Record<string, unknown>
      )?.trim() || '';
    leadSource = getLeadSourceFromJob(job)?.trim() || '';
    customTime = getJobCustomTimeLabel(job)?.trim() || '';
  } catch {
    // details are optional; never block the notification over them
  }

  const details = [customerName, location, leadSource].filter(Boolean).join(' - ');
  const body = customTime ? `${details}, Time : ${customTime}` : details;
  return { serviceSubType, body };
}

export function jobAssignPushText(opts: {
  job: Record<string, unknown>;
  customer?: Record<string, unknown> | null;
  reassigned?: boolean;
}): { title: string; body: string; color: string } {
  const { job, customer, reassigned } = opts;
  const { serviceSubType, body } = jobPushDetails(job, customer);
  return {
    title: reassigned
      ? `${serviceSubType} reassigned to you`
      : `New ${serviceSubType.toLowerCase()} assigned`,
    body,
    color: TECH_PUSH_COLOR_ASSIGNED,
  };
}

/** Old technician on reassign, or any technician on unassign. */
export function jobRemovedPushText(opts: {
  job: Record<string, unknown>;
  customer?: Record<string, unknown> | null;
  movedToAnother?: boolean;
}): { title: string; body: string; color: string } {
  const { job, customer, movedToAnother } = opts;
  const { serviceSubType, body } = jobPushDetails(job, customer);
  return {
    title: movedToAnother
      ? `${serviceSubType} moved to another technician`
      : `${serviceSubType} unassigned from you`,
    body,
    color: TECH_PUSH_COLOR_REMOVED,
  };
}
