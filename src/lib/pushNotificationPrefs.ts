export const ADMIN_PUSH_CATEGORIES = [
  'job_status',
  'customer_calls',
  'tech_search',
  'tech_messages',
  'reminders',
  'cash_check',
  'day_summary',
  'new_booking',
  'parts_reminder',
] as const;

export const TECH_PUSH_CATEGORIES = [
  'job_assigned',
  'job_nudges',
  'office_messages',
  'otp_request',
  'location_ping',
  'parts_reminder',
  'bill_reminders',
] as const;

export type AdminPushCategory = (typeof ADMIN_PUSH_CATEGORIES)[number];
export type TechPushCategory = (typeof TECH_PUSH_CATEGORIES)[number];

export type AdminPushPrefs = Record<AdminPushCategory, boolean>;
export type TechPushPrefs = Record<TechPushCategory, boolean>;

export const ADMIN_PUSH_LABELS: Record<AdminPushCategory, { label: string; description: string }> = {
  job_status: {
    label: 'Job status updates',
    description: 'On the way, completed, OTP entered, bill missing, tech-created jobs.',
  },
  customer_calls: {
    label: 'Customer call alerts (incl. missed)',
    description:
      'Push when a customer rings a tech/admin phone, or an admin misses a known customer call. Turn this OFF to stop receiving those notifications.',
  },
  tech_search: {
    label: 'Technician customer search',
    description: 'When a technician searches customers in the app.',
  },
  tech_messages: {
    label: 'Technician message replies',
    description: 'When a technician replies to an office message.',
  },
  reminders: {
    label: 'Reminders & pending payments',
    description: 'Daily reminder and pending payment due alerts.',
  },
  cash_check: {
    label: 'Cash collection check',
    description: 'Evening cash handover Yes/No prompts.',
  },
  day_summary: {
    label: 'Evening day summary',
    description: 'Jobs completed, collections, and open jobs count.',
  },
  new_booking: {
    label: 'New website booking',
    description: 'Instant alert when someone books on the website.',
  },
  parts_reminder: {
    label: 'Parts entry reminder',
    description: 'Reminder to verify parts logged for completed jobs.',
  },
};

export const TECH_PUSH_LABELS: Record<TechPushCategory, { label: string; description: string }> = {
  job_assigned: {
    label: 'Job assign / reassign',
    description: 'New job or reassignment notifications.',
  },
  job_nudges: {
    label: 'Job nudges',
    description: '“Are you going?”, “Call customer”, start-job prompts.',
  },
  office_messages: {
    label: 'Office messages',
    description: 'Messages from admin with inline reply.',
  },
  otp_request: {
    label: 'OTP requests',
    description: 'When admin asks for customer OTP at start of work.',
  },
  location_ping: {
    label: 'Location ping',
    description: 'When admin requests live location update.',
  },
  parts_reminder: {
    label: 'Parts entry reminder',
    description: 'Reminder to log parts after completing jobs.',
  },
  bill_reminders: {
    label: 'Bill photo reminders',
    description: 'When bill photo is missing after job completion.',
  },
};

export function defaultAdminPushPrefs(): AdminPushPrefs {
  return Object.fromEntries(ADMIN_PUSH_CATEGORIES.map((k) => [k, true])) as AdminPushPrefs;
}

export function defaultTechPushPrefs(): TechPushPrefs {
  return Object.fromEntries(TECH_PUSH_CATEGORIES.map((k) => [k, true])) as TechPushPrefs;
}

export function normalizeAdminPushPrefs(raw: unknown): AdminPushPrefs {
  const base = defaultAdminPushPrefs();
  if (!raw || typeof raw !== 'object') return base;
  for (const key of ADMIN_PUSH_CATEGORIES) {
    if (key in (raw as Record<string, unknown>)) {
      base[key] = (raw as Record<string, boolean>)[key] !== false;
    }
  }
  return base;
}

export function normalizeTechPushPrefs(raw: unknown): TechPushPrefs {
  const base = defaultTechPushPrefs();
  if (!raw || typeof raw !== 'object') return base;
  for (const key of TECH_PUSH_CATEGORIES) {
    if (key in (raw as Record<string, unknown>)) {
      base[key] = (raw as Record<string, boolean>)[key] !== false;
    }
  }
  return base;
}

export function countEnabledPrefs(prefs: Record<string, boolean>): number {
  return Object.values(prefs).filter(Boolean).length;
}
