/**
 * Per-technician WhatsApp prefs.
 * Technician-facing keys mirror TECH_PUSH_CATEGORIES (push ↔ WhatsApp parity).
 * Plus customer-facing assign/unassign share toggles.
 */
import {
  TECH_PUSH_CATEGORIES,
  TECH_PUSH_LABELS,
  type TechPushCategory,
} from '@/lib/pushNotificationPrefs';

export const TECH_WHATSAPP_PUSH_CATEGORIES = TECH_PUSH_CATEGORIES;

export const TECH_WHATSAPP_CUSTOMER_CATEGORIES = [
  'tech_assigned_customer',
  'tech_unassigned_customer',
] as const;

export const TECH_WHATSAPP_CATEGORIES = [
  ...TECH_WHATSAPP_PUSH_CATEGORIES,
  ...TECH_WHATSAPP_CUSTOMER_CATEGORIES,
] as const;

export type TechWhatsAppPushCategory = TechPushCategory;
export type TechWhatsAppCustomerCategory = (typeof TECH_WHATSAPP_CUSTOMER_CATEGORIES)[number];
export type TechWhatsAppCategory = (typeof TECH_WHATSAPP_CATEGORIES)[number];

export type TechWhatsAppPrefs = Record<TechWhatsAppCategory, boolean>;

/** Push-mirror WhatsApp is off — those alerts stay on the technician app only. */
export const TECH_WHATSAPP_AUTO_MIRROR_CATEGORIES = [] as const satisfies readonly TechPushCategory[];

/** Toggles shown on Edit technician / WhatsApp settings (not app-only alerts). */
export const TECH_WHATSAPP_EDITABLE_CATEGORIES = [
  'job_assigned',
  'job_unassigned',
  'tech_assigned_customer',
  'tech_unassigned_customer',
] as const satisfies readonly TechWhatsAppCategory[];

export type TechWhatsAppAutoMirrorCategory =
  (typeof TECH_WHATSAPP_AUTO_MIRROR_CATEGORIES)[number];

export const TECH_WHATSAPP_LABELS: Record<
  TechWhatsAppCategory,
  { label: string; description: string }
> = {
  job_assigned: {
    label: TECH_PUSH_LABELS.job_assigned.label + ' (WhatsApp)',
    description:
      'WhatsApp when a job is assigned/reassigned (auto or manual). Master: Dashboard Settings.',
  },
  job_unassigned: {
    label: TECH_PUSH_LABELS.job_unassigned.label + ' (WhatsApp)',
    description:
      'WhatsApp when a job is unassigned/removed. Master: Dashboard Settings.',
  },
  job_nudges: {
    label: TECH_PUSH_LABELS.job_nudges.label + ' (WhatsApp)',
    description: 'Same alerts as push: call customer, are you going?, start job, photo nudges.',
  },
  office_messages: {
    label: TECH_PUSH_LABELS.office_messages.label + ' (WhatsApp)',
    description: 'Same as push: office messages and replyable job nudges.',
  },
  otp_request: {
    label: TECH_PUSH_LABELS.otp_request.label + ' (WhatsApp)',
    description: 'When admin asks for customer OTP — also WhatsApp the tech.',
  },
  location_ping: {
    label: TECH_PUSH_LABELS.location_ping.label + ' (WhatsApp)',
    description: 'Not used for WhatsApp (silent GPS ping only). Toggle kept for prefs parity.',
  },
  parts_reminder: {
    label: TECH_PUSH_LABELS.parts_reminder.label + ' (WhatsApp)',
    description: 'Evening parts reminder — also WhatsApp when enabled.',
  },
  bill_reminders: {
    label: TECH_PUSH_LABELS.bill_reminders.label + ' (WhatsApp)',
    description: 'Missing bill photo reminder — also WhatsApp when enabled.',
  },
  cash_handover: {
    label: TECH_PUSH_LABELS.cash_handover.label + ' (WhatsApp)',
    description: 'Cash handover nudges — also WhatsApp when enabled.',
  },
  wrong_line: {
    label: TECH_PUSH_LABELS.wrong_line.label + ' (WhatsApp)',
    description: 'Wrong company-line reminder — also WhatsApp when enabled.',
  },
  pay_qr_screenshot: {
    label: TECH_PUSH_LABELS.pay_qr_screenshot.label + ' (WhatsApp)',
    description:
      'Payment screenshot after you send a pay QR — also WhatsApp when enabled (photo when the 24h window is open).',
  },
  worked_hours: {
    label: TECH_PUSH_LABELS.worked_hours.label + ' (WhatsApp)',
    description: '9:00 PM hours + travel km summary — also WhatsApp when enabled.',
  },
  job_reviews: {
    label: TECH_PUSH_LABELS.job_reviews.label + ' (WhatsApp)',
    description: 'When a customer rates your visit — also WhatsApp when enabled.',
  },
  tech_assigned_customer: {
    label: 'Technician assigned (to customer)',
    description: 'Share technician details to the customer via Cloud API / template.',
  },
  tech_unassigned_customer: {
    label: 'Technician unassigned (to customer)',
    description: 'Notify the customer on WhatsApp when their technician is removed (when you send it).',
  },
};

export function defaultTechWhatsAppPrefs(): TechWhatsAppPrefs {
  return Object.fromEntries(TECH_WHATSAPP_CATEGORIES.map((k) => [k, true])) as TechWhatsAppPrefs;
}

/** Legacy keys from early job-only WhatsApp prefs. */
const LEGACY_KEY_MAP: Record<string, TechWhatsAppCategory> = {
  job_assign: 'job_assigned',
  job_unassign: 'job_unassigned',
};

export function normalizeTechWhatsAppPrefs(raw: unknown): TechWhatsAppPrefs {
  const base = defaultTechWhatsAppPrefs();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;

  for (const [legacy, modern] of Object.entries(LEGACY_KEY_MAP)) {
    if (legacy in obj && !(modern in obj)) {
      base[modern] = obj[legacy] !== false;
    }
  }

  for (const key of TECH_WHATSAPP_CATEGORIES) {
    if (key in obj) {
      base[key] = obj[key] !== false;
    }
  }
  return base;
}

export function isTechWhatsAppCategoryOn(
  prefs: unknown,
  category: TechWhatsAppCategory
): boolean {
  return normalizeTechWhatsAppPrefs(prefs)[category] !== false;
}

export function defaultTechPushWhatsAppGlobal(): Record<TechPushCategory, boolean> {
  return Object.fromEntries(TECH_PUSH_CATEGORIES.map((k) => [k, true])) as Record<
    TechPushCategory,
    boolean
  >;
}

export function normalizeTechPushWhatsAppGlobal(raw: unknown): Record<TechPushCategory, boolean> {
  const base = defaultTechPushWhatsAppGlobal();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  for (const key of TECH_PUSH_CATEGORIES) {
    if (key in obj) base[key] = obj[key] !== false;
  }
  // Legacy allow columns may be synced separately; accept old nested keys.
  if ('job_assign' in obj && !('job_assigned' in obj)) {
    base.job_assigned = obj.job_assign !== false;
  }
  if ('job_unassign' in obj && !('job_unassigned' in obj)) {
    base.job_unassigned = obj.job_unassign !== false;
  }
  return base;
}
