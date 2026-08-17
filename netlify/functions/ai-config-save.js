/**
 * Full-admin save for AI provider/model selection.
 * POST /.netlify/functions/ai-config-save
 * Body: { provider, model } — never accepts API keys from the client.
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
const {
  getAiAssistantConfig,
  publicConfigSummary,
  listSelectableModels,
  saveAiAssistantModelSelection,
} = require('./ai-config');

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  const headers = getCorsHeaders(event.headers?.origin || event.headers?.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(headers), body: '' };
  }
  if (shouldRejectMissingOrigin(event.headers || {}, { allowMissingWithBearer: true })) {
    return json(403, headers, { ok: false, error: 'Forbidden' });
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
      maxRequests: 20,
      windowMs: 60_000,
      endpoint: 'ai-config-save-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
    const userLimit = checkRateLimitForKey(auth.userId || 'admin', {
      maxRequests: 10,
      windowMs: 60_000,
      endpoint: 'ai-config-save-user',
    });
    if (!userLimit.allowed) {
      const base = rateLimitResponseForKey(userLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
  }

  if (event.httpMethod === 'GET') {
    const config = await getAiAssistantConfig({ forceRefresh: true });
    return json(200, headers, {
      ok: true,
      config: publicConfigSummary(config),
      selectable: listSelectableModels(),
    });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, headers, { ok: false, error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { ok: false, error: 'Invalid JSON' });
  }

  // Hard ignore any client-supplied secrets / tools.
  if (
    body.geminiApiKey ||
    body.groqApiKey ||
    body.apiKey ||
    body.api_key ||
    body.tools ||
    body.systemInstruction
  ) {
    return json(400, headers, { ok: false, error: 'Invalid fields' });
  }

  const saved = await saveAiAssistantModelSelection({
    provider: body.provider,
    model: body.model,
  });
  if (!saved.ok) {
    return json(400, headers, { ok: false, error: saved.error || 'Could not save' });
  }

  return json(200, headers, {
    ok: true,
    config: saved.config,
    selectable: listSelectableModels(),
  });
};
