// Rate-limited, CAPTCHA-gated proxy for Supabase password login.
// Clients must not call signInWithPassword directly — use this endpoint + setSession.
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed, isProduction } = require('./cors-helper');
const {
  checkLoginRateLimits,
  recordLoginRateLimitFailure,
} = require('./auth-rate-limits');
const { addSecurityHeaders } = require('./security-headers');
const {
  verifyLoginToken,
  tryReserveLoginToken,
  releaseLoginTokenReservation,
  consumeLoginToken,
  isPlaceholderKey,
} = require('./altcha-guard');
const {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} = require('./auth-lockout');
const { signPortalCookie, cookieHeader } = require('./portal-session');

const GENERIC_AUTH_ERROR = 'Invalid email or password';

/** Only failed password / invalid-grant style responses count toward proxy rate limits. */
function shouldRecordCredentialFailure(authResult) {
  if (authResult.ok) return false;
  if (authResult.status >= 500) return false;
  if (authResult.status === 429) return false;
  const code = authResult.body?.error_code || authResult.body?.code;
  if (code === 'captcha_failed' || code === 'captcha_required') return false;
  return true;
}

async function signInWithPasswordServer(supabaseUrl, anonKey, email, password, captchaToken) {
  const payload = { email, password };
  // Required once Supabase Dashboard → Authentication → Bot and Abuse Protection
  // is enabled (Cloudflare Turnstile or hCaptcha). Supabase verifies the token
  // server-side BEFORE checking the password, blocking direct brute force on
  // /auth/v1/token (which bypasses this proxy entirely).
  if (captchaToken && typeof captchaToken === 'string') {
    payload.gotrue_meta_security = { captcha_token: captchaToken };
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (isProduction() && !requestOrigin) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Forbidden' }),
    };
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

  const { email, password, altchaLoginToken, altchaPayload, portal, captchaToken } = body;
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

  // Defense in depth: cap captcha token length (Turnstile tokens are ~600 chars,
  // never multi-KB). Drops oversized payloads before forwarding to Supabase.
  const normalizedCaptchaToken =
    typeof captchaToken === 'string' && captchaToken.length > 0 && captchaToken.length <= 4096
      ? captchaToken
      : '';

  // Defense in depth: when this deployment is wired up with Turnstile (server-side
  // secret present), every login MUST carry a Turnstile token. Belt-and-braces in
  // case the Supabase Dashboard CAPTCHA switch is ever toggled off — otherwise an
  // attacker could brute-force /auth/v1/token via this proxy with no bot gate.
  // Also closes the "fast login bypass" class of issues at the auth boundary.
  const turnstileServerConfigured =
    typeof process.env.TURNSTILE_SECRET_KEY === 'string' &&
    process.env.TURNSTILE_SECRET_KEY.trim().length > 0;
  if (turnstileServerConfigured && !normalizedCaptchaToken) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Security verification required' }),
    };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const expectedPortal = portal === 'technician' ? 'technician' : 'admin';

  const rateLimits = checkLoginRateLimits(event, normalizedEmail, corsHeaders);
  if (rateLimits.blocked) {
    return rateLimits.response;
  }

  const tokenCheck = verifyLoginToken(altchaLoginToken, altchaPayload);
  if (!tokenCheck.ok) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: tokenCheck.error || 'Security verification required' }),
    };
  }

  const reserve = tryReserveLoginToken(tokenCheck.consumeKey);
  if (!reserve.ok) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: reserve.error || 'Security verification required' }),
    };
  }

  let loginTokenConsumed = false;
  try {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const lockStatus = await checkLoginAllowed(admin, normalizedEmail);
  if (lockStatus.allowed === false) {
    // Fail-closed degraded state from auth-lockout when the DB RPC is unreachable
    // (audit F-08). Surface as 503 so the UI doesn't tell the user they're "locked"
    // when in reality the lockout service is just unavailable.
    if (lockStatus.reason === 'lockout_service_unavailable') {
      const retrySec = lockStatus.retry_after_seconds || 60;
      return {
        statusCode: 503,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retrySec),
        }),
        body: JSON.stringify({
          error: 'Login service temporarily unavailable. Please try again shortly.',
          retryAfter: retrySec,
        }),
      };
    }

    const retrySec = lockStatus.retry_after_seconds || 900;
    const lockMins = Math.max(1, Math.ceil(retrySec / 60));
    return {
      statusCode: 429,
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retrySec),
      }),
      body: JSON.stringify({
        error: 'Account temporarily locked',
        message: `Too many failed login attempts. Try again in ${lockMins} minute(s).`,
        retryAfter: retrySec,
        locked: true,
      }),
    };
  }

  const authResult = await signInWithPasswordServer(
    supabaseUrl,
    anonKey,
    normalizedEmail,
    password,
    normalizedCaptchaToken
  );

  if (!authResult.ok) {
    if (shouldRecordCredentialFailure(authResult)) {
      recordLoginRateLimitFailure(event, normalizedEmail);
    }

    if (authResult.status === 429) {
      const retrySec = parseInt(authResult.headers?.get?.('retry-after') || '300', 10);
      return {
        statusCode: 429,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retrySec),
        }),
        body: JSON.stringify({
          error: 'Too many login attempts',
          message:
            authResult.body?.msg ||
            authResult.body?.message ||
            'Too many sign-in attempts. Please wait and try again.',
          retryAfter: retrySec,
          locked: true,
        }),
      };
    }

    const failureMeta = shouldRecordCredentialFailure(authResult)
      ? await recordLoginFailure(admin, normalizedEmail)
      : null;
    const locked = failureMeta?.locked === true;

    if (locked) {
      const retrySec = failureMeta.retry_after_seconds || 900;
      const lockMins = failureMeta.lock_minutes || Math.max(1, Math.ceil(retrySec / 60));
      const lockoutCount = failureMeta.lockout_count;
      let message = `Too many failed login attempts. Try again in ${lockMins} minute(s).`;
      if (lockoutCount != null && lockoutCount > 1) {
        message += ' Repeated lockouts increase wait time (15 → 30 → 60 minutes).';
      }
      return {
        statusCode: 429,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retrySec),
        }),
        body: JSON.stringify({
          error: 'Account temporarily locked',
          message,
          retryAfter: retrySec,
          locked: true,
          lockMinutes: lockMins,
        }),
      };
    }

    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: GENERIC_AUTH_ERROR }),
    };
  }

  const session = authResult.body;
  const user = session?.user;
  if (!session?.access_token || !user) {
    recordLoginRateLimitFailure(event, normalizedEmail);
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
  loginTokenConsumed = true;

  const portalRole = isTechnician ? 'technician' : 'admin';
  const cookieMaxAge = Math.min(Math.max(Number(session.expires_in) || 43200, 300), 60 * 60 * 24 * 7);
  const portalCookie = signPortalCookie(portalRole, cookieMaxAge);

  return {
    statusCode: 200,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Set-Cookie': cookieHeader(portalCookie, cookieMaxAge),
    }),
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user,
    }),
  };
  } finally {
    if (!loginTokenConsumed) {
      releaseLoginTokenReservation(tokenCheck.consumeKey);
    }
  }
};
