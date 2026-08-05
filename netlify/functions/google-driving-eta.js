const trim = (s) => (s && typeof s === 'string' ? s.trim() : '');

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

function formatTime12Hour(date) {
  const d = date instanceof Date ? date : new Date(date);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Driving ETA via Google Distance Matrix REST API (server key — no browser referrer).
 * @returns {{ durationText: string, estimatedArrival: string } | null}
 */
async function fetchDrivingEta(origin, destination, fixTimeIso) {
  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) return null;
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', `${destination.lat},${destination.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') return null;

    const durationText = element.duration?.text || '';
    const durationValue = element.duration?.value ?? 0;
    if (!durationText || durationValue <= 0) return null;

    const base = fixTimeIso ? new Date(fixTimeIso) : new Date();
    const estimatedArrival = formatTime12Hour(new Date(base.getTime() + durationValue * 1000));

    return { durationText, estimatedArrival };
  } catch {
    return null;
  }
}

module.exports = { fetchDrivingEta, formatTime12Hour };
