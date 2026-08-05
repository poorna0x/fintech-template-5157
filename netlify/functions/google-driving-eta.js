const trim = (s) => (s && typeof s === 'string' ? s.trim() : '');

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

function isValidLatLng(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Always IST for customer-facing arrival times (Netlify runs in UTC). */
function formatTime12Hour(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }
}

function formatDurationText(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return '1 min';
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Approximate ETA from straight-line distance (Bengaluru traffic ~18 km/h avg).
 * Used when Google Directions / Distance Matrix is unavailable.
 */
function estimateEtaFromMeters(distanceM, fixTimeIso) {
  const meters = Number(distanceM);
  if (!Number.isFinite(meters) || meters < 0) return null;
  // Road distance ≈ 1.35 × straight line; ~18 km/h urban average
  const roadM = meters * 1.35;
  const durationSec = Math.max(60, Math.round((roadM / 1000 / 18) * 3600));
  const base = fixTimeIso ? new Date(fixTimeIso) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  return {
    durationText: `~${formatDurationText(durationSec)}`,
    estimatedArrival: formatTime12Hour(new Date(base.getTime() + durationSec * 1000)),
    distanceText: meters >= 1000 ? `~${(meters / 1000).toFixed(1)} km` : `~${Math.round(meters)} m`,
    approximate: true,
  };
}

/**
 * Driving ETA via Google Distance Matrix REST API (server key — no browser referrer).
 */
async function fetchDrivingEta(origin, destination, fixTimeIso) {
  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) {
    console.warn('[driving-eta] no Google Maps server key');
    return null;
  }
  if (!isValidLatLng(origin) || !isValidLatLng(destination)) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', `${destination.lat},${destination.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn('[driving-eta] HTTP', res.status);
      return null;
    }
    const data = await res.json();
    if (data.status !== 'OK') {
      console.warn('[driving-eta] status', data.status, data.error_message || '');
      return null;
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      console.warn('[driving-eta] element', element?.status || 'missing');
      return null;
    }

    const durationText = element.duration?.text || '';
    const durationValue = element.duration?.value ?? 0;
    if (!durationText || durationValue <= 0) return null;

    const base = fixTimeIso ? new Date(fixTimeIso) : new Date();
    const estimatedArrival = formatTime12Hour(new Date(base.getTime() + durationValue * 1000));

    return {
      durationText,
      estimatedArrival,
      distanceText: element.distance?.text || null,
    };
  } catch (e) {
    console.warn('[driving-eta] error', e?.message || e);
    return null;
  }
}

/**
 * Driving route + ETA via Directions API (server key).
 */
async function fetchDrivingRoute(origin, destination, fixTimeIso) {
  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) return null;
  if (!isValidLatLng(origin) || !isValidLatLng(destination)) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn('[driving-route] HTTP', res.status);
      return null;
    }
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.[0]) {
      console.warn('[driving-route] status', data.status, data.error_message || '');
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];
    const routePolyline = route.overview_polyline?.points;
    if (!routePolyline || typeof routePolyline !== 'string') return null;

    const durationText = leg?.duration?.text || '';
    const durationValue = leg?.duration?.value ?? 0;
    const distanceText = leg?.distance?.text || null;
    if (!durationText || durationValue <= 0) return null;

    const base = fixTimeIso ? new Date(fixTimeIso) : new Date();
    const estimatedArrival = formatTime12Hour(new Date(base.getTime() + durationValue * 1000));

    return {
      durationText,
      estimatedArrival,
      distanceText,
      routePolyline,
    };
  } catch (e) {
    console.warn('[driving-route] error', e?.message || e);
    return null;
  }
}

module.exports = {
  fetchDrivingEta,
  fetchDrivingRoute,
  formatTime12Hour,
  estimateEtaFromMeters,
  isValidLatLng,
};
