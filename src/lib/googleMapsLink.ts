export interface GoogleMapsResolvedLink {
  expandedUrl: string;
  latitude?: number;
  longitude?: number;
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

    // Prefer the last !3d!4d pair — final segment is usually the pin, not map center.
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

export async function resolveGoogleMapsLinkViaApi(
  shortUrl: string,
  accessToken: string
): Promise<GoogleMapsResolvedLink | null> {
  const cleaned = extractMapsUrlFromText(shortUrl) || sanitizeGoogleMapsInput(shortUrl);

  const response = await fetch('/.netlify/functions/resolve-maps-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url: cleaned }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    expandedUrl?: string;
    latitude?: number;
    longitude?: number;
  };

  const expandedUrl =
    typeof data.expandedUrl === 'string' && data.expandedUrl.trim()
      ? data.expandedUrl.trim()
      : null;
  if (!expandedUrl) return null;

  const lat = typeof data.latitude === 'number' ? data.latitude : undefined;
  const lng = typeof data.longitude === 'number' ? data.longitude : undefined;

  return {
    expandedUrl,
    ...(lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : {}),
  };
}
