/**
 * OTP requests: admin asks the assigned technician for the customer's
 * 4-digit code (Home Triangle / Require OTP jobs). One row per job; re-asking resets it.
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

/**
 * Merge a customer OTP into a job's requirements JSON (the same place the
 * completion wizard writes it), so it survives to the admin Completed section.
 * Mutates a copy and returns it.
 */
export function applyOtpToRequirements(requirements: any[], otp: string): any[] {
  const reqs = Array.isArray(requirements) ? [...requirements] : [];
  const now = new Date().toISOString();
  const otpReq = reqs.find((r: any) => r && typeof r === 'object' && r.require_otp === true);
  if (otpReq) {
    otpReq.otp_entered = otp;
    otpReq.otp_verified = true;
    otpReq.otp_verified_at = now;
  } else {
    reqs.push({ require_otp: true, otp_entered: otp, otp_verified: true, otp_verified_at: now });
  }
  return reqs;
}

/** Read the customer OTP already stored on a job's requirements JSON, if any. */
export function getStoredOtpFromRequirements(requirements: any): string | null {
  let reqs: any[] = [];
  try {
    if (typeof requirements === 'string') reqs = JSON.parse(requirements);
    else if (Array.isArray(requirements)) reqs = requirements;
    else if (requirements && typeof requirements === 'object') reqs = [requirements];
  } catch {
    reqs = [];
  }
  const otpReq = reqs.find((r: any) => r && typeof r === 'object' && r.require_otp === true);
  const otp = otpReq?.otp_entered;
  return typeof otp === 'string' && otp.trim() ? otp.trim() : null;
}

/**
 * Persist the OTP onto jobs.requirements (single small read + write).
 * Best-effort: the technician_otp_requests row already carries the code.
 */
async function persistOtpOnJob(jobId: string, otp: string): Promise<void> {
  try {
    const { data } = await supabase.from('jobs').select('requirements').eq('id', jobId).maybeSingle();
    if (!data) return;
    let reqs: any[] = [];
    try {
      const raw = (data as any).requirements;
      if (typeof raw === 'string') reqs = JSON.parse(raw);
      else if (Array.isArray(raw)) reqs = raw;
      else if (raw && typeof raw === 'object') reqs = [raw];
    } catch {
      reqs = [];
    }
    await supabase.from('jobs').update({ requirements: applyOtpToRequirements(reqs, otp) }).eq('id', jobId);
  } catch (err) {
    console.warn('[otp] could not store OTP on job:', err);
  }
}

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
            ? 'No push token — open HRO Technician and Allow Notifications. They’ll see the OTP request when the app is open.'
            : out?.reason === 'stale_token'
              ? 'Push token expired — ask them to reopen HRO Technician (Allow Notifications).'
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
export async function submitOtp(requestId: string, otp: string, jobId?: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('technician_otp_requests')
    .update({ otp, submitted_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('id,job_id');
  const ok = !error && !!data?.length;
  const resolvedJobId = jobId || (data?.[0] as { job_id?: string } | undefined)?.job_id;
  // Also copy the code onto the job itself so the admin Completed section
  // shows it even after the request row is long forgotten.
  if (ok && resolvedJobId) void persistOtpOnJob(resolvedJobId, otp);
  // Always push to admin phones — the Ask OTP dialog may be closed.
  if (ok && resolvedJobId && /^\d{4}$/.test(otp)) {
    void import('@/lib/notifyAdminsJobEvent').then(({ notifyAdminsJobEvent }) =>
      notifyAdminsJobEvent(resolvedJobId, 'otp_entered', { otp })
    );
  }
  return ok;
}
