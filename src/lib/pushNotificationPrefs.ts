export const ADMIN_PUSH_CATEGORIES = [
  'whatsapp_inbound',
  'job_status',
  'customer_calls',
  'wrong_line',
  'tech_search',
  'tech_messages',
  'tech_dismiss_acks',
  'reminders',
  'cash_check',
  'day_summary',
  'new_booking',
  'parts_reminder',
  'privacy_request',
] as const;

export const TECH_PUSH_CATEGORIES = [
  'job_assigned',
  'job_unassigned',
  'job_nudges',
  'office_messages',
  'otp_request',
  'location_ping',
  'parts_reminder',
  'bill_reminders',
  'cash_handover',
  'wrong_line',
  'pay_qr_screenshot',
  'job_reviews',
  'worked_hours',
] as const;

export type AdminPushCategory = (typeof ADMIN_PUSH_CATEGORIES)[number];
export type TechPushCategory = (typeof TECH_PUSH_CATEGORIES)[number];

export type AdminPushPrefs = Record<AdminPushCategory, boolean>;
export type TechPushPrefs = Record<TechPushCategory, boolean>;

export const ADMIN_PUSH_LABELS: Record<AdminPushCategory, { label: string; description: string }> = {
  whatsapp_inbound: {
    label: 'WhatsApp inbox',
    description:
      'When a customer sends a WhatsApp message (Admin APK push). Off = this phone stays quiet for WhatsApp; other phones still get it if their toggle is on.',
  },
  job_status: {
    label: 'Job status updates',
    description:
      'On the way, completed, OTP entered, bill missing, late bill/payment photos, tech-created jobs.',
  },
  customer_calls: {
    label: 'Customer call alerts (incl. missed)',
    description:
      'Push when a customer rings a tech/admin phone, or an admin misses a known customer call. Keep this ON for call alerts. If no phone has it on, search-alert phones are used as a fallback.',
  },
  wrong_line: {
    label: 'Wrong company-line calls',
    description:
      'Push when a technician dials a known customer from a non-company SIM. Off = this admin phone stops those alerts.',
  },
  tech_search: {
    label: 'Technician customer search',
    description: 'When a technician searches customers in the app. Separate from customer call alerts.',
  },
  tech_messages: {
    label: 'Technician message replies & opens',
    description:
      'When a technician replies to an office message, or taps open a Message technician alert.',
  },
  tech_dismiss_acks: {
    label: 'Technician saw notification',
    description:
      'Silent (no sound) ping when a technician clears a push (“saw the notification”). Off = this phone stops those acks.',
  },
  reminders: {
    label: 'Reminders & pending payments',
    description: 'Daily reminder and pending payment due alerts.',
  },
  cash_check: {
    label: 'Cash & expense evening checks',
    description: 'Cash handover Yes/No, plus daily technician/business expense review.',
  },
  day_summary: {
    label: 'Evening day summary',
    description: 'Jobs completed, collections, and open jobs count.',
  },
  new_booking: {
    label: 'New booking',
    description: 'Instant alert when someone books on the website or WhatsApp.',
  },
  parts_reminder: {
    label: 'Parts entry reminder',
    description: 'Reminder to verify parts logged for completed jobs.',
  },
  privacy_request: {
    label: 'Privacy / data requests',
    description:
      'When a customer submits access, delete, correction, or grievance via /privacy-request.',
  },
};

export const TECH_PUSH_LABELS: Record<TechPushCategory, { label: string; description: string }> = {
  job_assigned: {
    label: 'Job assign / reassign',
    description: 'New job assigned, reassigned to them, or job details updated.',
  },
  job_unassigned: {
    label: 'Job unassign / removed',
    description: 'Job unassigned from them, or moved to another technician.',
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
  cash_handover: {
    label: 'Cash handover reminders',
    description: 'Morning / evening cash handover nudges from office.',
  },
  wrong_line: {
    label: 'Wrong company-line reminder',
    description:
      'When this phone dials a customer from a non-company SIM: warn the tech and notify admins. Off = no wrong-line alerts from this phone (still needs “Detect calls” on to detect).',
  },
  pay_qr_screenshot: {
    label: 'Pay QR payment screenshots',
    description:
      'When you send a pay QR on WhatsApp, customer photos for the next 30 minutes are pushed to this phone.',
  },
  job_reviews: {
    label: 'Customer reviews',
    description: 'When a customer submits a review for one of your completed jobs.',
  },
  worked_hours: {
    label: 'Daily worked hours',
    description:
      '9:00 PM summary: hours from first Start Work to last job completed, plus driving km (office → jobs → office).',
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
