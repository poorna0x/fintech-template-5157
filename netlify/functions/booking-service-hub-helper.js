/**
 * Shared matcher for website booking + WhatsApp booking bot.
 * Empty / missing table = unrestricted (fail-open) so we never lock bookings
 * before hubs are configured.
 */

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isMissingTable(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('booking_service_hubs') &&
    (msg.includes('does not exist') ||
      msg.includes('schema cache') ||
      msg.includes('could not find the table'))
  );
}

function parseHubPolygon(raw) {
  if (!Array.isArray(raw)) return [];
  const points = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push({ lat, lng });
    if (points.length >= 16) break;
  }
  return points.length >= 3 ? points : [];
}

function pointInHubPolygon(lat, lng, ring) {
  if (!ring || ring.length < 3) return false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (pointOnSegment(lat, lng, ring[j], ring[i])) return true;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i].lat;
    const xi = ring[i].lng;
    const yj = ring[j].lat;
    const xj = ring[j].lng;
    const denom = yj - yi;
    if (denom === 0) continue;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointOnSegment(lat, lng, a, b) {
  const cross = (lng - a.lng) * (b.lat - a.lat) - (lat - a.lat) * (b.lng - a.lng);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (lng - a.lng) * (b.lng - a.lng) + (lat - a.lat) * (b.lat - a.lat);
  if (dot < -1e-10) return false;
  const lenSq = (b.lng - a.lng) ** 2 + (b.lat - a.lat) ** 2;
  return dot <= lenSq + 1e-10;
}

function distanceToSegmentKm(lat, lng, a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return haversineKm(lat, lng, a.lat, a.lng);
  const t = Math.max(0, Math.min(1, ((lng - a.lng) * dx + (lat - a.lat) * dy) / lenSq));
  return haversineKm(lat, lng, a.lat + t * dy, a.lng + t * dx);
}

function minDistanceKmToRing(lat, lng, ring) {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    min = Math.min(min, distanceToSegmentKm(lat, lng, ring[j], ring[i]));
  }
  return min;
}

function parseHubServiceKind(raw) {
  const value = String(raw || '').trim();
  if (value === 'callback' || value === 'no_service') return value;
  return 'normal';
}

function hubDisplayMessage(hub) {
  const custom = String(hub.customer_note || '').trim();
  if (custom) return custom;
  if (hub.service_kind === 'callback') {
    return 'We can come here, but not immediately. We’ll call you back to confirm the visit.';
  }
  if (hub.service_kind === 'no_service') {
    return 'We don’t serve this area right now. Please pick a closer location, or call us.';
  }
  return '';
}

function hubContainsPoint(hub, lat, lng) {
  const ring = parseHubPolygon(hub.polygon);
  if (ring.length >= 3) {
    if (pointInHubPolygon(lat, lng, ring)) return true;
    return minDistanceKmToRing(lat, lng, ring) <= 0.04;
  }
  return haversineKm(lat, lng, hub.lat, hub.lng) <= hub.radius_km + 0.04;
}

function isValidCoords(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function coordsFromBookingRow(row) {
  if (!row || typeof row !== 'object') return null;
  const loc = row.service_location || row.location || null;
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.latitude ?? loc.lat);
  const lng = Number(loc.longitude ?? loc.lng);
  if (!isValidCoords(lat, lng)) return null;
  return { lat, lng };
}

async function loadActiveHubs(admin) {
  let { data, error } = await admin
    .from('booking_service_hubs')
    .select('id,name,lat,lng,radius_km,polygon,service_kind,is_active,customer_note')
    .eq('is_active', true);
  if (error && String(error.message || '').toLowerCase().includes('service_kind')) {
    const retry = await admin
      .from('booking_service_hubs')
      .select('id,name,lat,lng,radius_km,polygon,is_active,customer_note')
      .eq('is_active', true);
    data = retry.data;
    error = retry.error;
  }
  if (error && String(error.message || '').toLowerCase().includes('polygon')) {
    const retry = await admin
      .from('booking_service_hubs')
      .select('id,name,lat,lng,radius_km,is_active,customer_note')
      .eq('is_active', true);
    data = retry.data;
    error = retry.error;
  }
  if (error && String(error.message || '').toLowerCase().includes('customer_note')) {
    const retry = await admin
      .from('booking_service_hubs')
      .select('id,name,lat,lng,radius_km,is_active')
      .eq('is_active', true);
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    if (isMissingTable(error.message)) {
      return { hubs: [], missingTable: true, error: null };
    }
    return { hubs: [], missingTable: false, error: error.message };
  }
  const hubs = (data || [])
    .map((row) => {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      const radius = Number(row.radius_km);
      if (!isValidCoords(lat, lng) || !Number.isFinite(radius) || radius <= 0) return null;
      return {
        id: row.id,
        name: String(row.name || '').trim(),
        lat,
        lng,
        radius_km: radius,
        polygon: parseHubPolygon(row.polygon),
        service_kind: parseHubServiceKind(row.service_kind),
        customer_note: String(row.customer_note || '').trim().slice(0, 240),
      };
    })
    .filter(Boolean);
  return { hubs, missingTable: false, error: null };
}

const DEFAULT_OUT_OF_AREA_MESSAGE =
  'We may not be able to come here. Please call us and we’ll see how we can help.';
const LEGACY_OUT_OF_AREA_MESSAGE =
  'We may not cover this area. Please call us if you need any help.';
const LEGACY_OUT_OF_AREA_MESSAGES = [
  LEGACY_OUT_OF_AREA_MESSAGE,
  'Give us a call and we’ll see how we can help.',
];

async function loadOutOfAreaMessage(admin) {
  try {
    const { data, error } = await admin
      .from('booking_service_hub_settings')
      .select('out_of_area_message')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_OUT_OF_AREA_MESSAGE;
    const custom = String(data.out_of_area_message || '').trim();
    if (!custom || LEGACY_OUT_OF_AREA_MESSAGES.includes(custom)) return DEFAULT_OUT_OF_AREA_MESSAGE;
    return custom;
  } catch {
    return DEFAULT_OUT_OF_AREA_MESSAGE;
  }
}

function formatHubsLabel(names) {
  const clean = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  const last = clean[clean.length - 1];
  return `${clean.slice(0, -1).join(', ')}, and ${last}`;
}

function formatOutOfArea(nearest, customMessage) {
  const names = (nearest || []).map((row) => row.name).filter(Boolean);
  const hubsLabel = formatHubsLabel(names);
  const custom = String(customMessage || '').trim();
  if (custom && custom !== DEFAULT_OUT_OF_AREA_MESSAGE && !LEGACY_OUT_OF_AREA_MESSAGES.includes(custom)) {
    return custom.replaceAll('{hubs}', hubsLabel || 'our service areas');
  }
  return DEFAULT_OUT_OF_AREA_MESSAGE;
}

/**
 * @returns
 *  { ok: true, enforced: false } — no hubs configured / table missing
 *  { ok: true, enforced: true, hub } — inside a hub
 *  { ok: false, needsPin: true } — hubs exist but pin has no coords
 *  { ok: false, message, nearest } — outside all hubs
 */
async function assertLocationInServiceHub(admin, lat, lng) {
  const loaded = await loadActiveHubs(admin);
  if (loaded.error) {
    console.warn('[booking-service-hub] load failed, allowing booking:', loaded.error);
    return { ok: true, enforced: false };
  }
  if (loaded.missingTable || loaded.hubs.length === 0) {
    return { ok: true, enforced: false };
  }
  if (!isValidCoords(Number(lat), Number(lng))) {
    return { ok: false, needsPin: true, message: 'Please share your location so we can check if we can come.' };
  }

  const ranked = loaded.hubs
    .map((hub) => ({
      ...hub,
      distanceKm: haversineKm(Number(lat), Number(lng), hub.lat, hub.lng),
      inside: hubContainsPoint(hub, Number(lat), Number(lng)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const inside = ranked.filter((row) => row.inside);
  const normal = inside.find((row) => row.service_kind === 'normal');
  if (normal) {
    return { ok: true, enforced: true, hub: normal, kind: 'normal', notice: hubDisplayMessage(normal) || null };
  }

  const exclusion = inside.find((row) => row.service_kind === 'no_service');
  if (exclusion) {
    return {
      ok: false,
      enforced: true,
      reason: 'no_service',
      hub: exclusion,
      message: hubDisplayMessage(exclusion),
    };
  }

  const serving = ranked.filter((row) => row.service_kind !== 'no_service');
  if (serving.length === 0) {
    return { ok: true, enforced: false };
  }

  const callback = inside.find((row) => row.service_kind === 'callback');
  if (callback) {
    return {
      ok: true,
      enforced: true,
      hub: callback,
      kind: 'callback',
      notice: hubDisplayMessage(callback),
    };
  }

  const nearest = serving.slice(0, 3);
  const customMessage = await loadOutOfAreaMessage(admin);
  return {
    ok: false,
    enforced: true,
    reason: 'out_of_area',
    nearest,
    message: formatOutOfArea(nearest, customMessage),
  };
}

async function assertBookingRowInServiceHub(admin, row) {
  const loaded = await loadActiveHubs(admin);
  if (loaded.error) {
    console.warn('[booking-service-hub] load failed, allowing booking:', loaded.error);
    return { ok: true, enforced: false };
  }
  if (loaded.missingTable || loaded.hubs.length === 0) {
    return { ok: true, enforced: false };
  }
  const coords = coordsFromBookingRow(row);
  if (!coords) {
    return { ok: false, needsPin: true, message: 'Please share your location so we can check if we can come.' };
  }
  return assertLocationInServiceHub(admin, coords.lat, coords.lng);
}

module.exports = {
  assertLocationInServiceHub,
  assertBookingRowInServiceHub,
  coordsFromBookingRow,
};
