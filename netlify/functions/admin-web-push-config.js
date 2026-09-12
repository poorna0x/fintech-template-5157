/**
 * Public VAPID key for Admin PWA / browser FCM web push.
 * Prefer app_secrets.firebase_web_vapid_key (no site rebuild); fallback env.
 * Auth: admin JWT. Returns only the public key (not a secret).
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');

async function resolveVapidKey(db) {
  const fromEnv = (
    process.env.FIREBASE_WEB_VAPID_KEY ||
    process.env.VITE_FIREBASE_VAPID_KEY ||
    ''
  ).trim();
  if (fromEnv) return { vapidKey: fromEnv, source: 'env' };

  if (!db) return null;
  try {
    const { data } = await db
      .from('app_secrets')
      .select('value')
      .eq('key', 'firebase_web_vapid_key')
      .maybeSingle();
    const raw = String(data?.value || '').trim();
    if (!raw) return null;
    // Allow plain key or JSON { "vapidKey": "..." }
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        const k = String(parsed.vapidKey || parsed.key || '').trim();
        if (k) return { vapidKey: k, source: 'app_secrets' };
      } catch {
        /* fall through */
      }
    }
    return { vapidKey: raw, source: 'app_secrets' };
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (shouldRejectMissingOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }
  }

  const auth = await authorizeAdminBearer(event, body);
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const db =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

  const resolved = await resolveVapidKey(db);
  if (!resolved?.vapidKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        configured: false,
        error:
          'Web push VAPID key missing. Add app_secrets.firebase_web_vapid_key (Firebase Console → Cloud Messaging → Web Push certificates) or VITE_FIREBASE_VAPID_KEY.',
      }),
    };
  }

  const messagingSenderId = (
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    '449481461674'
  ).trim();

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      configured: true,
      vapidKey: resolved.vapidKey,
      messagingSenderId,
      source: resolved.source,
    }),
  };
};
