/**
 * Public family office-status. Token possession is auth.
 * Never returns GPS, km, or Maps payloads. Kill switch checked before ping.
 */
const crypto = require('crypto');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');
const { drivingRouteAvoidTolls } = require('./google-avoid-tolls-distance');
const { sendTechnicianLocationPing, pingRequestedAgeMs } = require('./location-ping-helper');
const {
  isValidPublicToken,
  sha256Hex,
  publicNotFound,
  shouldRefuseStatus,
  parseOfficeValue,
  pickCoords,
  isFixFresh,
  isAtOfficeStatus,
  haversineDistanceMeters,
  etaMinutesFromDurationSec,
  estimateDriveSecFromMeters,
  firstNameFromFullName,
  OFFICE_LOCATION_KEY,
  COOKIE_NAME,
  COOKIE_MAX_AGE_SEC,
  turnstileConfigured,
  verifyWhereCookie,
  signWhereCookie,
  readCookie,
  whereCookieHeader,
  verifyTurnstileToken,
  clientIp,
  getServiceDb,
} = require('./tech-office-status-helper');

const OFFICE_CACHE_MS = 5 * 60 * 1000;
let officeCache = { at: 0, parsed: undefined };

async function loadOffice(db) {
  if (officeCache.parsed !== undefined && Date.now() - officeCache.at < OFFICE_CACHE_MS) {
    return officeCache.parsed;
  }
  const { data: officeRow } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', OFFICE_LOCATION_KEY)
    .maybeSingle();
  officeCache = { at: Date.now(), parsed: parseOfficeValue(officeRow?.value) };
  return officeCache.parsed;
}

function json(statusCode, corsHeaders, payload, extraHeaders) {
  return {
    statusCode,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...(extraHeaders || {}),
    }),
    body: JSON.stringify(payload),
  };
}

function rateLimitsOn() {
  if (typeof isRateLimitEnabled === 'function') return isRateLimitEnabled();
  const context = process.env.CONTEXT;
  return Boolean(context && context !== 'dev');
}

function limited(event, corsHeaders, token) {
  if (!rateLimitsOn()) return null;
  const ip = checkRateLimit(event, {
    maxRequests: 40,
    windowMs: 60_000,
    endpoint: 'tech-office-status-ip',
  });
  if (!ip.allowed) {
    const base = rateLimitResponseForKey(ip);
    return { ...base, headers: addSecurityHeaders({ ...corsHeaders, ...base.headers }) };
  }
  const tokenKey = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
  const perToken = checkRateLimitForKey(`tech-office-status:${tokenKey}`, {
    maxRequests: 20,
    windowMs: 60_000,
    endpoint: 'tech-office-status-token',
  });
  if (!perToken.allowed) {
    const base = rateLimitResponseForKey(perToken);
    return { ...base, headers: addSecurityHeaders({ ...corsHeaders, ...base.headers }) };
  }
  return null;
}

function pingLimited(event, corsHeaders, token) {
  if (!rateLimitsOn()) return null;
  const tokenKey = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
  const perToken = checkRateLimitForKey(`tech-office-status-ping:${tokenKey}`, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
    endpoint: 'tech-office-status-ping-hour',
  });
  if (!perToken.allowed) {
    const base = rateLimitResponseForKey(perToken);
    return { ...base, headers: addSecurityHeaders({ ...corsHeaders, ...base.headers }) };
  }
  return null;
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(corsHeaders), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, corsHeaders, { error: 'Method not allowed' });
  }
  if (origin && !isOriginAllowed(origin)) {
    return json(403, corsHeaders, { error: 'Forbidden' });
  }
  if ((event.body || '').length > 8_000) {
    return json(413, corsHeaders, { error: 'Payload too large' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const token = String(body.token || '').trim();
  if (!isValidPublicToken(token)) {
    return json(400, corsHeaders, publicNotFound());
  }

  const blocked = limited(event, corsHeaders, token);
  if (blocked) return blocked;

  const db = getServiceDb();
  if (!db) return json(500, corsHeaders, { ok: false, error: 'failed' });

  const tokenHash = sha256Hex(token);
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const existingCookie = readCookie(cookieHeader, COOKIE_NAME);
  const cookieOk = verifyWhereCookie(existingCookie, tokenHash);

  if (turnstileConfigured() && !cookieOk) {
    const ok = await verifyTurnstileToken(body.turnstileToken, clientIp(event));
    if (!ok) {
      return json(403, corsHeaders, { ok: false, error: 'bot' });
    }
  }

  try {
    const { data: link, error: linkErr } = await db
      .from('technician_office_status_links')
      .select('technician_id, enabled, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (linkErr) {
      console.warn('[tech-office-status] link', linkErr.message);
      return json(500, corsHeaders, { ok: false, error: 'failed' });
    }

    const refuse = json(404, corsHeaders, publicNotFound());
    if (!link) return refuse;
    if (link.enabled !== true || link.revoked_at) return refuse;

    const [{ data: tech, error: techErr }, office, { data: live }] = await Promise.all([
      db
        .from('technicians')
        .select('id, full_name, account_status, current_location')
        .eq('id', link.technician_id)
        .maybeSingle(),
      loadOffice(db),
      db
        .from('technician_live_locations')
        .select('latitude, longitude, accuracy, is_tracking, updated_at, fix_time, ping_requested_at')
        .eq('technician_id', link.technician_id)
        .maybeSingle(),
    ]);
    if (techErr) {
      console.warn('[tech-office-status] tech', techErr.message);
      return json(500, corsHeaders, { ok: false, error: 'failed' });
    }
    if (
      !tech ||
      shouldRefuseStatus({
        enabled: link.enabled,
        revokedAt: link.revoked_at,
        accountStatus: tech.account_status,
      })
    ) {
      return refuse;
    }

    const picked = pickCoords(live, tech.current_location);
    const fresh = isFixFresh(picked.fixAt);
    const userRefresh = body.refresh === true;
    const isPoll = body.poll === true;
    let pending = false;

    if (!fresh) {
      if (!isPoll) {
        const hourBlock = pingLimited(event, corsHeaders, token);
        if (!hourBlock) {
          const ping = await sendTechnicianLocationPing(db, tech.id, {
            pingRequestedAt: live?.ping_requested_at,
            liveRow: live,
            force: userRefresh,
          });
          if (ping.sent) pending = true;
        }
      }
      if (pending || pingRequestedAgeMs(live?.ping_requested_at, Date.now()) < 40_000) {
        pending = true;
      }
    }

    if (!isPoll) {
      void db
        .from('technician_office_status_links')
        .update({ last_used_at: new Date().toISOString() })
        .eq('technician_id', tech.id);
    }

    const firstName = firstNameFromFullName(tech.full_name);
    const checkedAt = picked.fixAt || new Date().toISOString();

    const extraHeaders = {};
    if (!cookieOk) {
      const expSec = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SEC;
      const signed = signWhereCookie(tokenHash, expSec);
      if (signed) {
        const secure = String(origin || '').startsWith('https://') || Boolean(process.env.NETLIFY);
        extraHeaders['Set-Cookie'] = whereCookieHeader(signed, secure);
      }
    }

    if (!office || !picked.coords) {
      return json(
        200,
        corsHeaders,
        {
          ok: true,
          status: pending ? 'checking' : 'unknown',
          firstName,
          checkedAt,
          live: false,
          pending,
        },
        extraHeaders
      );
    }

    const meters = haversineDistanceMeters(picked.coords, office);
    if (
      isAtOfficeStatus({
        meters,
        accuracy: picked.accuracy,
      })
    ) {
      return json(
        200,
        corsHeaders,
        {
          ok: true,
          status: 'in_office',
          firstName,
          checkedAt,
          live: fresh,
          pending,
        },
        extraHeaders
      );
    }

    // Stale GPS farther than the office geofence — don't show an old "5 min" while we wait.
    if (pending && !fresh) {
      return json(
        200,
        corsHeaders,
        {
          ok: true,
          status: 'checking',
          firstName,
          checkedAt,
          live: false,
          pending: true,
        },
        extraHeaders
      );
    }

    const route = await drivingRouteAvoidTolls(picked.coords, office, { traffic: true });
    const etaMinutes =
      etaMinutesFromDurationSec(route?.durationSec) ||
      etaMinutesFromDurationSec(estimateDriveSecFromMeters(meters));

    if (etaMinutes == null) {
      return json(
        200,
        corsHeaders,
        {
          ok: true,
          status: 'unknown',
          firstName,
          checkedAt,
          live: fresh,
          pending: false,
        },
        extraHeaders
      );
    }

    return json(
      200,
      corsHeaders,
      {
        ok: true,
        status: 'en_route',
        etaMinutes,
        firstName,
        checkedAt,
        live: fresh,
        pending: false,
      },
      extraHeaders
    );
  } catch (err) {
    console.error('[tech-office-status]', err?.message || err);
    return json(500, corsHeaders, { ok: false, error: 'failed' });
  }
};
