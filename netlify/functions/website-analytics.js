// First-party website analytics — batched, privacy-light events for hydrogenro + elevenro.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed, isProduction } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { checkRateLimit, getClientIdentifier } = require('./rate-limiter');
const { enrichEventMetadata } = require('./website-analytics-enrich');

const SITE_KEYS = new Set(['hydrogenro', 'elevenro']);
const EVENT_TYPES = new Set([
  'page_view',
  'phone_click',
  'whatsapp_click',
  'booking_click',
  'booking_submit',
]);
const MAX_EVENTS = 8;
const MAX_PATH_LEN = 256;
const MAX_META_KEYS = 12;
const MAX_META_VAL_LEN = 64;
const CLIENT_ONLY_META_KEYS = new Set(['referrer_url']);

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

function preflightOrReject(event) {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { handled: true, response: { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' } };
  }

  if (isProduction() && !requestOrigin) {
    return { handled: true, response: jsonResponse(403, corsHeaders, { error: 'Forbidden' }) };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return { handled: true, response: jsonResponse(403, corsHeaders, { error: 'Forbidden: Origin not allowed' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { handled: true, response: jsonResponse(405, corsHeaders, { error: 'Method not allowed' }) };
  }

  return { handled: false, corsHeaders };
}

function hashClientIp(event) {
  const ip = getClientIdentifier(event);
  const pepper =
    process.env.ANALYTICS_IP_HASH_PEPPER ||
    process.env.BOOKING_IP_HASH_PEPPER ||
    process.env.ALTCHA_HMAC_KEY ||
    'analytics-ip-pepper';
  return crypto.createHmac('sha256', pepper).update(String(ip)).digest('hex').slice(0, 32);
}

function sanitizeMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const keys = Object.keys(raw).slice(0, MAX_META_KEYS);
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_]{0,31}$/i.test(key)) continue;
    const val = raw[key];
    if (typeof val === 'string') {
      const maxLen = CLIENT_ONLY_META_KEYS.has(key) ? 200 : MAX_META_VAL_LEN;
      out[key] = val.slice(0, maxLen);
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      out[key] = val;
    } else if (typeof val === 'boolean') {
      out[key] = val;
    }
  }
  return out;
}

function buildMetadata(rawClientMeta, headers) {
  const clientMeta = sanitizeMetadata(rawClientMeta);
  return sanitizeMetadata(enrichEventMetadata(clientMeta, headers));
}

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: 'Server configuration error' };
  return { admin: createClient(url, key, { auth: { persistSession: false } }) };
}

exports.handler = async (event) => {
  const pre = preflightOrReject(event);
  if (pre.handled) return pre.response;
  const corsHeaders = pre.corsHeaders;

  const ipLimit = checkRateLimit(event, {
    maxRequests: 200,
    windowMs: 3_600_000,
    endpoint: 'website-analytics',
  });
  if (!ipLimit.allowed) {
    return jsonResponse(429, corsHeaders, { error: 'Too many requests' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!events.length) {
    return jsonResponse(400, corsHeaders, { error: 'No events' });
  }

  const clientIpHash = hashClientIp(event);
  const rows = [];

  for (const ev of events) {
    const eventType = typeof ev.event_type === 'string' ? ev.event_type : '';
    const siteKey = typeof ev.site_key === 'string' && SITE_KEYS.has(ev.site_key) ? ev.site_key : 'hydrogenro';
    const sessionHash =
      typeof ev.session_hash === 'string' && ev.session_hash.length >= 8 && ev.session_hash.length <= 80
        ? ev.session_hash.slice(0, 80)
        : null;

    if (!EVENT_TYPES.has(eventType) || !sessionHash) continue;

    const pagePath =
      typeof ev.page_path === 'string' ? ev.page_path.slice(0, MAX_PATH_LEN) : null;

    rows.push({
      site_key: siteKey,
      event_type: eventType,
      page_path: pagePath,
      session_hash: sessionHash,
      client_ip_hash: clientIpHash,
      metadata: buildMetadata(ev.metadata, event.headers),
    });
  }

  if (!rows.length) {
    return jsonResponse(400, corsHeaders, { error: 'No valid events' });
  }

  const client = getServiceClient();
  if (client.error) {
    return jsonResponse(500, corsHeaders, { error: client.error });
  }

  const { error } = await client.admin.from('website_analytics_events').insert(rows);
  if (error) {
    console.error('[website-analytics]', error.message);
    return jsonResponse(500, corsHeaders, { error: 'Could not save events' });
  }

  return jsonResponse(200, corsHeaders, { ok: true });
};
