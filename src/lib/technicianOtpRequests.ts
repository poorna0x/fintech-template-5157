/**
 * OTP requests: admin asks the assigned technician for the customer's
 * 4-digit code (Home Triangle jobs). One row per job; re-asking resets it.
 * Requires scripts/add-technician-otp-requests.sql.
 */
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type OtpRequestRow = {
  id: string;
  job_id: string;
  technician_id: string;
  otp: string | null;
  created_at: string;
  submitted_at: string | null;
};

const OTP_REQUEST_SELECT = 'id,job_id,technician_id,otp,created_at,submitted_at';

/** Admin: create (or re-ask, replacing) the OTP request and push-notify the technician. */
export async function createOtpRequest(opts: {
  jobId: string;
  technicianId: string;
  customerName?: string;
}): Promise<OtpRequestRow | null> {
  const { jobId, technicianId, customerName } = opts;

  const { data, error } = await supabase
    .from('technician_otp_requests')
    .upsert(
      {
        job_id: jobId,
        technician_id: technicianId,
        otp: null,
        created_at: new Date().toISOString(),
        submitted_at: null,
      },
      { onConflict: 'job_id' }
    )
    .select(OTP_REQUEST_SELECT)
    .single();

  if (error) throw error;
  const row = data as OtpRequestRow;

  // Push with an inline reply field: the technician types the 4 digits
  // straight into the notification, no need to open the app. Fire and
  // forget — the in-app card covers them either way.
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      const res = await fetch('/.netlify/functions/send-otp-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: row.id, technicianId, customerName }),
        keepalive: true,
      });
      const out = (await res.json().catch(() => null)) as
        | { sent?: boolean; reason?: string }
        | null;
      if (!res.ok || out?.sent === false) {
        console.warn('[otp-push] not sent:', res.status, out?.reason || '');
        toast.warning(
          out?.reason === 'no_token'
            ? "No notification sent — the technician hasn't installed the app. They'll see the request when they open it."
            : "Notification couldn't be sent — the technician will see the request in the app."
        );
      }
    } catch (err) {
      console.warn('[otp-push] error:', err);
    }
  })();

  return row;
}

/** Admin: latest request for a job (to show an already-submitted OTP on reopen). */
export async function getOtpRequestForJob(jobId: string): Promise<OtpRequestRow | null> {
  const { data } = await supabase
    .from('technician_otp_requests')
    .select(OTP_REQUEST_SELECT)
    .eq('job_id', jobId)
    .maybeSingle();
  return (data as OtpRequestRow) ?? null;
}

/** Admin: live updates for one request (returns unsubscribe). */
export function watchOtpRequest(
  requestId: string,
  onChange: (row: OtpRequestRow) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`otp-req-${requestId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'technician_otp_requests',
        filter: `id=eq.${requestId}`,
      },
      (payload) => {
        if (payload.new) onChange(payload.new as OtpRequestRow);
      }
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

/** Technician: pending (unanswered) requests for their jobs. */
export async function getPendingOtpRequests(technicianId: string): Promise<OtpRequestRow[]> {
  const { data } = await supabase
    .from('technician_otp_requests')
    .select(OTP_REQUEST_SELECT)
    .eq('technician_id', technicianId)
    .is('otp', null);
  return (data as OtpRequestRow[]) ?? [];
}

/** Technician: submit the code the customer gave them. */
export async function submitOtp(requestId: string, otp: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('technician_otp_requests')
    .update({ otp, submitted_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('id');
  return !error && !!data?.length;
}
