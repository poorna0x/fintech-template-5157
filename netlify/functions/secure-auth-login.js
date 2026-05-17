// Rate-limited, CAPTCHA-gated proxy for Supabase password login.
// Clients must not call signInWithPassword directly — use this endpoint + setSession.
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { rateLimiters, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');
const { verifyLoginToken, consumeLoginToken, isPlaceholderKey } = require('./altcha-guard');
const {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} = require('./auth-lockout');

const GENERIC_AUTH_ERROR = 'Invalid email or password';

async function signInWithPasswordServer(supabaseUrl, anonKey, email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Forbidden: Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (process.env.CONTEXT === 'production' && isPlaceholderKey()) {
    return {
      statusCode: 503,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        error: 'Login protection unavailable',
        message: 'Set ALTCHA_HMAC_KEY in Netlify environment.',
      }),
    };
  }

  const ipLimit = rateLimiters.auth(event);
  if (ipLimit) {
    return { ...ipLimit, headers: { ...ipLimit.headers, ...corsHeaders } };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Server misconfigured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { email, password, altchaLoginToken, altchaPayload, portal } = body;
  if (
    !email ||
    !password ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !altchaLoginToken
  ) {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing email, password, or security verification' }),
    };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const expectedPortal = portal === 'technician' ? 'technician' : 'admin';

  const emailLimit = checkRateLimitForKey(`email:${normalizedEmail}`, {
    maxRequests: 5,
    windowMs: 900000,
    endpoint: 'auth-email',
  });
  if (!emailLimit.allowed) {
    return {
      ...rateLimitResponseForKey(emailLimit),
      headers: {
        ...rateLimitResponseForKey(emailLimit).headers,
        ...corsHeaders,
      },
    };
  }

  const tokenCheck = verifyLoginToken(altchaLoginToken, altchaPayload);
  if (!tokenCheck.ok) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: tokenCheck.error || 'Security verification required' }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const lockStatus = await checkLoginAllowed(admin, normalizedEmail);
  if (lockStatus.allowed === false) {
    const retrySec = lockStatus.retry_after_seconds || 900;
    return {
      statusCode: 429,
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retrySec),
      }),
      body: JSON.stringify({
        error: 'Account temporarily locked',
        message: `Too many failed login attempts. Try again in ${Math.ceil(retrySec / 60)} minutes.`,
        retryAfter: retrySec,
        locked: true,
      }),
    };
  }

  const authResult = await signInWithPasswordServer(
    supabaseUrl,
    anonKey,
    normalizedEmail,
    password
  );

  if (!authResult.ok) {
    const failureMeta = await recordLoginFailure(admin, normalizedEmail);
    const remaining = failureMeta?.remaining_attempts;
    const locked = failureMeta?.locked === true;

    if (locked) {
      const retrySec = failureMeta.retry_after_seconds || 900;
      return {
        statusCode: 429,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retrySec),
        }),
        body: JSON.stringify({
          error: 'Account temporarily locked',
          message: `Too many failed login attempts. Try again in ${Math.ceil(retrySec / 60)} minutes.`,
          retryAfter: retrySec,
          locked: true,
        }),
      };
    }

    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        error: GENERIC_AUTH_ERROR,
        ...(typeof remaining === 'number' ? { remainingAttempts: remaining } : {}),
      }),
    };
  }

  const session = authResult.body;
  const user = session?.user;
  if (!session?.access_token || !user) {
    await recordLoginFailure(admin, normalizedEmail);
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: GENERIC_AUTH_ERROR }),
    };
  }

  const role =
    user.app_metadata?.role || user.user_metadata?.role || 'admin';
  const isTechnician = role === 'technician';

  if (expectedPortal === 'technician' && !isTechnician) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Use the admin login page for this account.' }),
    };
  }

  if (expectedPortal === 'admin' && isTechnician) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Use the technician login page for this account.' }),
    };
  }

  if (expectedPortal === 'technician') {
    const { data: tech, error: techError } = await admin
      .from('technicians')
      .select('id, account_status')
      .eq('id', user.id)
      .single();

    if (techError || !tech || tech.account_status !== 'ACTIVE') {
      return {
        statusCode: 403,
        headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Account is not active' }),
      };
    }
  }

  await recordLoginSuccess(admin, normalizedEmail);
  consumeLoginToken(tokenCheck.consumeKey, tokenCheck.exp);

  return {
    statusCode: 200,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user,
    }),
  };
};
