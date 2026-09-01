/**
 * Admin-only CRM-tracked AI usage stats.
 * GET/POST /.netlify/functions/ai-usage
 * Never returns prompts, hashes, or API keys.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { readBearerToken, verifyFullAdminBearerToken } = require('./admin-auth-guard');
const {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');
const { getServiceSupabase } = require('./whatsapp-helper');
const {
  getAiAssistantConfig,
  publicConfigSummary,
  listSelectableModels,
} = require('./ai-config');
const {
  localDayKey,
  monthStartDayKey,
  isMissingRelation,
} = require('./ai-audit');

const INVOCATION_COLUMNS_FULL =
  'status,provider,model,operation,input_tokens,output_tokens,fell_back,error_category,day_key,created_at,actor_user_id';
const INVOCATION_COLUMNS_LEGACY =
  'status,provider,model,operation,input_tokens,output_tokens,error_category,day_key,created_at,actor_user_id';
const BUCKET_COLUMNS =
  'actor_user_id,day_key,request_count,input_tokens,output_tokens,reserved_tokens';

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}

function emptyPeriod() {
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

function bump(map, key, amount = 1) {
  const safe = String(key || 'unknown');
  map.set(safe, (map.get(safe) || 0) + amount);
}

function mapToSortedList(map, keyName) {
  return [...map.entries()]
    .map(([name, count]) => ({ [keyName]: name, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
}

function aggregateRows(rows, { fallbackTracked }) {
  const period = emptyPeriod();
  const byModel = new Map();
  const byOperation = new Map();
  const byError = new Map();

  for (const row of rows || []) {
    period.requests += 1;
    const status = String(row.status || '');
    if (status === 'ok') period.ok += 1;
    else if (status === 'pending') period.pending += 1;
    else period.error += 1;

    period.inputTokens += Math.max(0, Number(row.input_tokens) || 0);
    period.outputTokens += Math.max(0, Number(row.output_tokens) || 0);
    if (fallbackTracked && row.fell_back === true) period.fallbackCount += 1;

    const modelKey = `${row.provider || 'unknown'}/${row.model || 'unknown'}`;
    bump(byModel, modelKey);
    bump(byOperation, row.operation || 'unknown');
    if (status === 'error' || status === 'quota_denied') {
      bump(byError, row.error_category || status || 'error');
    }
  }

  period.byModel = mapToSortedList(byModel, 'model').map((item) => ({
    model: item.model,
    count: item.count,
  }));
  period.byOperation = mapToSortedList(byOperation, 'operation').map((item) => ({
    operation: item.operation,
    count: item.count,
  }));
  period.byErrorCategory = mapToSortedList(byError, 'category').map((item) => ({
    category: item.category,
    count: item.count,
  }));
  return period;
}

async function loadInvocations(db, monthStart) {
  let fallbackTracked = true;
  let result = await db
    .from('ai_assistant_invocations')
    .select(INVOCATION_COLUMNS_FULL)
    .gte('day_key', monthStart)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (result.error && /fell_back/i.test(String(result.error.message || ''))) {
    fallbackTracked = false;
    result = await db
      .from('ai_assistant_invocations')
      .select(INVOCATION_COLUMNS_LEGACY)
      .gte('day_key', monthStart)
      .order('created_at', { ascending: false })
      .limit(5000);
  }

  if (result.error) {
    if (isMissingRelation(result.error)) {
      return { ok: true, skipped: true, rows: [], fallbackTracked: false };
    }
    return { ok: false, error: result.error.message || 'Could not load AI usage' };
  }
  return {
    ok: true,
    skipped: false,
    rows: Array.isArray(result.data) ? result.data : [],
    fallbackTracked,
  };
}

async function loadTodayBucket(db, actorUserId, dayKey) {
  if (!actorUserId) return null;
  const { data, error } = await db
    .from('ai_assistant_usage_buckets')
    .select(BUCKET_COLUMNS)
    .eq('actor_user_id', actorUserId)
    .eq('day_key', dayKey)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    return null;
  }
  return data || null;
}

exports.handler = async (event) => {
  const headers = getCorsHeaders(event.headers?.origin || event.headers?.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(headers), body: '' };
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { ok: false, error: 'Forbidden' });
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, headers, { ok: false, error: 'Method not allowed' });
  }

  const auth = await verifyFullAdminBearerToken(readBearerToken(event));
  if (!auth.ok) {
    return json(auth.error === 'Forbidden' ? 403 : 401, headers, {
      ok: false,
      error: auth.error || 'Unauthorized',
    });
  }

  if (typeof isRateLimitEnabled === 'function' && isRateLimitEnabled()) {
    const ipLimit = checkRateLimit(event, {
      maxRequests: 40,
      windowMs: 60_000,
      endpoint: 'ai-usage-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
    const userLimit = checkRateLimitForKey(auth.userId || 'admin', {
      maxRequests: 30,
      windowMs: 60_000,
      endpoint: 'ai-usage-user',
    });
    if (!userLimit.allowed) {
      const base = rateLimitResponseForKey(userLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
  }

  const config = await getAiAssistantConfig({ forceRefresh: false });
  const dayKey = localDayKey();
  const monthStart = monthStartDayKey();
  const db = getServiceSupabase();

  if (!db) {
    return json(200, headers, {
      ok: true,
      tracking: 'crm',
      timezone: 'Asia/Kolkata',
      dayKey,
      monthStart,
      fallbackTracked: false,
      tablesInstalled: false,
      config: publicConfigSummary(config),
      selectable: listSelectableModels(),
      today: emptyPeriod(),
      month: emptyPeriod(),
      myToday: {
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        reservedTokens: 0,
        requestLimit: config?.dailyRequestLimit || 80,
        tokenLimit: config?.dailyTokenLimit || 200000,
        requestsRemaining: config?.dailyRequestLimit || 80,
        tokensRemaining: config?.dailyTokenLimit || 200000,
      },
      notes: [
        'CRM tracks requests and tokens used through this admin AI.',
        'Gemini/Groq free-tier account quotas are shown only in their dashboards.',
      ],
      generatedAt: new Date().toISOString(),
    });
  }

  const loaded = await loadInvocations(db, monthStart);
  if (!loaded.ok) {
    return json(503, headers, { ok: false, error: loaded.error || 'Could not load AI usage' });
  }

  const todayRows = loaded.rows.filter((row) => String(row.day_key) === dayKey);
  const monthRows = loaded.rows;
  const today = aggregateRows(todayRows, { fallbackTracked: loaded.fallbackTracked });
  const month = aggregateRows(monthRows, { fallbackTracked: loaded.fallbackTracked });
  const bucket = await loadTodayBucket(db, auth.userId, dayKey);
  const requestLimit = config?.dailyRequestLimit || 80;
  const tokenLimit = config?.dailyTokenLimit || 200000;
  const requestCount = Math.max(0, Number(bucket?.request_count) || 0);
  const inputTokens = Math.max(0, Number(bucket?.input_tokens) || 0);
  const outputTokens = Math.max(0, Number(bucket?.output_tokens) || 0);
  const reservedTokens = Math.max(0, Number(bucket?.reserved_tokens) || 0);
  const usedTokens = inputTokens + outputTokens + reservedTokens;

  return json(200, headers, {
    ok: true,
    tracking: 'crm',
    timezone: 'Asia/Kolkata',
    dayKey,
    monthStart,
    fallbackTracked: loaded.fallbackTracked,
    tablesInstalled: !loaded.skipped,
    config: publicConfigSummary(config),
    selectable: listSelectableModels(),
    today,
    month,
    myToday: {
      requestCount,
      inputTokens,
      outputTokens,
      reservedTokens,
      requestLimit,
      tokenLimit,
      requestsRemaining: Math.max(0, requestLimit - requestCount),
      tokensRemaining: Math.max(0, tokenLimit - usedTokens),
    },
    notes: [
      'Numbers below are CRM-tracked usage for admin AI features only.',
      'Provider account free-tier remaining limits are not available via API — check Google AI Studio / Groq console.',
      loaded.fallbackTracked
        ? 'Model counts use the served model after automatic fallback.'
        : 'Fallback tracking SQL not installed yet — run scripts/add-ai-assistant-usage-fallback.sql for accurate served-model stats.',
    ],
    generatedAt: new Date().toISOString(),
  });
};

module.exports._test = {
  emptyPeriod,
  aggregateRows,
  mapToSortedList,
};
