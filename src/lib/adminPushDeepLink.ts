/**
 * Deep-link bridge: admin push tap → dashboard focuses that job.
 * registerAdminPushToken wires Capacitor; AdminDashboard registers the handler.
 * Pending payloads are queued until the dashboard handler is ready (cold start)
 * or until biometric unlock completes (app lock).
 */

import type { SettingsPanelSlug } from '@/lib/settingsUrl';
import { isAdminAppLocked } from '@/lib/adminBiometricLock';

export type AdminPushDeepLinkPayload = {
  /** 'job' (default) → focus a job; 'tech_call' → search the caller's number; 'settings' → Settings panel; 'payments' → Payments tab + optional add-expense dialog. */
  kind?: 'job' | 'tech_call' | 'settings' | 'payments';
  jobId: string;
  event: 'en_route' | 'completed' | 'otp_entered' | string;
  /** yyyy-mm-dd from the push — skip a DB fetch on tap when present. */
  completedDate?: string;
  /** tech_call / wrong_line: normalized phone to search. */
  phone?: string;
  customerId?: string;
  /** tech_call / wrong_line context kept after the tray notification is gone */
  techName?: string;
  fromNumber?: string;
  companyPhone?: string;
  technicianId?: string;
  /** settings deep-link */
  panel?: SettingsPanelSlug;
  reminderId?: string;
  /** e.g. whatsapp — open Pending payments then offer WhatsApp for that row */
  action?: string;
  /** payments: open Add technician / business expense dialog */
  addExpense?: 'technician' | 'business';
  /** yyyy-mm-dd from expense-review push */
  expenseDate?: string;
};

type Handler = (payload: AdminPushDeepLinkPayload) => void;

let handler: Handler | null = null;
let pending: AdminPushDeepLinkPayload | null = null;

export function setAdminPushDeepLinkHandler(next: Handler | null): void {
  handler = next;
  if (handler && pending && !isAdminAppLocked()) {
    const queued = pending;
    pending = null;
    handler(queued);
  }
}

/** Queue a deep-link for the next dashboard handler (e.g. while on Settings). */
export function queueAdminPushDeepLink(payload: AdminPushDeepLinkPayload): void {
  pending = payload;
}

/** After biometric unlock — deliver any push tap that waited on the lock screen. */
export function flushPendingAdminPushDeepLink(): void {
  if (!handler || !pending || isAdminAppLocked()) return;
  const queued = pending;
  pending = null;
  handler(queued);
}

/** Extract jobId/event from FCM / Capacitor notification data. */
export function parseAdminPushDeepLinkData(
  raw: Record<string, unknown> | null | undefined
): AdminPushDeepLinkPayload | null {
  if (!raw || typeof raw !== 'object') return null;

  if (String(raw.type || '').trim() === 'whatsapp_inbound') {
    const phone = String(raw.phone || raw.phone_e164 || '').replace(/\D/g, '');
    if (!phone) return null;
    return {
      kind: 'settings',
      jobId: '',
      event: 'whatsapp_inbound',
      panel: 'whatsapp-inbox',
      phone,
      reminderId: phone,
    };
  }

  if (String(raw.type || '').trim() === 'privacy_request') {
    return {
      kind: 'settings',
      jobId: '',
      event: 'privacy_request',
      panel: 'privacy-center',
    };
  }

  if (String(raw.type || '').trim() === 'job_review') {
    return {
      kind: 'settings',
      jobId: String(raw.jobId || '').trim(),
      event: 'job_review',
      panel: 'job-reviews',
    };
  }

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
    const expenseDateRaw = String(raw.date || raw.expenseDate || '').trim();
    const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(expenseDateRaw)
      ? expenseDateRaw
      : undefined;
    return {
      kind: 'payments',
      jobId: '',
      event: 'expense_review',
      addExpense,
      expenseDate,
    };
  }

  // Technician received a call / searched / wrong-line dial — open that customer.
  // (payload.phone carries the query for tech_search).
  {
    const type = String(raw.type || '').trim();
    if (type === 'tech_call' || type === 'tech_search' || type === 'wrong_line_call') {
      const phone = String(raw.phone || raw.query || '').trim();
      if (!phone) return null;
      const missed =
        String(raw.missed || '').toLowerCase() === 'true' ||
        String(raw.missed || '') === '1';
      let event: string = type;
      if (type === 'tech_call' && missed) event = 'missed_call';
      return {
        kind: 'tech_call',
        jobId: '',
        event,
        phone,
        customerId: String(raw.customerId || '').trim() || undefined,
        techName: String(raw.techName || '').trim() || undefined,
        fromNumber: String(raw.fromNumber || '').trim() || undefined,
        companyPhone: String(raw.companyPhone || '').trim() || undefined,
        technicianId: String(raw.technicianId || '').trim() || undefined,
      };
    }
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
  // Hold until fingerprint unlock so navigation happens after the lock screen.
  if (!handler || isAdminAppLocked()) {
    pending = parsed;
    return true;
  }
  handler(parsed);
  return true;
}
