export interface GoogleMapsResolvedLink {
  expandedUrl: string;
  latitude?: number;
  longitude?: number;
}

export type ResolveGoogleMapsLinkResult =
  | { ok: true; data: GoogleMapsResolvedLink }
  | { ok: false; error: string; status?: number };

export interface GeocodedPlaceHint {
  latitude: number;
  longitude: number;
  address: string;
}

/**
 * Strip invisible chars mobile keyboards/clipboards often insert.
 */
export function sanitizeGoogleMapsInput(text: string): string {
  return (text || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

/**
 * Pull the first Google Maps URL out of arbitrary clipboard text.
 */
export function extractMapsUrlFromText(text: string): string | null {
  const trimmed = sanitizeGoogleMapsInput(text);
  if (!trimmed) return null;
  const MAPS_URL_REGEX =
    /https?:\/\/(?:www\.)?(?:google\.[^/\s]+\/maps\S*|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+)/i;
  const match = trimmed.match(MAPS_URL_REGEX);
  if (match) return match[0].replace(/[)>\].,;'"]+$/g, '');
  return null;
}

/**
 * Google Maps mobile share often includes the place name above the short link.
 * Example:
 *   Sobha Dream Acres
 *   https://maps.app.goo.gl/xxx
 */
export function extractPlaceHintFromShareText(text: string): string | null {
  const cleaned = sanitizeGoogleMapsInput(text);
  if (!cleaned) return null;

  const url = extractMapsUrlFromText(cleaned);
  const withoutUrl = url ? cleaned.replace(url, '').trim() : cleaned;

  const lines = withoutUrl
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && !line.startsWith('http'));

  const candidates = lines.filter(
    (line) =>
      !/^[\d\s\-+()]+$/.test(line) &&
      !/^maps\.app\.goo\.gl/i.test(line) &&
      line.length <= 200
  );

  if (candidates.length === 0) return null;

  const hint = candidates.slice(0, 2).join(', ');
  if (/bengaluru|bangalore|karnataka/i.test(hint)) return hint;
  return `${hint}, Bengaluru, Karnataka`;
}

/**
 * Place name from an expanded /place/Name,.../ Google Maps URL.
 */
export function extractPlaceNameFromMapsUrl(url: string): string | null {
  try {
    const value = normalizeUrlForParsing(url);
    const match = value.match(/\/place\/([^/@?]+)/);
    if (!match) return null;

    const raw = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    if (!raw || /^-?\d/.test(raw)) return null;

    const primary = raw.split(',')[0].trim();
    if (!primary || primary.length < 3) return null;

    if (/bengaluru|bangalore|karnataka/i.test(raw)) return raw;
    return `${raw}, Bengaluru, Karnataka`;
  } catch {
    return null;
  }
}

function normalizeUrlForParsing(url: string): string {
  try {
    return decodeURIComponent(sanitizeGoogleMapsInput(url));
  } catch {
    return sanitizeGoogleMapsInput(url);
  }
}

/**
 * Parse coordinates from Google Maps URLs (full links only — short links need resolving first).
 */
export function extractCoordinatesFromGoogleMapsLink(
  url: string
): { latitude: number; longitude: number } | null {
  try {
    const value = normalizeUrlForParsing(url);
    if (!value) return null;

    const tryPair = (latRaw: string, lngRaw: string) => {
      const latitude = parseFloat(latRaw);
      const longitude = parseFloat(lngRaw);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      ) {
        return { latitude, longitude };
      }
      return null;
    };

    const patterns: RegExp[] = [
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
      /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /\/search\/(-?\d+(?:\.\d+)?),\+?(-?\d+(?:\.\d+)?)/,
      /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    ];

    const preciseMatches = [...value.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
    if (preciseMatches.length > 0) {
      const last = preciseMatches[preciseMatches.length - 1];
      const coords = tryPair(last[1], last[2]);
      if (coords) return coords;
    }

    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) {
        const coords = tryPair(match[1], match[2]);
        if (coords) return coords;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function isGoogleMapsUrl(url: string): boolean {
  const value = sanitizeGoogleMapsInput(url);
  return (
    value.includes('google.com/maps') ||
    value.includes('maps.google.com') ||
    value.includes('maps.app.goo.gl') ||
    value.includes('goo.gl/maps')
  );
}

export function isGoogleMapsShortLink(url: string): boolean {
  const value = sanitizeGoogleMapsInput(url);
  return value.includes('maps.app.goo.gl') || value.includes('goo.gl/maps');
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function resolveMapsLinkEndpoint(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/.netlify/functions/resolve-maps-link`;
  }
  return '/.netlify/functions/resolve-maps-link';
}

function geocodeEndpoint(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/.netlify/functions/geocode`;
  }
  return '/.netlify/functions/geocode';
}

async function parseResolveResponse(response: Response): Promise<ResolveGoogleMapsLinkResult> {
  let data: {
    expandedUrl?: string;
    latitude?: number;
    longitude?: number;
    error?: string;
  } = {};

  try {
    data = (await response.json()) as typeof data;
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : 'Could not resolve this short link.',
      status: response.status,
    };
  }

  const expandedUrl =
    typeof data.expandedUrl === 'string' && data.expandedUrl.trim()
      ? data.expandedUrl.trim()
      : null;
  if (!expandedUrl) {
    return { ok: false, error: 'Could not resolve this short link.', status: response.status };
  }

  const lat = typeof data.latitude === 'number' ? data.latitude : undefined;
  const lng = typeof data.longitude === 'number' ? data.longitude : undefined;

  return {
    ok: true,
    data: {
      expandedUrl,
      ...(lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : {}),
    },
  };
}

/** Expand short links — no auth required (rate-limited server-side). */
export async function resolveGoogleMapsLinkViaApi(
  shortUrl: string,
  _accessToken?: string | null
): Promise<ResolveGoogleMapsLinkResult> {
  const cleaned = extractMapsUrlFromText(shortUrl) || sanitizeGoogleMapsInput(shortUrl);
  const endpoint = resolveMapsLinkEndpoint();

  try {
    // GET first: simpler on mobile Safari (no CORS preflight).
    const getResponse = await fetch(`${endpoint}?url=${encodeURIComponent(cleaned)}`, {
      method: 'GET',
      credentials: 'same-origin',
    });
    const getResult = await parseResolveResponse(getResponse);
    if (getResult.ok) return getResult;

    const postResponse = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleaned }),
    });
    return parseResolveResponse(postResponse);
  } catch {
    return {
      ok: false,
      error: 'Network error while resolving link. Check your connection and try again.',
    };
  }
}

/** Fallback when short-link expansion fails — geocode place name from share text. */
export async function geocodePlaceHintViaApi(
  query: string,
  accessToken: string | null
): Promise<GeocodedPlaceHint | null> {
  const q = query.trim();
  if (!q || !accessToken) return null;

  try {
    const response = await fetch(geocodeEndpoint(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: q }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const result = data[0];
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      latitude,
      longitude,
      address: typeof result.display_name === 'string' ? result.display_name : q,
    };
  } catch {
    return null;
  }
}

export function collectPlaceHints(...texts: Array<string | null | undefined>): string[] {
  const hints = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const fromShare = extractPlaceHintFromShareText(text);
    if (fromShare) hints.add(fromShare);
    const fromUrl = extractPlaceNameFromMapsUrl(text);
    if (fromUrl) hints.add(fromUrl);
  }
  return [...hints];
}
