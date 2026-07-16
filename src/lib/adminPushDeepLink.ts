/**
 * Deep-link bridge: admin push tap → dashboard focuses that job.
 * registerAdminPushToken wires Capacitor; AdminDashboard registers the handler.
 * Pending payloads are queued until the dashboard handler is ready (cold start).
 */

export type AdminPushDeepLinkPayload = {
  jobId: string;
  event: 'en_route' | 'completed' | 'otp_entered' | string;
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
  if (!jobId) return null;
  return { jobId, event: event || 'completed' };
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
