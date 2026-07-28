/**
 * Deep-link bridge: admin push tap → dashboard focuses that job.
 * registerAdminPushToken wires Capacitor; AdminDashboard registers the handler.
 * Pending payloads are queued until the dashboard handler is ready (cold start).
 */

import type { SettingsPanelSlug } from '@/lib/settingsUrl';

export type AdminPushDeepLinkPayload = {
  /** 'job' (default) → focus a job; 'tech_call' → search the caller's number; 'settings' → Settings panel; 'payments' → Payments tab + optional add-expense dialog. */
  kind?: 'job' | 'tech_call' | 'settings' | 'payments';
  jobId: string;
  event: 'en_route' | 'completed' | 'otp_entered' | string;
  /** yyyy-mm-dd from the push — skip a DB fetch on tap when present. */
  completedDate?: string;
  /** tech_call: normalized caller number to search. */
  phone?: string;
  customerId?: string;
  /** settings deep-link */
  panel?: SettingsPanelSlug;
  reminderId?: string;
  /** e.g. whatsapp — open Pending payments then offer WhatsApp for that row */
  action?: string;
  /** payments: open Add technician / business expense dialog */
  addExpense?: 'technician' | 'business';
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

  if (String(raw.type || '').trim() === 'admin_reminder') {
    const reminderId = String(raw.reminderId || '').trim();
    const panelRaw = String(raw.panel || '').trim();
    if (!reminderId || !panelRaw) return null;
    return {
      kind: 'settings',
      jobId: '',
      event: 'admin_reminder',
      panel: panelRaw as SettingsPanelSlug,
      reminderId,
      action: String(raw.action || '').trim() || undefined,
    };
  }

  // Nightly expense review (No / notification tap) → Payments → Add expense.
  if (String(raw.type || '').trim() === 'expense_review') {
    const addRaw = String(raw.addExpense || raw.kind || '').trim();
    const addExpense =
      addRaw === 'technician' || addRaw === 'business' ? addRaw : null;
    if (!addExpense) return null;
    return {
      kind: 'payments',
      jobId: '',
      event: 'expense_review',
      addExpense,
    };
  }

  // Technician received a call from a known customer — open that customer.
  // Technician searched customers — open admin search with the same query
  // (payload.phone carries the query for tech_search).
  if (String(raw.type || '').trim() === 'tech_call' || String(raw.type || '').trim() === 'tech_search' || String(raw.type || '').trim() === 'wrong_line_call') {
    const phone = String(raw.phone || raw.query || '').trim();
    if (!phone) return null;
    return {
      kind: 'tech_call',
      jobId: '',
      event: String(raw.type || '').trim() === 'tech_search' ? 'tech_search' : 'tech_call',
      phone,
      customerId: String(raw.customerId || '').trim() || undefined,
    };
  }

  const jobId = String(raw.jobId || raw.job || '').trim();
  const event = String(raw.event || '').trim();
  const completedDateRaw = String(raw.completedDate || '').trim();
  const completedDate = /^\d{4}-\d{2}-\d{2}$/.test(completedDateRaw)
    ? completedDateRaw
    : undefined;
  if (!jobId) return null;
  return { jobId, event: event || 'completed', completedDate };
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
