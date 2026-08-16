/**
 * Server-only AI assistant configuration.
 * Provider/model are chosen here — never from the browser.
 *
 * Production (preferred):
 *   app_secrets.ai_assistant = JSON {
 *     "provider": "gemini",
 *     "geminiApiKey": "...",
 *     "model": "gemini-3.1-flash-lite",
 *     "dailyRequestLimit": 80,
 *     "dailyTokenLimit": 200000
 *   }
 *
 * Local fallback env:
 *   AI_ASSISTANT_PROVIDER=mock|gemini
 *   GEMINI_API_KEY=...
 *   AI_ASSISTANT_MODEL=gemini-3.1-flash-lite
 *   AI_ASSISTANT_DAILY_REQUESTS=80
 *   AI_ASSISTANT_DAILY_TOKENS=200000
 */

const { getServiceSupabase } = require('./whatsapp-helper');

const APP_SECRET_KEY = 'ai_assistant';
const CACHE_TTL_MS = 60_000;
const ALLOWED_PROVIDERS = new Set(['mock', 'gemini']);
const ALLOWED_GEMINI_MODELS = new Set([
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
]);
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

let cachedConfig = null;
let cachedAt = 0;

function isLocalDevRuntime() {
  if (process.env.CONTEXT === 'production') return false;
  if (process.env.NETLIFY_DEV === 'true') return true;
  if (process.env.CONTEXT === 'dev') return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) return false;
  return process.env.NODE_ENV !== 'production';
}

function normalizeProvider(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (ALLOWED_PROVIDERS.has(value)) return value;
  return null;
}

function normalizeGeminiModel(raw) {
  const value = String(raw || '').trim();
  if (ALLOWED_GEMINI_MODELS.has(value)) return value;
  return DEFAULT_GEMINI_MODEL;
}

function normalizePositiveInt(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

function normalizeConfig(raw, source) {
  if (!raw || typeof raw !== 'object') return null;
  const provider = normalizeProvider(raw.provider) || (source === 'env' ? null : null);
  const geminiApiKey = String(
    raw.geminiApiKey || raw.gemini_api_key || raw.apiKey || raw.api_key || ''
  ).trim();
  const resolvedProvider =
    provider ||
    (geminiApiKey ? 'gemini' : null) ||
    (isLocalDevRuntime() ? 'mock' : null);
  if (!resolvedProvider) return null;

  if (resolvedProvider === 'gemini' && !geminiApiKey) {
    return null;
  }

  return {
    provider: resolvedProvider,
    geminiApiKey: resolvedProvider === 'gemini' ? geminiApiKey : null,
    model:
      resolvedProvider === 'gemini'
        ? normalizeGeminiModel(raw.model)
        : 'mock-local',
    dailyRequestLimit: normalizePositiveInt(raw.dailyRequestLimit || raw.daily_request_limit, 80, 500),
    dailyTokenLimit: normalizePositiveInt(raw.dailyTokenLimit || raw.daily_token_limit, 200000, 2_000_000),
    source,
  };
}

function getConfigFromEnv() {
  const providerHint = normalizeProvider(process.env.AI_ASSISTANT_PROVIDER);
  const geminiApiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
  if (providerHint === 'mock' || (!providerHint && isLocalDevRuntime() && !geminiApiKey)) {
    return {
      provider: 'mock',
      geminiApiKey: null,
      model: 'mock-local',
      dailyRequestLimit: normalizePositiveInt(process.env.AI_ASSISTANT_DAILY_REQUESTS, 80, 500),
      dailyTokenLimit: normalizePositiveInt(process.env.AI_ASSISTANT_DAILY_TOKENS, 200000, 2_000_000),
      source: 'env',
    };
  }
  return normalizeConfig(
    {
      provider: providerHint || (geminiApiKey ? 'gemini' : null),
      geminiApiKey,
      model: process.env.AI_ASSISTANT_MODEL,
      dailyRequestLimit: process.env.AI_ASSISTANT_DAILY_REQUESTS,
      dailyTokenLimit: process.env.AI_ASSISTANT_DAILY_TOKENS,
    },
    'env'
  );
}

async function readConfigFromAppSecrets() {
  const db = getServiceSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', APP_SECRET_KEY)
    .maybeSingle();
  if (error || !data?.value) return null;
  try {
    const parsed = JSON.parse(String(data.value).trim());
    return normalizeConfig(parsed, 'app_secrets');
  } catch {
    // Also allow a bare Gemini key stored as plain text.
    const plain = String(data.value).trim();
    if (plain && !plain.startsWith('{')) {
      return normalizeConfig({ provider: 'gemini', geminiApiKey: plain }, 'app_secrets');
    }
    return null;
  }
}

async function getAiAssistantConfig({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const fromSecrets = await readConfigFromAppSecrets();
  const config = fromSecrets || getConfigFromEnv();
  cachedConfig = config;
  cachedAt = now;
  return config;
}

function clearAiAssistantConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

function publicConfigSummary(config) {
  if (!config) return null;
  return {
    provider: config.provider,
    model: config.model,
    dailyRequestLimit: config.dailyRequestLimit,
    dailyTokenLimit: config.dailyTokenLimit,
    configured: true,
  };
}

module.exports = {
  APP_SECRET_KEY,
  ALLOWED_PROVIDERS,
  ALLOWED_GEMINI_MODELS,
  getAiAssistantConfig,
  clearAiAssistantConfigCache,
  publicConfigSummary,
  isLocalDevRuntime,
  normalizeConfig,
};
