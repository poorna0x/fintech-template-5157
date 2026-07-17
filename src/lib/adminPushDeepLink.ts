/**
 * Deep-link bridge: admin push tap → dashboard focuses that job.
 * registerAdminPushToken wires Capacitor; AdminDashboard registers the handler.
 * Pending payloads are queued until the dashboard handler is ready (cold start).
 * When bill photo is missing, also carries technician WhatsApp compose fields.
 */

export type AdminPushDeepLinkPayload = {
  jobId: string;
  event: 'en_route' | 'completed' | 'otp_entered' | string;
  /** yyyy-mm-dd from the push — skip a DB fetch on tap when present. */
  completedDate?: string;
  /** Completed without bill photo — open WhatsApp to the technician. */
  billMissing?: boolean;
  /** Digits-only WhatsApp phone (e.g. 91XXXXXXXXXX). */
  techPhone?: string;
  /** Prefill text for wa.me. */
  waText?: string;
};

type Handler = (payload: AdminPushDeepLinkPayload) => void;

let handler: Handler | null = null;
let pending: AdminPushDeepLinkPayload | null = null;

export function setAdminPushDeepLinkHandler(next: Handler | null): void {
  handler = next;
  if (handler && pending) {
    const queued = pending;
    pending = null;
    handler(queued);
  }
}

/** Extract jobId/event from FCM / Capacitor notification data. */
export function parseAdminPushDeepLinkData(
  raw: Record<string, unknown> | null | undefined
): AdminPushDeepLinkPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const jobId = String(raw.jobId || raw.job || '').trim();
  const event = String(raw.event || '').trim();
  const completedDateRaw = String(raw.completedDate || '').trim();
  const completedDate = /^\d{4}-\d{2}-\d{2}$/.test(completedDateRaw)
    ? completedDateRaw
    : undefined;
  if (!jobId) return null;
  const billMissing =
    raw.billMissing === true ||
    raw.billMissing === '1' ||
    raw.billMissing === 'true';
  const techPhone = String(raw.techPhone || '').replace(/\D/g, '');
  const waText = String(raw.waText || '').trim();
  return {
    jobId,
    event: event || 'completed',
    completedDate,
    ...(billMissing ? { billMissing: true } : {}),
    ...(techPhone ? { techPhone } : {}),
    ...(waText ? { waText } : {}),
  };
}

export function deliverAdminPushDeepLink(
  raw: Record<string, unknown> | null | undefined
): boolean {
  const parsed = parseAdminPushDeepLinkData(raw);
  if (!parsed) return false;
  if (!handler) {
    pending = parsed;
    return true;
  }
  handler(parsed);
  return true;
}
