/**
 * Parse coordinates from Google Maps URLs (full links only — short links need resolving first).
 */
export function extractCoordinatesFromGoogleMapsLink(
  url: string
): { latitude: number; longitude: number } | null {
  try {
    const value = (url || '').trim();
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
      /!3d([0-9.-]+)!4d([0-9.-]+)/,
      /\/place\/([0-9.-]+),([0-9.-]+)/,
      /\/search\/([0-9.-]+),\+?([0-9.-]+)/,
      /@([0-9.-]+),([0-9.-]+)/,
      /[?&]q=([0-9.-]+),([0-9.-]+)/,
      /[?&]query=([0-9.-]+),([0-9.-]+)/,
    ];

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
  const value = (url || '').trim();
  return (
    value.includes('google.com/maps') ||
    value.includes('maps.app.goo.gl') ||
    value.includes('goo.gl/maps')
  );
}

export function isGoogleMapsShortLink(url: string): boolean {
  const value = (url || '').trim();
  return value.includes('maps.app.goo.gl') || value.includes('goo.gl/maps');
}

export async function resolveGoogleMapsLinkViaApi(
  shortUrl: string,
  accessToken: string
): Promise<string | null> {
  const response = await fetch('/.netlify/functions/resolve-maps-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url: shortUrl.trim() }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { expandedUrl?: string };
  return typeof data.expandedUrl === 'string' && data.expandedUrl.trim()
    ? data.expandedUrl.trim()
    : null;
}
