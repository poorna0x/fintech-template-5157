/**
 * Admin-only AI inbox suggestions (reply draft + optional quotation draft proposal).
 * Never sends WhatsApp, never deletes data, never creates jobs.
 *
 * POST /.netlify/functions/ai-inbox-suggest
 * Body: { operation: 'suggest_reply'|'suggest_quotation', phoneE164, customerId? }
 */

const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { readBearerToken, verifyAdminBearerToken } = require('./admin-auth-guard');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');
const { getServiceSupabase } = require('./whatsapp-helper');
const { getAiAssistantConfig, publicConfigSummary } = require('./ai-config');
const { generateWithProvider } = require('./ai-provider');
const {
  parseSuggestRequest,
  normalizeSuggestionOutput,
  assertNoMutationTools,
} = require('./ai-schemas');
const { sha256, localDayKey, claimAiQuota, finalizeAiInvocation } = require('./ai-audit');

const MAX_BODY_BYTES = 8_000;
const THREAD_LIMIT = 18;
const MAX_MSG_CHARS = 500;

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: {
      ...headers,
      'Cache-Control': 'no-store, private',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

function buildSystemInstruction(operation) {
  return [
    'You are an assistant for HydrogenRO / ElevenRO RO service admins.',
    'Return ONLY valid JSON with keys: replyText, intent, confidence (0-1), requiresHuman (boolean), warnings (string[]), quotation (nullable).',
    'quotation.items[].description and quantity only. Always set unitPrice to 0. Never invent selling prices.',
    'Do not claim a message was sent. Do not invent job numbers, payments, or customer facts not in the thread.',
    'Be concise, polite, and suitable for WhatsApp (India English).',
    'If unsure, set requiresHuman=true and ask a clarifying question in replyText.',
    operation === 'suggest_quotation'
      ? 'Focus on proposing a quotation draft from the conversation.'
      : 'Focus on a helpful reply draft for the admin to review before sending.',
  ].join(' ');
}

function mapThreadToMessages(rows) {
  const messages = [];
  for (const row of rows || []) {
    const direction = String(row.direction || '').toLowerCase();
    const role = direction === 'inbound' || direction === 'in' ? 'user' : 'assistant';
    let text = String(row.body || '').trim();
    if (!text && row.msg_type && row.msg_type !== 'text') {
      text = `[${String(row.msg_type)} attachment${row.filename ? `: ${row.filename}` : ''}]`;
    }
    text = text.slice(0, MAX_MSG_CHARS);
    if (!text) continue;
    // Skip internal bot markers from model context when possible
    if (/^\[needs human reply\]/i.test(text)) continue;
    messages.push({ role, text });
  }
  return messages;
}

async function loadThreadContext(phoneDigits) {
  const db = getServiceSupabase();
  if (!db) return { messages: [], customerId: null, customerName: null };

  const e164Candidates = [`+${phoneDigits}`, phoneDigits];
  if (phoneDigits.length === 10) e164Candidates.push(`+91${phoneDigits}`);
  if (phoneDigits.startsWith('91') && phoneDigits.length === 12) {
    e164Candidates.push(`+${phoneDigits}`);
  }

  const { data: msgs, error } = await db
    .from('whatsapp_messages')
    .select('id, direction, body, msg_type, filename, customer_id, created_at, phone_e164')
    .in('phone_e164', [...new Set(e164Candidates)])
    .order('created_at', { ascending: false })
    .limit(THREAD_LIMIT);

  if (error) {
    console.warn('[ai-inbox-suggest] thread load failed', error.message);
    return { messages: [], customerId: null, customerName: null };
  }

  const chronological = (msgs || []).slice().reverse();
  let customerId = null;
  for (const m of chronological) {
    if (m.customer_id) {
      customerId = m.customer_id;
      break;
    }
  }

  let customerName = null;
  if (customerId) {
    const { data: cust } = await db
      .from('customers')
      .select('id, full_name')
      .eq('id', customerId)
      .maybeSingle();
    customerName = cust?.full_name ? String(cust.full_name).trim() : null;
  }

  return {
    messages: mapThreadToMessages(chronological),
    customerId,
    customerName,
  };
}

function buildUserPrompt(ctx, operation) {
  const lines = [];
  lines.push(`Operation: ${operation}`);
  if (ctx.customerName) lines.push(`Customer name: ${ctx.customerName}`);
  lines.push('Recent WhatsApp thread (oldest → newest):');
  if (!ctx.messages.length) {
    lines.push('(no prior messages found)');
  } else {
    for (const m of ctx.messages) {
      lines.push(`${m.role === 'user' ? 'Customer' : 'Business'}: ${m.text}`);
    }
  }
  lines.push('Return JSON only.');
  return lines.join('\n');
}

exports.handler = async (event) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const headers = getCorsHeaders(event.headers || {});

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (shouldRejectMissingOrigin(event.headers || {}, { allowMissingWithBearer: true })) {
    return json(403, headers, { success: false, error: 'Forbidden' });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, headers, { success: false, error: 'Method not allowed' });
  }

  const rawBody = event.body || '';
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json(413, headers, { success: false, error: 'Request too large' });
  }

  const token = readBearerToken(event);
  const auth = await verifyAdminBearerToken(token);
  if (!auth.ok) {
    return json(auth.error === 'Forbidden' ? 403 : 401, headers, {
      success: false,
      error: auth.error || 'Unauthorized',
    });
  }

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json(400, headers, { success: false, error: 'Invalid JSON' });
  }

  // Ignore any client-supplied provider/model/system/tools.
  if (body.provider || body.model || body.systemInstruction || body.tools || body.messages) {
    // Strip silently — do not fail, but never honor these fields.
  }

  const parsed = parseSuggestRequest(body);
  if (!parsed.ok) {
    return json(400, headers, { success: false, error: parsed.error });
  }

  const ipBurst = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'ai-inbox-suggest-ip',
  });
  const userBurst = checkRateLimitForKey(auth.userId || 'unknown', {
    maxRequests: 20,
    windowMs: 60_000,
    endpoint: 'ai-inbox-suggest-user',
  });
  if (!ipBurst.allowed || !userBurst.allowed) {
    return json(429, headers, { success: false, error: 'Too many AI requests. Try again shortly.' });
  }

  const config = await getAiAssistantConfig();
  if (!config) {
    return json(503, headers, {
      success: false,
      error:
        'AI assistant is not configured. For localhost, mock mode is used automatically; for Gemini set app_secrets.ai_assistant or GEMINI_API_KEY.',
    });
  }

  const dayKey = localDayKey();
  const idempotencyKey = sha256(
    `${auth.userId}|${parsed.value.operation}|${parsed.value.phoneDigits}|${dayKey}|${Date.now()}`
  ).slice(0, 40);

  const quota = await claimAiQuota({
    actorUserId: auth.userId,
    dayKey,
    requestLimit: config.dailyRequestLimit,
    tokenLimit: config.dailyTokenLimit,
    reserveTokens: 900,
    idempotencyKey,
    provider: config.provider,
    model: config.model,
    operation: parsed.value.operation,
  });
  if (!quota.ok) {
    return json(quota.quotaExceeded ? 429 : 503, headers, {
      success: false,
      error: quota.error || 'AI quota unavailable',
    });
  }

  const started = Date.now();
  let finalizeStatus = 'error';
  let errorCategory = null;
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let promptHash = null;
  let responseHash = null;

  try {
    assertNoMutationTools([]);

    const ctx = await loadThreadContext(parsed.value.phoneDigits);
    if (parsed.value.customerId && ctx.customerId && parsed.value.customerId !== ctx.customerId) {
      // Prefer server-resolved customer; ignore mismatched client id.
    }
    const customerId = ctx.customerId || parsed.value.customerId || null;

    if (parsed.value.operation === 'suggest_quotation' && !customerId) {
      return json(400, headers, {
        success: false,
        error: 'Link this chat to a customer before creating a quotation draft.',
      });
    }

    const userPrompt = buildUserPrompt(ctx, parsed.value.operation);
    promptHash = sha256(userPrompt);

    const providerResult = await generateWithProvider(config, {
      operation: parsed.value.operation,
      systemInstruction: buildSystemInstruction(parsed.value.operation),
      messages: [{ role: 'user', text: userPrompt }],
      temperature: 0.3,
      maxOutputTokens: 900,
      timeoutMs: 18_000,
    });

    usage = providerResult.usage || usage;
    const rawObject =
      providerResult.parsed ||
      (() => {
        try {
          return JSON.parse(providerResult.text || '{}');
        } catch {
          return { replyText: String(providerResult.text || '').trim() };
        }
      })();

    const normalized = normalizeSuggestionOutput(rawObject, {
      includeQuotation: parsed.value.operation === 'suggest_quotation',
    });
    if (!normalized.ok) {
      errorCategory = 'empty_output';
      return json(502, headers, { success: false, error: 'AI returned an empty suggestion' });
    }

    // Quotation proposals must always have zero prices.
    if (normalized.value.quotation?.items) {
      normalized.value.quotation.items = normalized.value.quotation.items.map((item) => ({
        ...item,
        unitPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        total: 0,
      }));
    }

    responseHash = sha256(JSON.stringify(normalized.value));
    finalizeStatus = 'ok';

    return json(200, headers, {
      success: true,
      suggestion: {
        ...normalized.value,
        customerId,
        customerName: ctx.customerName,
      },
      meta: {
        ...publicConfigSummary(config),
        latencyMs: Date.now() - started,
        usage,
        // Explicit safety flags for the UI.
        canAutoSend: false,
        canDelete: false,
        canCreateJob: false,
      },
    });
  } catch (err) {
    errorCategory = 'provider_error';
    console.warn('[ai-inbox-suggest] failed', err?.message || err);
    return json(502, headers, {
      success: false,
      error: 'Could not generate suggestion. Please try again.',
    });
  } finally {
    await finalizeAiInvocation({
      invocationId: quota.invocationId,
      actorUserId: auth.userId,
      dayKey,
      status: finalizeStatus,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Date.now() - started,
      promptHash,
      responseHash,
      errorCategory,
      reservedTokens: quota.reservedTokens || 0,
    });
  }
};

// Exported for unit tests
module.exports._test = {
  mapThreadToMessages,
  buildSystemInstruction,
  buildUserPrompt,
};
