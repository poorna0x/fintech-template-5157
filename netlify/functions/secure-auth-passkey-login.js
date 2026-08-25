// Rate-limited, ALTCHA-gated proxy for Supabase passkey (WebAuthn) admin/technician login.
// Clients must not call GoTrue /passkeys/authentication/* directly for sign-in.
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed, isProduction } = require('./cors-helper');
const {
  checkPasskeyRateLimits,
  recordPasskeyRateLimitUse,
} = require('./auth-rate-limits');
const { addSecurityHeaders } = require('./security-headers');
const {
  verifyLoginToken,
  tryReserveLoginToken,
  releaseLoginTokenReservation,
  consumeLoginToken,
  isPlaceholderKey,
} = require('./altcha-guard');
const { checkLoginAllowed, recordLoginSuccess } = require('./auth-lockout');
const { signPortalCookie, cookieHeader } = require('./portal-session');

const GENERIC_PASSKEY_ERROR = 'Passkey sign-in failed';
const MAX_CHALLENGE_ID_LEN = 128;
const MAX_CREDENTIAL_JSON_LEN = 16_384;

function jsonResponse(statusCode, corsHeaders, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    }),
    body: JSON.stringify(body),
  };
}

function corsPrecheck(event) {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { done: jsonResponse(200, corsHeaders, {}) };
  }

  if (isProduction() && !requestOrigin) {
    return {
      done: {
        statusCode: 403,
        headers: addSecurityHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Forbidden' }),
      },
    };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      done: {
        statusCode: 403,
        headers: addSecurityHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Forbidden: Origin not allowed' }),
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return { done: jsonResponse(405, corsHeaders, { error: 'Method not allowed' }) };
  }

  return { corsHeaders };
}

function publicGoTruePasskeyError(status, body) {
  const code = String(body?.error_code || body?.code || body?.error || '').toLowerCase();
  const msg = String(body?.msg || body?.message || '').toLowerCase();
  if (
    status === 404 ||
    status === 501 ||
    code.includes('passkey_disabled') ||
    code.includes('not_enabled') ||
    (msg.includes('passkey') && msg.includes('disabled'))
  ) {
    return 'Passkeys are not enabled yet. Turn them on in Supabase → Authentication → Passkeys.';
  }
  if (status === 429) return 'Too many sign-in attempts. Please wait and try again.';
  return GENERIC_PASSKEY_ERROR;
}

async function gotruePasskey(supabaseUrl, anonKey, path, payload) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1${path}`, {
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

function parseBody(event) {
  try {
    return { ok: true, body: JSON.parse(event.body || '{}') };
  } catch {
    return { ok: false };
  }
}

exports.handler = async (event) => {
  const pre = corsPrecheck(event);
  if (pre.done) return pre.done;
  const corsHeaders = pre.corsHeaders;

  if (process.env.CONTEXT === 'production' && isPlaceholderKey()) {
    return jsonResponse(503, corsHeaders, {
      error: 'Login protection unavailable',
      message: 'Set ALTCHA_HMAC_KEY in Netlify environment.',
    });
  }

  const parsed = parseBody(event);
  if (!parsed.ok) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const body = parsed.body || {};
  const step = body.step === 'verify' ? 'verify' : body.step === 'start' ? 'start' : '';
  const { altchaLoginToken, altchaPayload, captchaToken } = body;
  const expectedPortal = body.portal === 'technician' ? 'technician' : 'admin';

  if (!step || !altchaLoginToken || typeof altchaLoginToken !== 'string') {
    return jsonResponse(400, corsHeaders, {
      error: 'Missing security verification',
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse(500, corsHeaders, { error: 'Server misconfigured' });
  }

  const tokenCheck = verifyLoginToken(altchaLoginToken, altchaPayload);
  if (!tokenCheck.ok) {
    return jsonResponse(403, corsHeaders, {
      error: tokenCheck.error || 'Security verification required',
    });
  }

  if (step === 'start') {
    const rateLimits = checkPasskeyRateLimits(event, corsHeaders);
    if (rateLimits.blocked) return rateLimits.response;

    const normalizedCaptchaToken =
      typeof captchaToken === 'string' && captchaToken.length > 0 && captchaToken.length <= 4096
        ? captchaToken
        : '';
    const turnstileServerConfigured =
      typeof process.env.TURNSTILE_SECRET_KEY === 'string' &&
      process.env.TURNSTILE_SECRET_KEY.trim().length > 0;
    if (turnstileServerConfigured && !normalizedCaptchaToken) {
      return jsonResponse(403, corsHeaders, { error: 'Security verification required' });
    }

    const payload = {};
    if (normalizedCaptchaToken) {
      payload.gotrue_meta_security = { captcha_token: normalizedCaptchaToken };
    }

    const authResult = await gotruePasskey(
      supabaseUrl,
      anonKey,
      '/passkeys/authentication/options',
      payload
    );
    if (!authResult.ok) {
      recordPasskeyRateLimitUse(event);
      const retrySec = parseInt(authResult.headers?.get?.('retry-after') || '300', 10);
      if (authResult.status === 429) {
        return jsonResponse(
          429,
          corsHeaders,
          {
            error: 'Too many login attempts',
            message: publicGoTruePasskeyError(authResult.status, authResult.body),
            retryAfter: retrySec,
            locked: true,
          },
          { 'Retry-After': String(retrySec) }
        );
      }
      return jsonResponse(authResult.status === 404 ? 503 : 401, corsHeaders, {
        error: publicGoTruePasskeyError(authResult.status, authResult.body),
      });
    }

    const challengeId = authResult.body?.challenge_id;
    const options = authResult.body?.options;
    if (!challengeId || !options) {
      recordPasskeyRateLimitUse(event);
      return jsonResponse(502, corsHeaders, { error: GENERIC_PASSKEY_ERROR });
    }

    recordPasskeyRateLimitUse(event);
    return jsonResponse(200, corsHeaders, {
      challenge_id: challengeId,
      options,
      expires_at: authResult.body?.expires_at,
    });
  }

  const challengeId = typeof body.challenge_id === 'string' ? body.challenge_id.trim() : '';
  const credential = body.credential;
  if (
    !challengeId ||
    challengeId.length > MAX_CHALLENGE_ID_LEN ||
    !credential ||
    typeof credential !== 'object'
  ) {
    return jsonResponse(400, corsHeaders, { error: 'Missing passkey assertion' });
  }
  let credentialLen = 0;
  try {
    credentialLen = JSON.stringify(credential).length;
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Missing passkey assertion' });
  }
  if (credentialLen > MAX_CREDENTIAL_JSON_LEN) {
    return jsonResponse(400, corsHeaders, { error: 'Missing passkey assertion' });
  }

  const reserve = tryReserveLoginToken(tokenCheck.consumeKey);
  if (!reserve.ok) {
    return jsonResponse(403, corsHeaders, {
      error: reserve.error || 'Security verification required',
    });
  }

  let loginTokenConsumed = false;
  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authResult = await gotruePasskey(
      supabaseUrl,
      anonKey,
      '/passkeys/authentication/verify',
      { challenge_id: challengeId, credential }
    );

    if (!authResult.ok) {
      recordPasskeyRateLimitUse(event);
      return jsonResponse(401, corsHeaders, {
        error: publicGoTruePasskeyError(authResult.status, authResult.body),
      });
    }

    const session = authResult.body;
    const user = session?.user;
    if (!session?.access_token || !session?.refresh_token || !user) {
      recordPasskeyRateLimitUse(event);
      return jsonResponse(401, corsHeaders, { error: GENERIC_PASSKEY_ERROR });
    }

    const role = user.app_metadata?.role || user.user_metadata?.role || 'admin';
    const isTechnician = role === 'technician';

    if (expectedPortal === 'technician' && !isTechnician) {
      recordPasskeyRateLimitUse(event);
      return jsonResponse(403, corsHeaders, {
        error: 'Use the admin login page for this account.',
      });
    }

    if (expectedPortal === 'admin' && isTechnician) {
      recordPasskeyRateLimitUse(event);
      return jsonResponse(403, corsHeaders, {
        error: 'Use the technician login page for this account.',
      });
    }

    if (expectedPortal === 'technician') {
      const { data: tech, error: techError } = await admin
        .from('technicians')
        .select('id, account_status')
        .eq('id', user.id)
        .single();

      if (techError || !tech || tech.account_status !== 'ACTIVE') {
        recordPasskeyRateLimitUse(event);
        return jsonResponse(403, corsHeaders, { error: 'Account is not active' });
      }
    }

    const normalizedEmail = typeof user.email === 'string' ? user.email.toLowerCase().trim() : '';
    if (normalizedEmail) {
      const lockStatus = await checkLoginAllowed(admin, normalizedEmail);
      if (lockStatus.allowed === false) {
        if (lockStatus.reason === 'lockout_service_unavailable') {
          const retrySec = lockStatus.retry_after_seconds || 60;
          return jsonResponse(
            503,
            corsHeaders,
            {
              error: 'Login service temporarily unavailable. Please try again shortly.',
              retryAfter: retrySec,
            },
            { 'Retry-After': String(retrySec) }
          );
        }
        const retrySec = lockStatus.retry_after_seconds || 900;
        const lockMins = Math.max(1, Math.ceil(retrySec / 60));
        return jsonResponse(
          429,
          corsHeaders,
          {
            error: 'Account temporarily locked',
            message: `Too many failed login attempts. Try again in ${lockMins} minute(s).`,
            retryAfter: retrySec,
            locked: true,
          },
          { 'Retry-After': String(retrySec) }
        );
      }
      await recordLoginSuccess(admin, normalizedEmail);
    }

    consumeLoginToken(tokenCheck.consumeKey, tokenCheck.exp);
    loginTokenConsumed = true;

    const cookieMaxAge = Math.min(
      Math.max(Number(session.expires_in) || 43200, 300),
      60 * 60 * 24 * 7
    );
    const portalCookie = signPortalCookie(isTechnician ? 'technician' : 'admin', cookieMaxAge);

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
