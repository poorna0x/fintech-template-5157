/**
 * Pure helpers for the family office-status PWA.
 * GPS and Maps stay server-side; this module never returns coordinates.
 */
const crypto = require('crypto');

const OFFICE_RADIUS_M = 1000;
const FRESH_FIX_MAX_AGE_MS = 2 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,48}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OFFICE_LOCATION_KEY = 'office_location';
const COOKIE_NAME = 'hro_where';
const COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function newPublicToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function isValidPublicToken(token) {
  return TOKEN_RE.test(String(token || '').trim());
}

function isUuid(id) {
  return UUID_RE.test(String(id || '').trim());
}

function haversineDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isInOffice(meters) {
  return Number.isFinite(meters) && meters <= OFFICE_RADIUS_M;
}

/** In office for the family page: 1 km, plus GPS slop, plus a short hop (≤5 min). */
function isAtOfficeStatus({ meters, etaMinutes, accuracy }) {
  const slop = Number.isFinite(Number(accuracy)) ? Math.min(Math.max(Number(accuracy), 0), 500) : 0;
  if (Number.isFinite(meters) && meters <= OFFICE_RADIUS_M + slop) return true;
  if (Number.isFinite(etaMinutes) && etaMinutes <= 5) return true;
  return false;
}

function etaMinutesFromDurationSec(durationSec) {
  const n = Number(durationSec);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.max(1, Math.ceil(n / 60));
}

/** ~22 km/h mixed Bengaluru traffic when Distance Matrix is unavailable (localhost referer keys). */
function estimateDriveSecFromMeters(meters) {
  const n = Number(meters);
  if (!Number.isFinite(n) || n < 50) return null;
  return Math.round((n / 1000 / 22) * 3600);
}

function firstNameFromFullName(fullName) {
  const first = String(fullName || '')
    .trim()
    .split(/\s+/)[0];
  if (!first) return '';
  return first.slice(0, 24);
}

function parseLatLng(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.latitude ?? value.lat);
  const lng = Number(value.longitude ?? value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseOfficeValue(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return parseLatLng(value);
}

function linkIsActive(row) {
  if (!row) return false;
  if (row.enabled !== true) return false;
  if (row.revoked_at) return false;
  return true;
}

function shouldRefuseStatus({ enabled, revokedAt, accountStatus }) {
  if (enabled !== true) return true;
  if (revokedAt) return true;
  if (String(accountStatus || '').toUpperCase() !== 'ACTIVE') return true;
  return false;
}

function publicNotFound() {
  return { ok: false, error: 'not_found' };
}

function pickCoords(liveRow, currentLocation) {
  const live = parseLatLng(liveRow);
  const liveAt = live ? liveRow?.fix_time || liveRow?.updated_at || null : null;
  const cur = parseLatLng(currentLocation);
  const curAt =
    cur && currentLocation && typeof currentLocation === 'object'
      ? currentLocation.lastUpdated || null
      : null;
  const liveMs = liveAt ? new Date(liveAt).getTime() : 0;
  const curMs = curAt ? new Date(curAt).getTime() : 0;
  if (live && (!cur || liveMs >= curMs)) {
    return { coords: live, fixAt: liveAt, source: 'live', accuracy: liveRow?.accuracy ?? null };
  }
  if (cur) {
    return {
      coords: cur,
      fixAt: curAt,
      source: 'current',
      accuracy: currentLocation?.accuracy ?? null,
    };
  }
  return { coords: null, fixAt: null, source: null, accuracy: null };
}

function isFixFresh(fixAt, nowMs = Date.now(), maxAgeMs = FRESH_FIX_MAX_AGE_MS) {
  if (!fixAt) return false;
  const t = new Date(fixAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= 0 && nowMs - t < maxAgeMs;
}

function turnstileConfigured() {
  return String(process.env.TURNSTILE_SECRET_KEY || '').trim().length > 0;
}

function cookieSecret() {
  const dedicated = String(process.env.PUSH_REPLY_HMAC_SECRET || '').trim();
  if (dedicated) return dedicated;
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (service) return service;
  const altcha = String(process.env.ALTCHA_HMAC_KEY || '').trim();
  return altcha;
}

function signWhereCookie(tokenHash, expSec) {
  const secret = cookieSecret();
  if (!secret) return null;
  const body = `${tokenHash.slice(0, 16)}.${expSec}`;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyWhereCookie(raw, tokenHash) {
  const secret = cookieSecret();
  if (!secret || !raw) return false;
  const parts = String(raw).split('.');
  if (parts.length !== 3) return false;
  const [th, expStr, sig] = parts;
  if (th !== tokenHash.slice(0, 16)) return false;
  const expSec = Number(expStr);
  if (!Number.isFinite(expSec) || expSec * 1000 < Date.now()) return false;
  const body = `${th}.${expStr}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readCookie(header, name) {
  const raw = String(header || '');
  const parts = raw.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

function whereCookieHeader(value, secure) {
  const bits = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

async function verifyTurnstileToken(token, remoteIp) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return true;
  const response = String(token || '').trim();
  if (!response) return false;
  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', response);
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => null);
    return Boolean(data && data.success === true);
  } catch {
    return false;
  }
}

function clientIp(event) {
  return String(
    event.headers['x-nf-client-connection-ip'] ||
      event.headers['x-forwarded-for'] ||
      event.headers['client-ip'] ||
      ''
  )
    .split(',')[0]
    .trim();
}

function getServiceDb() {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function familyStatusPath(token) {
  return `/where/${encodeURIComponent(token)}`;
}

module.exports = {
  OFFICE_RADIUS_M,
  FRESH_FIX_MAX_AGE_MS,
  OFFICE_LOCATION_KEY,
  COOKIE_NAME,
  COOKIE_MAX_AGE_SEC,
  sha256Hex,
  newPublicToken,
  isValidPublicToken,
  isUuid,
  haversineDistanceMeters,
  isInOffice,
  isAtOfficeStatus,
  etaMinutesFromDurationSec,
  estimateDriveSecFromMeters,
  firstNameFromFullName,
  parseLatLng,
  parseOfficeValue,
  linkIsActive,
  shouldRefuseStatus,
  publicNotFound,
  pickCoords,
  isFixFresh,
  turnstileConfigured,
  signWhereCookie,
  verifyWhereCookie,
  readCookie,
  whereCookieHeader,
  verifyTurnstileToken,
  clientIp,
  getServiceDb,
  familyStatusPath,
};
