// ALTCHA-gated, rate-limited website booking intent (service_role RPC only).
const crypto = require('crypto');
const {
  preflightOrReject,
  verifyAltcha,
  getServiceClient,
  normalizePhoneDigits,
  isValidIndianMobile,
  jsonResponse,
  getClientIdentifier,
} = require('./booking-guard');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');

const SITE_KEYS = new Set(['hydrogenro', 'elevenro']);

function hashClientIp(event) {
  const ip = getClientIdentifier(event);
  const pepper =
    process.env.BOOKING_IP_HASH_PEPPER || process.env.ALTCHA_HMAC_KEY || 'booking-ip-pepper';
  return crypto.createHmac('sha256', pepper).update(String(ip)).digest('hex').slice(0, 32);
}

async function countRecentByIp(admin, ipHash) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from('website_booking_intent')
    .select('id', { count: 'exact', head: true })
    .eq('client_ip_hash', ipHash)
    .gte('updated_at', since);
  if (error) return { count: 0, error };
  return { count: count || 0, error: null };
}

exports.handler = async (event) => {
  const pre = preflightOrReject(event);
  if (pre.handled) return pre.response;
  const corsHeaders = pre.corsHeaders;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const action = body.action === 'mark-booked' ? 'mark-booked' : 'upsert';
  const phoneNorm = normalizePhoneDigits(body.phone || body.phone_normalized);
  if (!isValidIndianMobile(phoneNorm)) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid phone number' });
  }

  // NOTE: an `upsert` is an idempotent write keyed by (phone_normalized,
  // site_key) — one phone == one row no matter how many times it's sent. A
  // single legitimate customer now emits one update per step AND per debounced
  // keystroke, so a low cap (was 3) silently 429'd steps 4–5 and dropped the
  // final pre-submit flush. Flood abuse from many DIFFERENT phones on one IP is
  // bounded separately by the quarantine logic below, so these caps can be
  // generous while still stopping a runaway client.
  const ipLimit = checkRateLimit(event, {
    maxRequests: action === 'upsert' ? 80 : 10,
    windowMs: 3_600_000,
    endpoint: `booking-intent-${action}`,
  });
  if (!ipLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many requests',
      message: 'Please wait before trying again.',
    });
  }

  const phoneLimit = checkRateLimitForKey(phoneNorm, {
    maxRequests: action === 'upsert' ? 60 : 10,
    windowMs: 3_600_000,
    endpoint: `booking-intent-${action}-phone`,
  });
  if (!phoneLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many requests',
      message: 'Please wait before trying again.',
    });
  }

  // ALTCHA intentionally NOT required for live booking intent: this is a
  // best-effort "someone is filling the form" signal that must be captured the
  // instant a name + phone are typed (before proof-of-work could finish).
  // Spam is bounded by the IP/phone rate limits above + the quarantine logic
  // below. The actual booking (booking-job-create) STILL enforces ALTCHA + OTP.
  // If a token happens to be present we validate it (free signal), but a missing
  // or invalid token is not fatal here.
  if (body.altchaLoginToken) {
    const altcha = verifyAltcha(body, corsHeaders);
    if (!altcha.ok) {
      console.warn('[booking-intent] altcha token present but invalid — accepting intent anyway');
    }
  }

  const client = getServiceClient();
  if (client.error) {
    return jsonResponse(500, corsHeaders, { error: client.error });
  }

  const siteKey =
    typeof body.site_key === 'string' && SITE_KEYS.has(body.site_key) ? body.site_key : 'hydrogenro';

  if (action === 'mark-booked') {
    const jobNumber = String(body.job_number || '').trim();
    if (jobNumber.length < 3) {
      return jsonResponse(400, corsHeaders, { error: 'Invalid job number' });
    }

    const { error } = await client.admin.rpc('mark_website_booking_intent_booked', {
      p_phone_normalized: phoneNorm,
      p_site_key: siteKey,
      p_job_number: jobNumber,
    });

    if (error) {
      console.error('[booking-intent mark-booked]', error.message, { ip: getClientIdentifier(event) });
      return jsonResponse(500, corsHeaders, { error: 'Could not update intent' });
    }

    return jsonResponse(200, corsHeaders, { ok: true });
  }

  const fullName = String(body.full_name || '').trim();
  const currentStep = Number(body.current_step);
  if (fullName.length < 2 || fullName.length > 200) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid name' });
  }
  if (!Number.isInteger(currentStep) || currentStep < 1 || currentStep > 5) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid step' });
  }

  const ipHash = hashClientIp(event);
  const { count: recentIpCount, error: countErr } = await countRecentByIp(client.admin, ipHash);
  if (countErr) {
    console.error('[booking-intent count]', countErr.message);
  }
  // Distinct intent ROWS (different phones) from one IP in the last hour. This
  // is the real anti-flood signal; keep it lenient enough that a shared office/
  // household IP with a few genuine customers isn't hidden from the banner.
  const quarantined = recentIpCount >= 12;

  const { error } = await client.admin.rpc('upsert_website_booking_intent', {
    p_full_name: fullName,
    p_phone: String(body.phone || phoneNorm),
    p_phone_normalized: phoneNorm,
    p_current_step: currentStep,
    p_site_key: siteKey,
    p_client_ip_hash: ipHash,
    p_quarantined: quarantined,
  });

  if (error) {
    console.error('[booking-intent upsert]', error.message, { ip: getClientIdentifier(event) });
    return jsonResponse(500, corsHeaders, { error: 'Could not save intent' });
  }

  return jsonResponse(200, corsHeaders, { ok: true, quarantined });
};
