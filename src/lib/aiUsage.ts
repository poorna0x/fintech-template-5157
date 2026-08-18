import { ensureAdminSupabaseSession } from '@/lib/auth';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type AiUsagePeriod = {
  requests: number;
  ok: number;
  error: number;
  pending: number;
  inputTokens: number;
  outputTokens: number;
  fallbackCount: number;
  byModel: Array<{ model: string; count: number }>;
  byOperation: Array<{ operation: string; count: number }>;
  byErrorCategory: Array<{ category: string; count: number }>;
};

export type AiProviderFreeTiers = {
  provider: string;
  model: string;
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number | null;
  resetTimezone: string;
  resetNote: string;
};

export type AiUsageConfig = {
  provider?: string;
  model?: string;
  fallbackChain?: Array<{ provider: string; model: string }>;
  dailyRequestLimit?: number;
  dailyTokenLimit?: number;
  geminiConfigured?: boolean;
  groqConfigured?: boolean;
  configured?: boolean;
  providerFreeTiers?: AiProviderFreeTiers | null;
};

export type AiSelectableModels = {
  providers: string[];
  models: Record<string, string[]>;
  defaults: Record<string, string>;
};

export type AiUsageSnapshot = {
  ok: true;
  tracking: 'crm';
  timezone: string;
  dayKey: string;
  monthStart: string;
  fallbackTracked: boolean;
  tablesInstalled: boolean;
  config: AiUsageConfig | null;
  selectable: AiSelectableModels;
  today: AiUsagePeriod;
  month: AiUsagePeriod;
  myToday: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    reservedTokens: number;
    requestLimit: number;
    tokenLimit: number;
    requestsRemaining: number;
    tokensRemaining: number;
  };
  notes: string[];
  generatedAt?: string;
};

export type AiUsageResult =
  | AiUsageSnapshot
  | { ok: false; error: string };

export type AiConfigSaveResult =
  | { ok: true; config: AiUsageConfig | null; selectable: AiSelectableModels }
  | { ok: false; error: string };

async function authHeaders(): Promise<HeadersInit | null> {
  await ensureAdminSupabaseSession();
  const token = await resolveSupabaseAccessTokenForApi();
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function emptyPeriod(): AiUsagePeriod {
  return {
    requests: 0,
    ok: 0,
    error: 0,
    pending: 0,
    inputTokens: 0,
    outputTokens: 0,
    fallbackCount: 0,
    byModel: [],
    byOperation: [],
    byErrorCategory: [],
  };
}

function parsePeriod(raw: unknown): AiUsagePeriod {
  if (!raw || typeof raw !== 'object') return emptyPeriod();
  const row = raw as Record<string, unknown>;
  return {
    requests: Math.max(0, Number(row.requests) || 0),
    ok: Math.max(0, Number(row.ok) || 0),
    error: Math.max(0, Number(row.error) || 0),
    pending: Math.max(0, Number(row.pending) || 0),
    inputTokens: Math.max(0, Number(row.inputTokens) || 0),
    outputTokens: Math.max(0, Number(row.outputTokens) || 0),
    fallbackCount: Math.max(0, Number(row.fallbackCount) || 0),
    byModel: Array.isArray(row.byModel)
      ? row.byModel.map((item) => ({
          model: String((item as { model?: string })?.model || 'unknown'),
          count: Math.max(0, Number((item as { count?: number })?.count) || 0),
        }))
      : [],
    byOperation: Array.isArray(row.byOperation)
      ? row.byOperation.map((item) => ({
          operation: String((item as { operation?: string })?.operation || 'unknown'),
          count: Math.max(0, Number((item as { count?: number })?.count) || 0),
        }))
      : [],
    byErrorCategory: Array.isArray(row.byErrorCategory)
      ? row.byErrorCategory.map((item) => ({
          category: String((item as { category?: string })?.category || 'error'),
          count: Math.max(0, Number((item as { count?: number })?.count) || 0),
        }))
      : [],
  };
}

function parseSelectable(raw: unknown): AiSelectableModels {
  if (!raw || typeof raw !== 'object') {
    return { providers: ['gemini', 'groq'], models: { gemini: [], groq: [] }, defaults: {} };
  }
  const row = raw as Record<string, unknown>;
  return {
    providers: Array.isArray(row.providers) ? row.providers.map(String) : ['gemini', 'groq'],
    models:
      row.models && typeof row.models === 'object'
        ? Object.fromEntries(
            Object.entries(row.models as Record<string, unknown>).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.map(String) : [],
            ])
          )
        : { gemini: [], groq: [] },
    defaults:
      row.defaults && typeof row.defaults === 'object'
        ? Object.fromEntries(
            Object.entries(row.defaults as Record<string, unknown>).map(([key, value]) => [
              key,
              String(value || ''),
            ])
          )
        : {},
  };
}

function parseConfig(raw: unknown): AiUsageConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    provider: typeof row.provider === 'string' ? row.provider : undefined,
    model: typeof row.model === 'string' ? row.model : undefined,
    fallbackChain: Array.isArray(row.fallbackChain)
      ? row.fallbackChain.map((item) => ({
          provider: String((item as { provider?: string })?.provider || ''),
          model: String((item as { model?: string })?.model || ''),
        }))
      : [],
    dailyRequestLimit: Number(row.dailyRequestLimit) || undefined,
    dailyTokenLimit: Number(row.dailyTokenLimit) || undefined,
    geminiConfigured: row.geminiConfigured === true,
    groqConfigured: row.groqConfigured === true,
    configured: row.configured === true,
    providerFreeTiers: parseProviderFreeTiers(row.providerFreeTiers),
  };
}

function parseProviderFreeTiers(raw: unknown): AiProviderFreeTiers | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const rpd = Number(row.rpd);
  const rpm = Number(row.rpm);
  const tpm = Number(row.tpm);
  if (!Number.isFinite(rpd) || !Number.isFinite(rpm) || !Number.isFinite(tpm)) return null;
  return {
    provider: String(row.provider || 'groq'),
    model: String(row.model || ''),
    rpm,
    rpd,
    tpm,
    tpd: row.tpd == null ? null : Number(row.tpd) || null,
    resetTimezone: String(row.resetTimezone || 'UTC'),
    resetNote: String(row.resetNote || ''),
  };
}

export async function fetchAiUsage(): Promise<AiUsageResult> {
  try {
    const headers = await authHeaders();
    if (!headers) return { ok: false, error: 'Sign in again to view AI usage' };

    const response = await fetch('/.netlify/functions/ai-usage', {
      method: 'GET',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error || 'Could not load AI usage') };
    }

    const myToday = (data.myToday || {}) as Record<string, unknown>;
    return {
      ok: true,
      tracking: 'crm',
      timezone: String(data.timezone || 'Asia/Kolkata'),
      dayKey: String(data.dayKey || ''),
      monthStart: String(data.monthStart || ''),
      fallbackTracked: data.fallbackTracked === true,
      tablesInstalled: data.tablesInstalled !== false,
      config: parseConfig(data.config),
      selectable: parseSelectable(data.selectable),
      today: parsePeriod(data.today),
      month: parsePeriod(data.month),
      myToday: {
        requestCount: Math.max(0, Number(myToday.requestCount) || 0),
        inputTokens: Math.max(0, Number(myToday.inputTokens) || 0),
        outputTokens: Math.max(0, Number(myToday.outputTokens) || 0),
        reservedTokens: Math.max(0, Number(myToday.reservedTokens) || 0),
        requestLimit: Math.max(1, Number(myToday.requestLimit) || 80),
        tokenLimit: Math.max(1000, Number(myToday.tokenLimit) || 200000),
        requestsRemaining: Math.max(0, Number(myToday.requestsRemaining) || 0),
        tokensRemaining: Math.max(0, Number(myToday.tokensRemaining) || 0),
      },
      notes: Array.isArray(data.notes) ? data.notes.map(String) : [],
      generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : undefined,
    };
  } catch {
    return { ok: false, error: 'Could not load AI usage' };
  }
}

export async function saveAiModelSelection(opts: {
  provider: string;
  model: string;
}): Promise<AiConfigSaveResult> {
  try {
    const headers = await authHeaders();
    if (!headers) return { ok: false, error: 'Sign in again to save AI model' };

    const response = await fetch('/.netlify/functions/ai-config-save', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: opts.provider,
        model: opts.model,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error || 'Could not save AI model') };
    }
    return {
      ok: true,
      config: parseConfig(data.config),
      selectable: parseSelectable(data.selectable),
    };
  } catch {
    return { ok: false, error: 'Could not save AI model' };
  }
}

export function formatTokenCount(value: number): string {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
