/**
 * WhatsApp CRM settings + usage / expected-bill helpers.
 * Rates are editable defaults (India Meta Cloud API ballpark — verify on Meta rate card).
 */
import { supabase } from '@/lib/supabaseClient';
import {
  isTechWhatsAppCategoryOn,
  normalizeTechPushWhatsAppGlobal,
  defaultTechPushWhatsAppGlobal,
  type TechWhatsAppCategory,
} from '@/lib/techWhatsAppPrefs';
import type { TechPushCategory } from '@/lib/pushNotificationPrefs';

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
  | 'job_completion'
  | 'booking_bot'
  | 'online_booking'
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
  /** Allow job-completion WhatsApp to customer (manual + auto). */
  allow_job_completion_whatsapp: boolean;
  /** Auto-send brand completion message after job complete (24h window). */
  auto_send_job_completion_whatsapp: boolean;
  /** Allow month-end salary-slip WhatsApp to technicians. */
  allow_salary_slip_whatsapp: boolean;
  /** Auto-send salary-slip PDFs on last calendar day (~9 PM IST). Per-tech opt-in still applies. */
  auto_send_salary_slip_whatsapp: boolean;
  /**
   * After missed customer call alert (admin/tech APK): auto-send
   * svc_missed_call (requires allow_calling).
   */
  auto_send_missed_call_whatsapp: boolean;
  /** Cloud API: online website booking confirmation to customer. */
  allow_online_booking_whatsapp: boolean;
  /** Auto-send booking confirmation WhatsApp after public /book submit. */
  auto_send_online_booking_whatsapp: boolean;
  /**
   * Mirror technician FCM categories → WhatsApp (same keys as TECH_PUSH_CATEGORIES).
   * Missing key = enabled. Assign/unassign still also gated by Dashboard master.
   */
  tech_push_whatsapp: Record<TechPushCategory, boolean>;
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
  month_key?: string;
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

export type WhatsAppUsageMonthlySnapshot = {
  month_key: string;
  cold_utility: number;
  session_messages: number;
  outbound: number;
  inbound: number;
  failed: number;
  templates: number;
  documents: number;
  text_messages: number;
  rate_utility_inr: number;
  rate_service_inr: number;
  estimated_total_inr: number;
  notes: string | null;
  updated_at: string;
};

function parseUsageStatsRaw(raw: Record<string, unknown>): WhatsAppUsageStats {
  return {
    from: String(raw.from || ''),
    to: String(raw.to || ''),
    month_key: raw.month_key ? String(raw.month_key) : undefined,
    outbound: num(raw.outbound, 0),
    inbound: num(raw.inbound, 0),
    templates: num(raw.templates, 0),
    documents: num(raw.documents, 0),
    text: num(raw.text, 0),
    failed: num(raw.failed, 0),
    delivered_or_sent: num(raw.delivered_or_sent, 0),
    cold_utility: num(raw.cold_utility, 0),
    session_messages: num(raw.session_messages, 0),
  };
}

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
  allow_job_completion_whatsapp: true,
  auto_send_job_completion_whatsapp: false,
  allow_salary_slip_whatsapp: true,
  auto_send_salary_slip_whatsapp: true,
  auto_send_missed_call_whatsapp: false,
  allow_online_booking_whatsapp: true,
  auto_send_online_booking_whatsapp: true,
  tech_push_whatsapp: defaultTechPushWhatsAppGlobal(),
  rate_utility_inr: 0.115,
  rate_marketing_inr: 0.8631,
  rate_authentication_inr: 0.115,
  rate_service_inr: 0,
  monthly_budget_inr: null,
  notes: null,
  updated_at: null,
};

const SETTINGS_COLUMNS =
  'id, enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_job_assign_whatsapp, allow_job_unassign_whatsapp, auto_send_job_assign_whatsapp, auto_send_job_unassign_whatsapp, allow_tech_assigned, allow_tech_unassigned, allow_job_completion_whatsapp, auto_send_job_completion_whatsapp, allow_salary_slip_whatsapp, auto_send_salary_slip_whatsapp, auto_send_missed_call_whatsapp, allow_online_booking_whatsapp, auto_send_online_booking_whatsapp, tech_push_whatsapp, rate_utility_inr, rate_marketing_inr, rate_authentication_inr, rate_service_inr, monthly_budget_inr, notes, updated_at';

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
    allow_job_completion_whatsapp: bool(row.allow_job_completion_whatsapp, true),
    auto_send_job_completion_whatsapp: row.auto_send_job_completion_whatsapp === true,
    allow_salary_slip_whatsapp: bool(row.allow_salary_slip_whatsapp, true),
    auto_send_salary_slip_whatsapp: row.auto_send_salary_slip_whatsapp !== false,
    auto_send_missed_call_whatsapp: row.auto_send_missed_call_whatsapp === true,
    allow_online_booking_whatsapp: bool(row.allow_online_booking_whatsapp, true),
    auto_send_online_booking_whatsapp: bool(row.auto_send_online_booking_whatsapp, true),
    tech_push_whatsapp: normalizeTechPushWhatsAppGlobal(row.tech_push_whatsapp),
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
    case 'job_completion':
      return 'allow_job_completion_whatsapp';
    case 'booking_bot':
      return 'allow_booking_bot';
    case 'online_booking':
      return 'allow_online_booking_whatsapp';
    default:
      return null;
  }
}

const GLOBAL_KEY_FOR_TECH_WA: Partial<
  Record<TechWhatsAppCategory, keyof WhatsAppCrmSettings>
> = {
  job_assigned: 'allow_job_assign_whatsapp',
  job_unassigned: 'allow_job_unassign_whatsapp',
  tech_assigned_customer: 'allow_tech_assigned',
  tech_unassigned_customer: 'allow_tech_unassigned',
};

/**
 * Global WhatsApp settings + optional per-technician whatsapp_prefs.
 * job_assigned / job_unassigned use Dashboard master + tech prefs (assign dialog/auto).
 * Other push-mirror categories use tech_push_whatsapp + tech prefs (server helper).
 */
export async function isWhatsAppJobNotifyAllowed(
  category: TechWhatsAppCategory,
  technicianId?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  if (category === 'job_assigned' || category === 'job_unassigned') {
    const { ensureJobWhatsAppNotifyPrefs } = await import(
      '@/lib/jobAssignWhatsAppSettingsCache'
    );
    const prefs = await ensureJobWhatsAppNotifyPrefs();
    if (!prefs.enabled) {
      return { ok: false, reason: 'Job WhatsApp is off (Dashboard Settings)' };
    }
  } else if (
    category === 'tech_assigned_customer' ||
    category === 'tech_unassigned_customer'
  ) {
    const { settings, error } = await fetchWhatsAppCrmSettings();
    if (error) {
      console.warn('[whatsapp] settings load:', error);
    }
    if (settings.enabled === false) {
      return { ok: false, reason: 'WhatsApp Cloud API is disabled in Settings' };
    }
    const globalKey = GLOBAL_KEY_FOR_TECH_WA[category];
    if (globalKey && settings[globalKey] === false) {
      return { ok: false, reason: 'This WhatsApp notify type is off in WhatsApp settings' };
    }
  } else {
    // Mirror categories: global tech_push_whatsapp + Cloud API master
    const { settings, error } = await fetchWhatsAppCrmSettings();
    if (error) {
      console.warn('[whatsapp] settings load:', error);
    }
    if (settings.enabled === false) {
      return { ok: false, reason: 'WhatsApp Cloud API is disabled in Settings' };
    }
    if (settings.tech_push_whatsapp?.[category as TechPushCategory] === false) {
      return { ok: false, reason: 'This push→WhatsApp category is off in WhatsApp settings' };
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

let settingsCacheMem: {
  at: number;
  ok: boolean;
  settings: WhatsAppCrmSettings;
  error?: string;
} | null = null;

const SETTINGS_CACHE_TTL_MS = 2 * 60 * 1000;
const SETTINGS_CACHE_KEY = 'wa_crm_settings_cache_v1';

export function invalidateWhatsAppCrmSettingsCache(): void {
  settingsCacheMem = null;
  try {
    sessionStorage.removeItem(SETTINGS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchWhatsAppCrmSettings(opts?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  settings: WhatsAppCrmSettings;
  error?: string;
}> {
  const now = Date.now();
  if (!opts?.force && settingsCacheMem && now - settingsCacheMem.at < SETTINGS_CACHE_TTL_MS) {
    return {
      ok: settingsCacheMem.ok,
      settings: settingsCacheMem.settings,
      error: settingsCacheMem.error,
    };
  }
  if (!opts?.force) {
    try {
      const raw = sessionStorage.getItem(SETTINGS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as typeof settingsCacheMem;
        if (parsed && now - parsed.at < SETTINGS_CACHE_TTL_MS) {
          settingsCacheMem = parsed;
          return {
            ok: parsed.ok,
            settings: parsed.settings,
            error: parsed.error,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const { data, error } = await supabase
    .from('whatsapp_crm_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    if (/allow_job_assign|auto_send_job|auto_send_missed|allow_tech_unassigned|allow_job_completion|allow_salary_slip|auto_send_salary_slip|tech_push_whatsapp|column/i.test(error.message)) {
      const legacy = await supabase
        .from('whatsapp_crm_settings')
        .select(
          'id, enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_job_assign_whatsapp, allow_job_unassign_whatsapp, auto_send_job_assign_whatsapp, auto_send_job_unassign_whatsapp, allow_tech_assigned, allow_tech_unassigned, rate_utility_inr, rate_marketing_inr, rate_authentication_inr, rate_service_inr, monthly_budget_inr, notes, updated_at'
        )
        .eq('id', 1)
        .maybeSingle();
      if (!legacy.error) {
        const settings = normalizeWhatsAppCrmSettings(legacy.data as WhatsAppCrmSettings);
        const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
          '@/lib/jobAssignWhatsAppSettingsCache'
        );
        syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
        const result = { ok: true as const, settings, at: now };
        settingsCacheMem = result;
        try {
          sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(result));
        } catch {
          /* ignore */
        }
        return { ok: true, settings };
      }
    }
    const fail = {
      ok: false as const,
      settings: { ...DEFAULT_WHATSAPP_CRM_SETTINGS },
      error: error.message,
      at: now,
    };
    settingsCacheMem = fail;
    return {
      ok: false,
      settings: fail.settings,
      error: fail.error,
    };
  }
  const settings = normalizeWhatsAppCrmSettings(data as WhatsAppCrmSettings);
  const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
    '@/lib/jobAssignWhatsAppSettingsCache'
  );
  syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
  const result = { ok: true as const, settings, at: now };
  settingsCacheMem = result;
  try {
    sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(result));
  } catch {
    /* ignore */
  }
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
    allow_job_completion_whatsapp: bool(patch.allow_job_completion_whatsapp, true),
    auto_send_job_completion_whatsapp: patch.auto_send_job_completion_whatsapp === true,
    allow_salary_slip_whatsapp: bool(patch.allow_salary_slip_whatsapp, true),
    auto_send_salary_slip_whatsapp: patch.auto_send_salary_slip_whatsapp !== false,
    auto_send_missed_call_whatsapp: patch.auto_send_missed_call_whatsapp === true,
    allow_online_booking_whatsapp: bool(patch.allow_online_booking_whatsapp, true),
    auto_send_online_booking_whatsapp: bool(patch.auto_send_online_booking_whatsapp, true),
    tech_push_whatsapp: normalizeTechPushWhatsAppGlobal(patch.tech_push_whatsapp),
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

  if (error) {
    if (/allow_salary_slip|auto_send_salary_slip/i.test(error.message)) {
      const {
        allow_salary_slip_whatsapp: _a,
        auto_send_salary_slip_whatsapp: _b,
        ...legacyPayload
      } = payload;
      const retry = await supabase
        .from('whatsapp_crm_settings')
        .update(legacyPayload)
        .eq('id', 1)
        .select(
          'id, enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_job_assign_whatsapp, allow_job_unassign_whatsapp, auto_send_job_assign_whatsapp, auto_send_job_unassign_whatsapp, allow_tech_assigned, allow_tech_unassigned, allow_job_completion_whatsapp, auto_send_job_completion_whatsapp, auto_send_missed_call_whatsapp, allow_online_booking_whatsapp, auto_send_online_booking_whatsapp, tech_push_whatsapp, rate_utility_inr, rate_marketing_inr, rate_authentication_inr, rate_service_inr, monthly_budget_inr, notes, updated_at'
        )
        .single();
      if (retry.error) return { ok: false, error: retry.error.message };
      const settings = normalizeWhatsAppCrmSettings(retry.data as WhatsAppCrmSettings);
      const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
        '@/lib/jobAssignWhatsAppSettingsCache'
      );
      syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
      const cached = { ok: true as const, settings, at: Date.now() };
      settingsCacheMem = cached;
      try {
        sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(cached));
      } catch {
        /* ignore */
      }
      return { ok: true, settings };
    }
    return { ok: false, error: error.message };
  }
  const settings = normalizeWhatsAppCrmSettings(data as WhatsAppCrmSettings);
  const { syncJobWhatsAppNotifyCacheFromCrmSettings } = await import(
    '@/lib/jobAssignWhatsAppSettingsCache'
  );
  syncJobWhatsAppNotifyCacheFromCrmSettings(settings);
  const cached = { ok: true as const, settings, at: Date.now() };
  settingsCacheMem = cached;
  try {
    sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(cached));
  } catch {
    /* ignore */
  }
  return { ok: true, settings };
}

export async function fetchWhatsAppUsageStats(
  fromIso?: string,
  toIso?: string
): Promise<{
  ok: boolean;
  stats: WhatsAppUsageStats | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('whatsapp_usage_stats', {
    p_from: fromIso || null,
    p_to: toIso || null,
  });
  if (!error && data) {
    return {
      ok: true,
      stats: parseUsageStatsRaw((data || {}) as Record<string, unknown>),
    };
  }

  if (toIso) {
    return { ok: false, stats: null, error: error?.message || 'Could not load usage stats' };
  }

  const legacy = await supabase.rpc('whatsapp_usage_stats', {
    p_from: fromIso || null,
  });
  if (legacy.error) return { ok: false, stats: null, error: legacy.error.message };
  return {
    ok: true,
    stats: parseUsageStatsRaw((legacy.data || {}) as Record<string, unknown>),
  };
}

/** Calendar month (IST boundaries) — matches Meta monthly billing view. */
export async function fetchWhatsAppUsageForMonth(
  year: number,
  month: number
): Promise<{ ok: boolean; stats: WhatsAppUsageStats | null; error?: string }> {
  const { from, to, monthKey } = istMonthRangeIso(year, month);

  const { data, error } = await supabase.rpc('whatsapp_usage_stats_for_month', {
    p_month: month,
    p_year: year,
  });

  if (!error && data) {
    return {
      ok: true,
      stats: parseUsageStatsRaw((data || {}) as Record<string, unknown>),
    };
  }

  // Fallback when monthly RPC not migrated yet — use date-range stats.
  const range = await fetchWhatsAppUsageStats(from, to);
  if (!range.ok || !range.stats) {
    return {
      ok: false,
      stats: null,
      error: error?.message || range.error || 'Could not load monthly usage',
    };
  }
  return {
    ok: true,
    stats: { ...range.stats, month_key: monthKey },
  };
}

export async function fetchWhatsAppUsageMonthlyHistory(limit = 12): Promise<{
  ok: boolean;
  rows: WhatsAppUsageMonthlySnapshot[];
  error?: string;
}> {
  const { data, error } = await supabase.rpc('whatsapp_usage_monthly_list', {
    p_limit: limit,
  });
  if (error) return { ok: false, rows: [], error: error.message };
  const rows = (data || []) as WhatsAppUsageMonthlySnapshot[];
  return { ok: true, rows };
}

/** Persist / refresh monthly counts + estimated bill from whatsapp_messages. */
export async function refreshWhatsAppUsageMonth(monthKey?: string): Promise<{
  ok: boolean;
  snapshot: WhatsAppUsageMonthlySnapshot | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('whatsapp_usage_monthly_refresh', {
    p_month_key: monthKey || null,
  });
  if (error) {
    const msg = error.message || '';
    if (/whatsapp_usage_monthly|schema cache|could not find/i.test(msg)) {
      return {
        ok: false,
        snapshot: null,
        error:
          'Monthly snapshot not available yet — run scripts/add-whatsapp-usage-monthly.sql in Supabase SQL editor.',
      };
    }
    return { ok: false, snapshot: null, error: msg };
  }
  return { ok: true, snapshot: (data || null) as WhatsAppUsageMonthlySnapshot | null };
}

export function parseMonthKey(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** IST calendar month → ISO range for whatsapp_usage_stats fallback. */
export function istMonthRangeIso(year: number, month: number): { from: string; to: string; monthKey: string } {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const from = `${monthKey}-01T00:00:00+05:30`;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`;
  return { from, to, monthKey };
}

export function currentMonthKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  return `${y}-${m}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return currentMonthKey();
  const d = new Date(parsed.year, parsed.month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Auto-save a monthly snapshot for history.
 * Current month: refresh when missing or older than 4h.
 * Past months: save once if no snapshot exists yet.
 */
export async function maybeAutoRefreshWhatsAppUsageMonth(
  monthKey: string,
  existing: WhatsAppUsageMonthlySnapshot | null,
  maxAgeMs = 4 * 60 * 60 * 1000
): Promise<boolean> {
  const isCurrent = monthKey === currentMonthKey();
  if (!isCurrent) {
    if (existing) return false;
    const result = await refreshWhatsAppUsageMonth(monthKey);
    return result.ok;
  }
  const updatedAt = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0;
  const stale = !existing || !Number.isFinite(updatedAt) || Date.now() - updatedAt > maxAgeMs;
  if (!stale) return false;
  const result = await refreshWhatsAppUsageMonth(monthKey);
  return result.ok;
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
    /** When true, do not extrapolate — total is the full period (e.g. calendar month). */
    actualPeriodBill?: boolean;
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
  const projectedMonthly = opts?.actualPeriodBill ? total : (total / windowDays) * 30;
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
