/**
 * Admin job-card quick nudges → assigned technician FCM push.
 * Uses existing send-tech-push (allowReply works on current tech APK — no rebuild).
 */
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { extractPhotoUrls, getJobCustomTimeLabel } from '@/lib/adminUtils';
import { aggregateCustomerPhotoUrls } from '@/lib/jobReportPhotos';
import { customerHasPurifierPhoto } from '@/lib/jobAssignMessageDetails';

export const TECH_NUDGE_COLOR = '#7C3AED'; // violet: office nudge

export type TechPushSendResult = 'sent' | 'no_app' | 'failed' | 'skipped';

export function getJobAssignedTechnicianId(job: Record<string, unknown> | null | undefined): string | null {
  if (!job) return null;
  const id =
    (job as { assigned_technician_id?: string }).assigned_technician_id ||
    (job as { assignedTechnicianId?: string }).assignedTechnicianId ||
    null;
  return id ? String(id) : null;
}

export function getJobCustomerName(job: Record<string, unknown>): string {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  return String(
    customer.full_name ||
      customer.fullName ||
      (job as { customer_name?: string }).customer_name ||
      'Customer'
  );
}

/**
 * Distinct marker around the customer name so techs spot who the nudge is for
 * in collapsed Android tray text (notifications can't use real font styles).
 */
export function formatNudgeCustomerLabel(name: string): string {
  const n = String(name || '').trim() || 'Customer';
  return `★ ${n} ★`;
}

export function getJobCustomerPhone(job: Record<string, unknown>): string {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  const raw =
    customer.phone ||
    customer.mobile ||
    customer.primary_phone ||
    (job as { customer_phone?: string }).customer_phone ||
    '';
  return String(raw).trim();
}

export function getJobNumberLabel(job: Record<string, unknown>): string {
  return String(
    (job as { job_number?: string }).job_number ||
      (job as { jobNumber?: string }).jobNumber ||
      ''
  ).trim();
}

/** Quick local check: this job's photo slots + customer.photos on the card. */
export function jobOrCustomerHasPhotosLocal(job: Record<string, unknown>): boolean {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  if (customerHasPurifierPhoto(customer.photos ?? customer.Photos)) return true;

  const before = (job as { before_photos?: unknown; beforePhotos?: unknown }).before_photos
    ?? (job as { beforePhotos?: unknown }).beforePhotos;
  const after = (job as { after_photos?: unknown; afterPhotos?: unknown }).after_photos
    ?? (job as { afterPhotos?: unknown }).afterPhotos;
  const images = (job as { images?: unknown }).images;
  const urls = [
    ...extractPhotoUrls(Array.isArray(before) ? before : []),
    ...extractPhotoUrls(Array.isArray(after) ? after : []),
    ...extractPhotoUrls(Array.isArray(images) ? images : []),
  ];
  return urls.length > 0;
}

/**
 * True when customer has zero photos across profile + all known jobs.
 * Falls back to local card check if the aggregate query fails.
 */
export async function customerHasNoPhotosAtAll(
  job: Record<string, unknown>
): Promise<boolean> {
  if (jobOrCustomerHasPhotosLocal(job)) return false;

  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  const customerId = String(
    customer.id ||
      (job as { customer_id?: string }).customer_id ||
      (job as { customerId?: string }).customerId ||
      ''
  ).trim();
  if (!customerId) return true;

  try {
    const { data: customerRecord } = await db.customers.getById(customerId);
    if (customerHasPurifierPhoto((customerRecord as { photos?: unknown } | null)?.photos)) {
      return false;
    }

    const { data: jobs, error } = await db.jobs.getByCustomerIdForPhotoAggregation(customerId);
    if (error) return true;

    const list = Array.isArray(jobs) ? jobs : [];
    const jobIds = list.map((j: { id?: string }) => j.id).filter(Boolean) as string[];
    let enriched = list;
    if (jobIds.length > 0) {
      const { data: photoRows } = await db.jobs.getPhotoFieldsForJobIds(jobIds);
      if (photoRows?.length) {
        const byId = new Map(photoRows.map((r: { id: string }) => [r.id, r]));
        enriched = list.map((j: { id?: string }) => {
          const row = j.id ? byId.get(j.id) : null;
          return row ? { ...j, ...row } : j;
        });
      }
    }

    const urls = aggregateCustomerPhotoUrls(enriched, customerRecord || customer);
    return urls.length === 0;
  } catch {
    return true;
  }
}

export function isJobNotStarted(job: Record<string, unknown>): boolean {
  const status = String((job as { status?: string }).status || '').toUpperCase();
  return status === 'ASSIGNED' || status === 'EN_ROUTE' || status === 'PENDING';
}

/** Best-effort: scheduled date is today (IST-ish local) and status not started / not in progress. */
export function isCustomerWaitingLikely(job: Record<string, unknown>): boolean {
  const status = String((job as { status?: string }).status || '').toUpperCase();
  if (status === 'IN_PROGRESS' || status === 'COMPLETED' || status === 'DENIED' || status === 'CANCELLED') {
    return false;
  }
  if (!['ASSIGNED', 'EN_ROUTE', 'PENDING'].includes(status)) return false;

  const scheduled =
    (job as { scheduled_date?: string }).scheduled_date ||
    (job as { scheduledDate?: string }).scheduledDate ||
    '';
  if (!scheduled) return status === 'ASSIGNED' || status === 'EN_ROUTE';

  try {
    const d = new Date(scheduled);
    if (Number.isNaN(d.getTime())) return true;
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (!sameDay) return false;

    // If custom time is parseable like "1 PM", treat as late after that hour; else afternoon nudge.
    const label = (getJobCustomTimeLabel(job) || '').trim();
    const m = label.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (m) {
      let hour = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = (m[3] || '').toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      const appoint = new Date(now);
      appoint.setHours(hour, min, 0, 0);
      return now.getTime() >= appoint.getTime() - 15 * 60 * 1000;
    }
    // No clock time — still useful as a soft "today + assigned" ping
    return now.getHours() >= 11;
  } catch {
    return status === 'ASSIGNED' || status === 'EN_ROUTE';
  }
}

export async function sendTechnicianPush(opts: {
  technicianId: string;
  title: string;
  body?: string;
  color?: string;
  tag?: string;
  allowReply?: boolean;
  /** When set, tech notification shows a Call action (dialer) — no Reply. */
  callPhone?: string;
}): Promise<TechPushSendResult> {
  const { technicianId, title, body, color, tag, allowReply, callPhone } = opts;
  if (!technicianId || !title) return 'skipped';

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      toast.error('Session expired — sign in again.');
      return 'failed';
    }

    const phoneDigits = (callPhone || '').replace(/[^\d+]/g, '').trim();

    const res = await fetch('/.netlify/functions/send-tech-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        technicianId,
        title,
        body,
        color: color || TECH_NUDGE_COLOR,
        ...(tag ? { tag } : {}),
        ...(allowReply && !phoneDigits ? { allowReply: true } : {}),
        ...(phoneDigits ? { callPhone: phoneDigits } : {}),
      }),
    });
    const out = (await res.json().catch(() => null)) as
      | { sent?: boolean; reason?: string; error?: string }
      | null;

    if (!res.ok) {
      toast.warning('Could not send nudge to technician.');
      return 'failed';
    }
    if (out?.sent === false) {
      if (out.reason === 'no_token' || out.reason === 'stale_token') {
        toast.warning(
          'No push token — open HRO Technician on their phone and Allow Notifications.'
        );
        return out.reason === 'stale_token' ? 'failed' : 'no_app';
      }
      toast.warning('Nudge was not delivered.');
      return 'failed';
    }
    toast.success('Nudge sent to technician');
    return 'sent';
  } catch (err) {
    console.warn('[job-nudge] error:', err);
    toast.warning('Could not send nudge to technician.');
    return 'failed';
  }
}

export function buildPhotoNudgeCopy(job: Record<string, unknown>): { title: string; body: string } {
  const label = formatNudgeCustomerLabel(getJobCustomerName(job));
  return {
    title: label,
    body: 'Add purifier photo — customer has no photos on file. Capture the RO unit.',
  };
}

export function buildCallCustomerCopy(job: Record<string, unknown>): { title: string; body: string } {
  const label = formatNudgeCustomerLabel(getJobCustomerName(job));
  const phone = getJobCustomerPhone(job);
  return {
    title: label,
    body: phone ? `Call customer now — ${phone}` : 'Call customer now',
  };
}

export function buildOnTheWayCopy(job: Record<string, unknown>): { title: string; body: string } {
  const label = formatNudgeCustomerLabel(getJobCustomerName(job));
  return {
    title: label,
    body: 'On the way? — reply with your ETA.',
  };
}

export function buildTimeToFinishCopy(job: Record<string, unknown>): { title: string; body: string } {
  const label = formatNudgeCustomerLabel(getJobCustomerName(job));
  return {
    title: label,
    body: 'Time to finish? — how much time do you need? Reply with an estimate.',
  };
}

export function buildStartJobCopy(job: Record<string, unknown>): { title: string; body: string } {
  const label = formatNudgeCustomerLabel(getJobCustomerName(job));
  const time = getJobCustomTimeLabel(job);
  return {
    title: label,
    body: `Start this job${time ? ` · ${time}` : ''} — please start / mark in progress.`,
  };
}

export function buildCustomerWaitingCopy(job: Record<string, unknown>): { title: string; body: string } {
  const label = formatNudgeCustomerLabel(getJobCustomerName(job));
  const phone = getJobCustomerPhone(job);
  return {
    title: label,
    body: `Customer waiting${phone ? ` · ${phone}` : ''} — please attend now.`.slice(0, 300),
  };
}

export async function sendJobPhotoNudge(job: Record<string, unknown>): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const loading = toast.loading('Checking customer photos…');
  try {
    const none = await customerHasNoPhotosAtAll(job);
    toast.dismiss(loading);
    if (!none) {
      toast.info('Customer already has photos — no photo nudge sent.');
      return 'skipped';
    }
    const copy = buildPhotoNudgeCopy(job);
    return sendTechnicianPush({
      technicianId: techId,
      ...copy,
      tag: `job_nudge_photo_${String((job as { id?: string }).id || '').slice(0, 24)}`,
    });
  } catch (e) {
    toast.dismiss(loading);
    throw e;
  }
}

export async function sendJobCallCustomerNudge(job: Record<string, unknown>): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const phone = getJobCustomerPhone(job);
  if (!phone) {
    toast.error('No customer phone on this job.');
    return 'skipped';
  }
  const copy = buildCallCustomerCopy(job);
  return sendTechnicianPush({
    technicianId: techId,
    ...copy,
    callPhone: phone,
    tag: `job_nudge_call_${String((job as { id?: string }).id || '').slice(0, 24)}`,
  });
}

export async function sendJobOnTheWayNudge(job: Record<string, unknown>): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const copy = buildOnTheWayCopy(job);
  return sendTechnicianPush({
    technicianId: techId,
    ...copy,
    allowReply: true,
    tag: `job_nudge_eta_${String((job as { id?: string }).id || '').slice(0, 24)}`,
  });
}

export async function sendJobTimeToFinishNudge(job: Record<string, unknown>): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const copy = buildTimeToFinishCopy(job);
  return sendTechnicianPush({
    technicianId: techId,
    ...copy,
    allowReply: true,
    tag: `job_nudge_finish_${String((job as { id?: string }).id || '').slice(0, 24)}`,
  });
}

export async function sendJobStartNudge(job: Record<string, unknown>): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const copy = buildStartJobCopy(job);
  return sendTechnicianPush({
    technicianId: techId,
    ...copy,
    tag: `job_nudge_start_${String((job as { id?: string }).id || '').slice(0, 24)}`,
  });
}

export async function sendJobCustomerWaitingNudge(job: Record<string, unknown>): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const copy = buildCustomerWaitingCopy(job);
  return sendTechnicianPush({
    technicianId: techId,
    ...copy,
    allowReply: true,
    tag: `job_nudge_wait_${String((job as { id?: string }).id || '').slice(0, 24)}`,
  });
}

export async function sendJobCustomNudge(
  job: Record<string, unknown>,
  message: string,
  opts?: { title?: string; allowReply?: boolean }
): Promise<TechPushSendResult> {
  const techId = getJobAssignedTechnicianId(job);
  if (!techId) {
    toast.error('No technician assigned on this job.');
    return 'skipped';
  }
  const body = message.trim().slice(0, 300);
  if (!body) {
    toast.error('Type a message first.');
    return 'skipped';
  }
  const name = getJobCustomerName(job);
  // Title is always ★ Customer ★ so techs see who this job message is for.
  const title = (opts?.title || formatNudgeCustomerLabel(name)).slice(0, 120);
  return sendTechnicianPush({
    technicianId: techId,
    title,
    body,
    allowReply: opts?.allowReply !== false,
    tag: `job_nudge_msg_${String((job as { id?: string }).id || '').slice(0, 24)}`,
  });
}
