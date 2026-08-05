// Public customer track page — returns job/tech location snapshot for /track/{code}.
// Optionally pings the technician for a fresher fix (rate-limited per link).
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./cors-helper');
const { sendTechnicianLocationPing } = require('./location-ping-core');

const PING_COOLDOWN_MS = 45_000;
const FRESH_FIX_MAX_AGE_MS = 2 * 60_000;
const ARRIVED_THRESHOLD_M = 280;

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
}

function pickCoords(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function resolveJobDestinationCoords(job) {
  const customer = job?.customer || {};
  for (const loc of [customer.location, job.service_location, job.serviceLocation]) {
    const coords = pickCoords(loc);
    if (coords) return coords;
  }
  return null;
}

function fixTimeOf(row) {
  return row?.fix_time || row?.updated_at || null;
}

function pickTechnicianCoords(liveRow, techRow) {
  const liveLat = liveRow?.latitude;
  const liveLng = liveRow?.longitude;
  if (liveLat != null && liveLng != null) {
    const fixIso = fixTimeOf(liveRow);
    const ageMs = fixIso ? Date.now() - new Date(fixIso).getTime() : Infinity;
    if (ageMs < 15 * 60_000) {
      return {
        lat: Number(liveLat),
        lng: Number(liveLng),
        updatedAt: liveRow.updated_at || null,
        fixTime: liveRow.fix_time || null,
        source: 'live',
      };
    }
  }

  const cur = techRow?.current_location;
  const coords = pickCoords(cur);
  if (coords) {
    return {
      lat: coords.lat,
      lng: coords.lng,
      updatedAt: cur?.lastUpdated || null,
      fixTime: cur?.lastUpdated || null,
      source: 'cached',
    };
  }

  if (liveLat != null && liveLng != null) {
    return {
      lat: Number(liveLat),
      lng: Number(liveLng),
      updatedAt: liveRow.updated_at || null,
      fixTime: liveRow.fix_time || null,
      source: 'live_stale',
    };
  }

  return null;
}

function locationIsFresh(coords) {
  if (!coords?.fixTime && !coords?.updatedAt) return false;
  const iso = coords.fixTime || coords.updatedAt;
  return Date.now() - new Date(iso).getTime() < FRESH_FIX_MAX_AGE_MS;
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const code = String(event.queryStringParameters?.code || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');
  if (code.length < 6 || code.length > 16) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, phase: 'invalid' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, phase: 'error' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: link, error: linkErr } = await db
    .from('job_track_links')
    .select('code, job_id, brand, expires_at, last_ping_at')
    .eq('code', code)
    .maybeSingle();

  if (linkErr || !link) {
    return { statusCode: 404, headers, body: JSON.stringify({ ok: false, phase: 'expired' }) };
  }
  if (new Date(link.expires_at).getTime() <= Date.now()) {
    return { statusCode: 410, headers, body: JSON.stringify({ ok: false, phase: 'expired' }) };
  }

  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select(
      'id, status, assigned_technician_id, service_location, customer:customers(full_name, location)'
    )
    .eq('id', link.job_id)
    .maybeSingle();

  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ ok: false, phase: 'expired' }) };
  }

  const status = String(job.status || '').toUpperCase();
  const techId = job.assigned_technician_id;

  if (['COMPLETED', 'CANCELLED'].includes(status)) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        phase: 'completed',
        brand: link.brand,
        jobStatus: status,
      }),
    };
  }

  if (status !== 'EN_ROUTE' && status !== 'IN_PROGRESS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        phase: 'not_started',
        brand: link.brand,
        jobStatus: status,
      }),
    };
  }

  let techName = 'Technician';
  let techPhone = '';
  let liveRow = null;
  let techRow = null;

  if (techId) {
    const [{ data: tech }, { data: live }] = await Promise.all([
      db.from('technicians').select('id, full_name, phone, current_location').eq('id', techId).maybeSingle(),
      db
        .from('technician_live_locations')
        .select('latitude, longitude, accuracy, is_tracking, updated_at, fix_time')
        .eq('technician_id', techId)
        .maybeSingle(),
    ]);
    techRow = tech;
    liveRow = live;
    techName = tech?.full_name || techName;
    techPhone = tech?.phone || '';
  }

  const techCoords = pickTechnicianCoords(liveRow, techRow);
  const destCoords = resolveJobDestinationCoords(job);

  let distanceToCustomerM = null;
  let arrived = false;
  if (techCoords && destCoords) {
    distanceToCustomerM = Math.round(haversineM(techCoords, destCoords));
    arrived = distanceToCustomerM <= ARRIVED_THRESHOLD_M;
  }

  const shouldPing =
    techId &&
    liveRow?.is_tracking &&
    (status === 'EN_ROUTE' || (status === 'IN_PROGRESS' && !arrived)) &&
    (!locationIsFresh(techCoords) ||
      !link.last_ping_at ||
      Date.now() - new Date(link.last_ping_at).getTime() > PING_COOLDOWN_MS);

  if (shouldPing) {
    void sendTechnicianLocationPing(db, techId).then(() =>
      db
        .from('job_track_links')
        .update({ last_ping_at: new Date().toISOString() })
        .eq('code', code)
    );
  }

  let phase = 'en_route';
  if (status === 'IN_PROGRESS') {
    phase = arrived ? 'arrived' : 'working_away';
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      phase,
      brand: link.brand,
      jobStatus: status,
      techName,
      techPhone,
      latitude: techCoords?.lat ?? null,
      longitude: techCoords?.lng ?? null,
      locationUpdatedAt: techCoords?.updatedAt ?? null,
      fixTime: techCoords?.fixTime ?? null,
      locationSource: techCoords?.source ?? null,
      distanceToCustomerM,
      destLatitude: destCoords?.lat ?? null,
      destLongitude: destCoords?.lng ?? null,
    }),
  };
};
