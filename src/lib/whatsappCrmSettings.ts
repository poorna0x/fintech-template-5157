/**
 * WhatsApp CRM settings + usage / expected-bill helpers.
 * Rates are editable defaults (India Meta Cloud API ballpark — verify on Meta rate card).
 */
import { supabase } from '@/lib/supabaseClient';
import {
  isTechWhatsAppCategoryOn,
  type TechWhatsAppCategory,
} from '@/lib/techWhatsAppPrefs';

/** CRM surfaces that can send via Cloud API (passed as `source` to whatsapp-send). */
export type WhatsAppSendSource =
  | 'inbox'
  | 'calling'
  | 'service_reminder'
  | 'pending_payment'
  | 'documents'
  | 'composer'
  | 'tech_assigned'
  | 'tech_unassigned'
  | 'booking_bot'
  | 'other';

export type WhatsAppCrmSettings = {
  id: number;
  enabled: boolean;
  allow_cold_templates: boolean;
  allow_pdf_send: boolean;
  allow_freeform: boolean;
  allow_booking_bot: boolean;
  allow_inbox: boolean;
  allow_calling: boolean;
  allow_service_reminder: boolean;
  allow_pending_payment: boolean;
  allow_documents: boolean;
  allow_composer: boolean;
  /** WhatsApp to technician phone on assign (dialog or auto). */
  allow_job_assign_whatsapp: boolean;
  /** WhatsApp to technician phone on unassign (dialog or auto). */
  allow_job_unassign_whatsapp: boolean;
  /** When true, assign/reassign sends WhatsApp instantly (no Send click). */
  auto_send_job_assign_whatsapp: boolean;
  /** When true, unassign sends WhatsApp instantly (no Send click). */
  auto_send_job_unassign_whatsapp: boolean;
  /** Cloud API: share tech details to customer. */
  allow_tech_assigned: boolean;
  /** Cloud API: notify customer tech was removed. */
  allow_tech_unassigned: boolean;
  rate_utility_inr: number;
  rate_marketing_inr: number;
  rate_authentication_inr: number;
  rate_service_inr: number;
  monthly_budget_inr: number | null;
  notes: string | null;
  updated_at: string | null;
};

export type WhatsAppUsageStats = {
  from: string;
  to: string;
  outbound: number;
  inbound: number;
  templates: number;
  documents: number;
  text: number;
  failed: number;
  delivered_or_sent: number;
  cold_utility: number;
  session_messages: number;
};

export const DEFAULT_WHATSAPP_CRM_SETTINGS: WhatsAppCrmSettings = {
  id: 1,
  enabled: true,
  allow_cold_templates: true,
  allow_pdf_send: true,
  allow_freeform: true,
  allow_booking_bot: true,
  allow_inbox: true,
  allow_calling: true,
  allow_service_reminder: true,
  allow_pending_payment: true,
  allow_documents: true,
  allow_composer: true,
  allow_job_assign_whatsapp: true,
  allow_job_unassign_whatsapp: true,
  auto_send_job_assign_whatsapp: false,
  auto_send_job_unassign_whatsapp: false,
  allow_tech_assigned: true,
  allow_tech_unassigned: true,
  rate_utility_inr: 0.115,
  rate_marketing_inr: 0.8631,
  rate_authentication_inr: 0.115,
  rate_service_inr: 0,
  monthly_budget_inr: null,
  notes: null,
  updated_at: null,
};

const SETTINGS_COLUMNS =
  'id, enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_job_assign_whatsapp, allow_job_unassign_whatsapp, auto_send_job_assign_whatsapp, auto_send_job_unassign_whatsapp, allow_tech_assigned, allow_tech_unassigned, rate_utility_inr, rate_marketing_inr, rate_authentication_inr, rate_service_inr, monthly_budget_inr, notes, updated_at';

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback = true): boolean {
  if (v === false) return false;
  if (v === true) return true;
  return fallback;
}

export function normalizeWhatsAppCrmSettings(
  row: Partial<WhatsAppCrmSettings> | null | undefined
): WhatsAppCrmSettings {
  const d = DEFAULT_WHATSAPP_CRM_SETTINGS;
  if (!row) return { ...d };
  return {
    id: 1,
    enabled: bool(row.enabled, true),
    allow_cold_templates: bool(row.allow_cold_templates, true),
    allow_pdf_send: bool(row.allow_pdf_send, true),
    allow_freeform: bool(row.allow_freeform, true),
    allow_booking_bot: bool(row.allow_booking_bot, true),
    allow_inbox: bool(row.allow_inbox, true),
    allow_calling: bool(row.allow_calling, true),
    allow_service_reminder: bool(row.allow_service_reminder, true),
    allow_pending_payment: bool(row.allow_pending_payment, true),
    allow_documents: bool(row.allow_documents, true),
    allow_composer: bool(row.allow_composer, true),
    allow_job_assign_whatsapp: bool(row.allow_job_assign_whatsapp, true),
    allow_job_unassign_whatsapp: bool(row.allow_job_unassign_whatsapp, true),
    auto_send_job_assign_whatsapp: row.auto_send_job_assign_whatsapp === true,
    auto_send_job_unassign_whatsapp: row.auto_send_job_unassign_whatsapp === true,
    allow_tech_assigned: bool(row.allow_tech_assigned, true),
    allow_tech_unassigned: bool(row.allow_tech_unassigned, true),
    rate_utility_inr: num(row.rate_utility_inr, d.rate_utility_inr),
    rate_marketing_inr: num(row.rate_marketing_inr, d.rate_marketing_inr),
    rate_authentication_inr: num(row.rate_authentication_inr, d.rate_authentication_inr),
    rate_service_inr: num(row.rate_service_inr, d.rate_service_inr),
    monthly_budget_inr:
      row.monthly_budget_inr == null || row.monthly_budget_inr === ('' as unknown)
        ? null
        : num(row.monthly_budget_inr, 0),
    notes: row.notes ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/** Map Cloud API send `source` → settings column. */
export function settingsKeyForSendSource(
  source: WhatsAppSendSource | string | null | undefined
): keyof WhatsAppCrmSettings | null {
  switch (String(source || '').trim()) {
    case 'inbox':
      return 'allow_inbox';
    case 'calling':
      return 'allow_calling';
    case 'service_reminder':
      return 'allow_service_reminder';
    case 'pending_payment':
      return 'allow_pending_payment';
    case 'documents':
      return 'allow_documents';
    case 'composer':
      return 'allow_composer';
    case 'tech_assigned':
      return 'allow_tech_assigned';
    case 'tech_unassigned':
      return 'allow_tech_unassigned';
    case 'booking_bot':
      return 'allow_booking_bot';
    default:
      return null;
  }
}

const GLOBAL_KEY_FOR_TECH_WA: Record<
  TechWhatsAppCategory,
  keyof WhatsAppCrmSettings
> = {
  job_assign: 'allow_job_assign_whatsapp',
  job_unassign: 'allow_job_unassign_whatsapp',
  tech_assigned_customer: 'allow_tech_assigned',
  tech_unassigned_customer: 'allow_tech_unassigned',
};

/**
 * Global WhatsApp settings + optional per-technician whatsapp_prefs.
 * job_assign / job_unassign = technician phone WhatsApp.
 * Master enable lives in Dashboard Settings (cached); auto-send in WhatsApp Settings.
 * Manual dialog is wa.me only. Customer Cloud API categories still require master `enabled`.
 */
export async function isWhatsAppJobNotifyAllowed(
  category: TechWhatsAppCategory,
  technicianId?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  if (category === 'job_assign' || category === 'job_unassign') {
    const { ensureJobWhatsAppNotifyPrefs } = await import(
      '@/lib/jobAssignWhatsAppSettingsCache'
    );
    const prefs = await ensureJobWhatsAppNotifyPrefs();
    if (!prefs.enabled) {
      return { ok: false, reason: 'Job WhatsApp is off (Dashboard Settings)' };
    }
  } else {
    const { settings, error } = await fetchWhatsAppCrmSettings();
    if (error) {
      console.warn('[whatsapp] settings load:', error);
    }

    const needsCloudMaster =
      category === 'tech_assigned_customer' || category === 'tech_unassigned_customer';
    if (needsCloudMaster && settings.enabled === false) {
      return { ok: false, reason: 'WhatsApp Cloud API is disabled in Settings' };
    }

    const globalKey = GLOBAL_KEY_FOR_TECH_WA[category];
    if (settings[globalKey] === false) {
      return { ok: false, reason: 'This WhatsApp notify type is off in WhatsApp settings' };
    }
  }

  if (technicianId) {
    const { data, error: techErr } = await supabase
      .from('technicians')
      .select('whatsapp_prefs')
      .eq('id', technicianId)
      .maybeSingle();
    if (techErr) {
      console.warn('[whatsapp] tech prefs:', techErr.message);
    } else if (!isTechWhatsAppCategoryOn(data?.whatsapp_prefs, category)) {
      return { ok: false, reason: 'WhatsApp notify disabled for this technician' };
    }
  }
  return { ok: true };
}

export async function fetchWhatsAppCrmSettings(): Promise<{
  ok: boolean;
  settings: WhatsAppCrmSettings;
  error?: string;
}> {
  const { data, error } = await supabase
    .from('whatsapp_crm_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    if (/allow_job_assign|auto_send_job|allow_tech_unassigned|column/i.test(error.message)) {
      const legacy = await supabase
        .from('whatsapp_crm_settings')
        .select(
          'id, enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_tech_assigned, rate_utility_inr, rate_marketing_inr, rate_authentication_inr, rate_service_inr, monthly_budget_inr, notes, updated_at'
        )
        .eq('id', 1)
        .maybeSingle();
      if (!legacy.error) {
        const settings = normalizeWhatsAppCrmSettings(legacy.data as WhatsAppCrmSettings);
        const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
          '@/lib/jobAssignWhatsAppSettingsCache'
        );
        syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
        return { ok: true, settings };
      }
    }
    return {
      ok: false,
      settings: { ...DEFAULT_WHATSAPP_CRM_SETTINGS },
      error: error.message,
    };
  }
  const settings = normalizeWhatsAppCrmSettings(data as WhatsAppCrmSettings);
  const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
    '@/lib/jobAssignWhatsAppSettingsCache'
  );
  syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
  return { ok: true, settings };
}

export async function saveWhatsAppCrmSettings(
  patch: Partial<WhatsAppCrmSettings>
): Promise<{ ok: boolean; settings?: WhatsAppCrmSettings; error?: string }> {
  const payload = {
    enabled: bool(patch.enabled, true),
    allow_cold_templates: bool(patch.allow_cold_templates, true),
    allow_pdf_send: bool(patch.allow_pdf_send, true),
    allow_freeform: bool(patch.allow_freeform, true),
    allow_booking_bot: bool(patch.allow_booking_bot, true),
    allow_inbox: bool(patch.allow_inbox, true),
    allow_calling: bool(patch.allow_calling, true),
    allow_service_reminder: bool(patch.allow_service_reminder, true),
    allow_pending_payment: bool(patch.allow_pending_payment, true),
    allow_documents: bool(patch.allow_documents, true),
    allow_composer: bool(patch.allow_composer, true),
    allow_job_assign_whatsapp: bool(patch.allow_job_assign_whatsapp, true),
    allow_job_unassign_whatsapp: bool(patch.allow_job_unassign_whatsapp, true),
    auto_send_job_assign_whatsapp: patch.auto_send_job_assign_whatsapp === true,
    auto_send_job_unassign_whatsapp: patch.auto_send_job_unassign_whatsapp === true,
    allow_tech_assigned: bool(patch.allow_tech_assigned, true),
    allow_tech_unassigned: bool(patch.allow_tech_unassigned, true),
    rate_utility_inr: num(patch.rate_utility_inr, DEFAULT_WHATSAPP_CRM_SETTINGS.rate_utility_inr),
    rate_marketing_inr: num(
      patch.rate_marketing_inr,
      DEFAULT_WHATSAPP_CRM_SETTINGS.rate_marketing_inr
    ),
    rate_authentication_inr: num(
      patch.rate_authentication_inr,
      DEFAULT_WHATSAPP_CRM_SETTINGS.rate_authentication_inr
    ),
    rate_service_inr: num(patch.rate_service_inr, DEFAULT_WHATSAPP_CRM_SETTINGS.rate_service_inr),
    monthly_budget_inr:
      patch.monthly_budget_inr == null || Number.isNaN(Number(patch.monthly_budget_inr))
        ? null
        : num(patch.monthly_budget_inr, 0),
    notes: patch.notes?.trim() ? patch.notes.trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('whatsapp_crm_settings')
    .update(payload)
    .eq('id', 1)
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  const settings = normalizeWhatsAppCrmSettings(data as WhatsAppCrmSettings);
  const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
    '@/lib/jobAssignWhatsAppSettingsCache'
  );
  syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
  return { ok: true, settings };
}

export async function fetchWhatsAppUsageStats(fromIso?: string): Promise<{
  ok: boolean;
  stats: WhatsAppUsageStats | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('whatsapp_usage_stats', {
    p_from: fromIso || null,
  });
  if (error) return { ok: false, stats: null, error: error.message };
  const raw = (data || {}) as Record<string, unknown>;
  return {
    ok: true,
    stats: {
      from: String(raw.from || ''),
      to: String(raw.to || ''),
      outbound: num(raw.outbound, 0),
      inbound: num(raw.inbound, 0),
      templates: num(raw.templates, 0),
      documents: num(raw.documents, 0),
      text: num(raw.text, 0),
      failed: num(raw.failed, 0),
      delivered_or_sent: num(raw.delivered_or_sent, 0),
      cold_utility: num(raw.cold_utility, 0),
      session_messages: num(raw.session_messages, 0),
    },
  };
}

export type WhatsAppBillEstimate = {
  utilityCost: number;
  marketingCost: number;
  authenticationCost: number;
  serviceCost: number;
  total: number;
  projectedMonthly: number;
  overBudget: boolean;
};

export function estimateWhatsAppBill(
  settings: WhatsAppCrmSettings,
  stats: WhatsAppUsageStats,
  opts?: {
    marketingCount?: number;
    authenticationCount?: number;
    windowDays?: number;
  }
): WhatsAppBillEstimate {
  const marketingCount = opts?.marketingCount ?? 0;
  const authenticationCount = opts?.authenticationCount ?? 0;
  const utilityCount = Math.max(0, stats.cold_utility - marketingCount - authenticationCount);
  const sessionCount = stats.session_messages;

  const utilityCost = utilityCount * settings.rate_utility_inr;
  const marketingCost = marketingCount * settings.rate_marketing_inr;
  const authenticationCost = authenticationCount * settings.rate_authentication_inr;
  const serviceCost = sessionCount * settings.rate_service_inr;
  const total = utilityCost + marketingCost + authenticationCost + serviceCost;

  const windowDays = Math.max(1, opts?.windowDays ?? 7);
  const projectedMonthly = (total / windowDays) * 30;
  const budget = settings.monthly_budget_inr;
  const overBudget = budget != null && budget > 0 && projectedMonthly > budget;

  return {
    utilityCost,
    marketingCost,
    authenticationCost,
    serviceCost,
    total,
    projectedMonthly,
    overBudget,
  };
}

export function formatInr(amount: number, digits = 2): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
