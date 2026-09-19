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
  const { data, error } = await admin
    .from('booking_service_hubs')
    .select('id,name,lat,lng,radius_km,is_active')
    .eq('is_active', true);
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
      };
    })
    .filter(Boolean);
  return { hubs, missingTable: false, error: null };
}

function formatOutOfArea(nearest) {
  const names = (nearest || []).map((row) => row.name).filter(Boolean);
  if (names.length === 0) {
    return 'We do not currently serve this location.';
  }
  if (names.length === 1) {
    return `We do not currently serve this location. We cover ${names[0]}.`;
  }
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(', ');
  return `We do not currently serve this location. We cover ${head}, and ${last}.`;
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
    return { ok: false, needsPin: true, message: 'Please share a map pin so we can check service coverage.' };
  }

  const ranked = loaded.hubs
    .map((hub) => ({
      ...hub,
      distanceKm: haversineKm(Number(lat), Number(lng), hub.lat, hub.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const inside = ranked.find((row) => row.distanceKm <= row.radius_km);
  if (inside) {
    return { ok: true, enforced: true, hub: inside };
  }

  const nearest = ranked.slice(0, 3);
  return {
    ok: false,
    enforced: true,
    nearest,
    message: formatOutOfArea(nearest),
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
    return { ok: false, needsPin: true, message: 'A map pin is required for this booking.' };
  }
  return assertLocationInServiceHub(admin, coords.lat, coords.lng);
}

module.exports = {
  assertLocationInServiceHub,
  assertBookingRowInServiceHub,
  coordsFromBookingRow,
};
