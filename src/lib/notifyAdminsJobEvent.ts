/**
 * Fire-and-forget push to all admin phones (HRO Admin app) when a
 * technician heads out to, enters a customer OTP for, completes a job,
 * or creates a job (from customer search).
 * OTP is pushed for Ask OTP replies, notification inline reply, and Start Work.
 * Failures are silent — the admin dashboard's realtime refresh still shows
 * the change either way.
 */
import { supabase } from '@/lib/supabase';

export function notifyAdminsJobEvent(
  jobId: string,
  event:
    | 'en_route'
    | 'completed'
    | 'otp_entered'
    | 'job_created'
    | 'bill_photo_added'
    | 'payment_screenshot_added',
  extra?: { otp?: string }
): void {
  if (!jobId) return;
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        console.warn('[notifyAdminsJobEvent] skipped: no session', event, jobId);
        return;
      }
      const res = await fetch('/.netlify/functions/notify-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, event, ...(extra?.otp ? { otp: extra.otp } : {}) }),
        keepalive: true,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[notifyAdminsJobEvent] failed', event, jobId, res.status, text);
        return;
      }
      const body = await res.json().catch(() => null);
      if (body && typeof body === 'object' && (body as { sent?: number }).sent === 0) {
        console.warn('[notifyAdminsJobEvent] sent 0', event, jobId, body);
      }
    } catch (err) {
      console.warn('[notifyAdminsJobEvent] error', event, jobId, err);
    }
  })();
}
