/**
 * WhatsApp job-notify prefs (assign/unassign to technician phone, and customer notify).
 * Separate from FCM Android push prefs in pushNotificationPrefs.ts.
 */
export const TECH_WHATSAPP_CATEGORIES = [
  'job_assign',
  'job_unassign',
  'tech_assigned_customer',
  'tech_unassigned_customer',
] as const;

export type TechWhatsAppCategory = (typeof TECH_WHATSAPP_CATEGORIES)[number];

export type TechWhatsAppPrefs = Record<TechWhatsAppCategory, boolean>;

export const TECH_WHATSAPP_LABELS: Record<
  TechWhatsAppCategory,
  { label: string; description: string }
> = {
  job_assign: {
    label: 'Job assign WhatsApp (to technician)',
    description:
      'Allow WhatsApp when a job is assigned/reassigned to this technician (auto or manual per Settings).',
  },
  job_unassign: {
    label: 'Job unassign WhatsApp (to technician)',
    description:
      'Allow WhatsApp when a job is unassigned from this technician (auto or manual per Settings).',
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

export function normalizeTechWhatsAppPrefs(raw: unknown): TechWhatsAppPrefs {
  const base = defaultTechWhatsAppPrefs();
  if (!raw || typeof raw !== 'object') return base;
  for (const key of TECH_WHATSAPP_CATEGORIES) {
    if (key in (raw as Record<string, unknown>)) {
      base[key] = (raw as Record<string, boolean>)[key] !== false;
    }
  }
  return base;
}

/** Prefer explicit false; missing = allowed. */
export function isTechWhatsAppCategoryOn(
  prefs: unknown,
  category: TechWhatsAppCategory
): boolean {
  return normalizeTechWhatsAppPrefs(prefs)[category] !== false;
}
