/**
 * Server-only AI assistant configuration.
 * Provider/model are chosen here — never from the browser.
 *
 * Production (preferred):
 *   app_secrets.ai_assistant = JSON {
 *     "provider": "gemini",
 *     "geminiApiKey": "...",
 *     "groqApiKey": "...",
 *     "model": "gemini-2.5-flash",
 *     "dailyRequestLimit": 80,
 *     "dailyTokenLimit": 200000
 *   }
 *
 * Local fallback env:
 *   AI_ASSISTANT_PROVIDER=mock|gemini|groq
 *   GEMINI_API_KEY=...
 *   GROQ_API_KEY=...
 *   AI_ASSISTANT_MODEL=gemini-2.5-flash
 *   AI_ASSISTANT_DAILY_REQUESTS=80
 *   AI_ASSISTANT_DAILY_TOKENS=200000
 */

const { getServiceSupabase } = require('./whatsapp-helper');

const APP_SECRET_KEY = 'ai_assistant';
const CACHE_TTL_MS = 60_000;
const ALLOWED_PROVIDERS = new Set(['mock', 'gemini', 'groq']);
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
const ALLOWED_GROQ_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
]);
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

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

function normalizeGroqModel(raw) {
  const value = String(raw || '').trim();
  if (ALLOWED_GROQ_MODELS.has(value)) return value;
  return DEFAULT_GROQ_MODEL;
}

function normalizePositiveInt(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

function normalizeFallbackChain(rawChain, context) {
  const {
    primaryProvider,
    primaryModel,
    geminiApiKey,
    groqApiKey,
  } = context;
  const explicit = Array.isArray(rawChain);
  const candidates = explicit
    ? rawChain
    : primaryProvider === 'gemini'
      ? [
          ...(primaryModel === DEFAULT_GEMINI_FALLBACK_MODEL
            ? []
            : [{ provider: 'gemini', model: DEFAULT_GEMINI_FALLBACK_MODEL }]),
          ...(groqApiKey ? [{ provider: 'groq', model: DEFAULT_GROQ_MODEL }] : []),
        ]
      : primaryProvider === 'groq' && geminiApiKey
        ? [{ provider: 'gemini', model: DEFAULT_GEMINI_FALLBACK_MODEL }]
        : [];

  const seen = new Set([`${primaryProvider}:${primaryModel}`]);
  const normalized = [];
  for (const candidate of candidates.slice(0, 4)) {
    const provider = normalizeProvider(candidate?.provider);
    if (!provider || provider === 'mock') continue;
    if (provider === 'gemini' && !geminiApiKey) continue;
    if (provider === 'groq' && !groqApiKey) continue;
    const model =
      provider === 'gemini'
        ? normalizeGeminiModel(candidate?.model)
        : normalizeGroqModel(candidate?.model);
    const key = `${provider}:${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ provider, model });
  }
  return normalized;
}

function normalizeConfig(raw, source) {
  if (!raw || typeof raw !== 'object') return null;
  const provider = normalizeProvider(raw.provider) || (source === 'env' ? null : null);
  const genericApiKey = String(raw.apiKey || raw.api_key || '').trim();
  const geminiApiKey = String(
    raw.geminiApiKey ||
      raw.gemini_api_key ||
      (provider !== 'groq' ? genericApiKey : '') ||
      ''
  ).trim();
  const groqApiKey = String(
    raw.groqApiKey ||
      raw.groq_api_key ||
      (provider === 'groq' ? genericApiKey : '') ||
      ''
  ).trim();
  const resolvedProvider =
    provider ||
    (geminiApiKey ? 'gemini' : null) ||
    (groqApiKey ? 'groq' : null) ||
    (isLocalDevRuntime() ? 'mock' : null);
  if (!resolvedProvider) return null;

  if (resolvedProvider === 'gemini' && !geminiApiKey) {
    return null;
  }
  if (resolvedProvider === 'groq' && !groqApiKey) {
    return null;
  }

  const model =
    resolvedProvider === 'gemini'
      ? normalizeGeminiModel(raw.model)
      : resolvedProvider === 'groq'
        ? normalizeGroqModel(raw.model)
        : 'mock-local';
  const config = {
    provider: resolvedProvider,
    geminiApiKey: geminiApiKey || null,
    groqApiKey: groqApiKey || null,
    model,
    dailyRequestLimit: normalizePositiveInt(raw.dailyRequestLimit || raw.daily_request_limit, 80, 500),
    dailyTokenLimit: normalizePositiveInt(raw.dailyTokenLimit || raw.daily_token_limit, 200000, 2_000_000),
    source,
  };
  config.fallbackChain = normalizeFallbackChain(
    raw.fallbackChain || raw.fallback_chain,
    {
      primaryProvider: resolvedProvider,
      primaryModel: model,
      geminiApiKey,
      groqApiKey,
    }
  );
  return config;
}

function getConfigFromEnv() {
  const providerHint = normalizeProvider(process.env.AI_ASSISTANT_PROVIDER);
  const geminiApiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
  const groqApiKey = String(process.env.GROQ_API_KEY || '').trim();
  if (
    providerHint === 'mock' ||
    (!providerHint && isLocalDevRuntime() && !geminiApiKey && !groqApiKey)
  ) {
    return {
      provider: 'mock',
      geminiApiKey: null,
      groqApiKey: null,
      model: 'mock-local',
      fallbackChain: [],
      dailyRequestLimit: normalizePositiveInt(process.env.AI_ASSISTANT_DAILY_REQUESTS, 80, 500),
      dailyTokenLimit: normalizePositiveInt(process.env.AI_ASSISTANT_DAILY_TOKENS, 200000, 2_000_000),
      source: 'env',
    };
  }
  return normalizeConfig(
    {
      provider: providerHint || (geminiApiKey ? 'gemini' : groqApiKey ? 'groq' : null),
      geminiApiKey,
      groqApiKey,
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

function mergeEnvProviderKeys(config) {
  if (!config || config.provider === 'mock') return config;
  const envGemini = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
  const envGroq = String(process.env.GROQ_API_KEY || '').trim();
  const geminiApiKey = config.geminiApiKey || envGemini || null;
  const groqApiKey = config.groqApiKey || envGroq || null;
  if (geminiApiKey === config.geminiApiKey && groqApiKey === config.groqApiKey) {
    return config;
  }
  return normalizeConfig(
    {
      provider: config.provider,
      geminiApiKey,
      groqApiKey,
      model: config.model,
      fallbackChain: config.fallbackChain,
      dailyRequestLimit: config.dailyRequestLimit,
      dailyTokenLimit: config.dailyTokenLimit,
    },
    config.source || 'app_secrets'
  );
}

async function getAiAssistantConfig({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const fromSecrets = await readConfigFromAppSecrets();
  const config = mergeEnvProviderKeys(fromSecrets || getConfigFromEnv());
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
    fallbackChain: (config.fallbackChain || []).map(({ provider, model }) => ({
      provider,
      model,
    })),
    dailyRequestLimit: config.dailyRequestLimit,
    dailyTokenLimit: config.dailyTokenLimit,
    geminiConfigured: Boolean(config.geminiApiKey),
    groqConfigured: Boolean(config.groqApiKey),
    configured: true,
  };
}

function listSelectableModels() {
  return {
    providers: ['gemini', 'groq'],
    models: {
      gemini: [...ALLOWED_GEMINI_MODELS].sort(),
      groq: [...ALLOWED_GROQ_MODELS].sort(),
    },
    defaults: {
      gemini: DEFAULT_GEMINI_MODEL,
      groq: DEFAULT_GROQ_MODEL,
    },
  };
}

function parseSecretObject(rawValue) {
  const plain = String(rawValue || '').trim();
  if (!plain) return {};
  if (!plain.startsWith('{')) {
    return { provider: 'gemini', geminiApiKey: plain };
  }
  try {
    const parsed = JSON.parse(plain);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Persist allowlisted provider/model into app_secrets without exposing or wiping keys.
 */
async function saveAiAssistantModelSelection({ provider, model }) {
  const nextProvider = normalizeProvider(provider);
  if (nextProvider !== 'gemini' && nextProvider !== 'groq') {
    return { ok: false, error: 'Provider not allowed' };
  }
  const rawModel = String(model || '').trim();
  if (
    (nextProvider === 'gemini' && !ALLOWED_GEMINI_MODELS.has(rawModel)) ||
    (nextProvider === 'groq' && !ALLOWED_GROQ_MODELS.has(rawModel))
  ) {
    return { ok: false, error: 'Model not allowed' };
  }
  const nextModel = rawModel;

  const db = getServiceSupabase();
  if (!db) return { ok: false, error: 'Database unavailable' };

  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', APP_SECRET_KEY)
    .maybeSingle();
  if (error && !isMissingAppSecrets(error)) {
    return { ok: false, error: 'Could not read AI settings' };
  }

  const existing = parseSecretObject(data?.value);
  const envGemini = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
  const envGroq = String(process.env.GROQ_API_KEY || '').trim();
  const geminiApiKey = String(
    existing.geminiApiKey || existing.gemini_api_key || existing.apiKey || existing.api_key || envGemini || ''
  ).trim();
  const groqApiKey = String(existing.groqApiKey || existing.groq_api_key || envGroq || '').trim();

  if (nextProvider === 'gemini' && !geminiApiKey) {
    return { ok: false, error: 'Gemini API key is not configured on the server' };
  }
  if (nextProvider === 'groq' && !groqApiKey) {
    return { ok: false, error: 'Groq API key is not configured on the server' };
  }

  const merged = {
    ...existing,
    provider: nextProvider,
    model: nextModel,
    dailyRequestLimit: normalizePositiveInt(
      existing.dailyRequestLimit || existing.daily_request_limit,
      80,
      500
    ),
    dailyTokenLimit: normalizePositiveInt(
      existing.dailyTokenLimit || existing.daily_token_limit,
      200000,
      2_000_000
    ),
  };
  if (geminiApiKey) {
    merged.geminiApiKey = geminiApiKey;
    delete merged.gemini_api_key;
    delete merged.apiKey;
    delete merged.api_key;
  }
  if (groqApiKey) {
    merged.groqApiKey = groqApiKey;
    delete merged.groq_api_key;
  }
  delete merged.tools;
  delete merged.systemInstruction;

  const value = JSON.stringify(merged);
  const upsert = await db.from('app_secrets').upsert(
    { key: APP_SECRET_KEY, value },
    { onConflict: 'key' }
  );
  if (upsert.error) {
    return { ok: false, error: 'Could not save AI settings' };
  }

  clearAiAssistantConfigCache();
  const config = await getAiAssistantConfig({ forceRefresh: true });
  return { ok: true, config: publicConfigSummary(config) };
}

function isMissingAppSecrets(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

module.exports = {
  APP_SECRET_KEY,
  ALLOWED_PROVIDERS,
  ALLOWED_GEMINI_MODELS,
  ALLOWED_GROQ_MODELS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GROQ_MODEL,
  getAiAssistantConfig,
  clearAiAssistantConfigCache,
  publicConfigSummary,
  listSelectableModels,
  saveAiAssistantModelSelection,
  isLocalDevRuntime,
  normalizeConfig,
  normalizeFallbackChain,
  normalizeProvider,
  normalizeGeminiModel,
  normalizeGroqModel,
};
