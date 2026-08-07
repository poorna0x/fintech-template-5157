/**
 * WhatsApp CRM settings + usage / expected-bill helpers.
 * Rates are editable defaults (India Meta Cloud API ballpark — verify on Meta rate card).
 */
import { supabase } from '@/lib/supabaseClient';

export type WhatsAppCrmSettings = {
  id: number;
  enabled: boolean;
  allow_cold_templates: boolean;
  allow_pdf_send: boolean;
  allow_freeform: boolean;
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
  rate_utility_inr: 0.115,
  rate_marketing_inr: 0.8631,
  rate_authentication_inr: 0.115,
  rate_service_inr: 0,
  monthly_budget_inr: null,
  notes: null,
  updated_at: null,
};

const SETTINGS_COLUMNS =
  'id, enabled, allow_cold_templates, allow_pdf_send, allow_freeform, rate_utility_inr, rate_marketing_inr, rate_authentication_inr, rate_service_inr, monthly_budget_inr, notes, updated_at';

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeWhatsAppCrmSettings(
  row: Partial<WhatsAppCrmSettings> | null | undefined
): WhatsAppCrmSettings {
  const d = DEFAULT_WHATSAPP_CRM_SETTINGS;
  if (!row) return { ...d };
  return {
    id: 1,
    enabled: row.enabled !== false,
    allow_cold_templates: row.allow_cold_templates !== false,
    allow_pdf_send: row.allow_pdf_send !== false,
    allow_freeform: row.allow_freeform !== false,
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
    return {
      ok: false,
      settings: { ...DEFAULT_WHATSAPP_CRM_SETTINGS },
      error: error.message,
    };
  }
  return { ok: true, settings: normalizeWhatsAppCrmSettings(data as WhatsAppCrmSettings) };
}

export async function saveWhatsAppCrmSettings(
  patch: Partial<WhatsAppCrmSettings>
): Promise<{ ok: boolean; settings?: WhatsAppCrmSettings; error?: string }> {
  const payload = {
    enabled: patch.enabled !== false,
    allow_cold_templates: patch.allow_cold_templates !== false,
    allow_pdf_send: patch.allow_pdf_send !== false,
    allow_freeform: patch.allow_freeform !== false,
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
  return { ok: true, settings: normalizeWhatsAppCrmSettings(data as WhatsAppCrmSettings) };
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
  /** Rough monthly projection from the stats window (default 7d → ×30/7). */
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
