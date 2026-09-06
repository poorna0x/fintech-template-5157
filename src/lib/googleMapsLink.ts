import { removePlusCode } from '@/lib/maps';

export interface GoogleMapsResolvedLink {
  expandedUrl: string;
  latitude?: number;
  longitude?: number;
  placeName?: string;
}

export type ResolveGoogleMapsLinkResult =
  | { ok: true; data: GoogleMapsResolvedLink }
  | {
      ok: false;
      error: string;
      status?: number;
      expandedUrl?: string;
      placeName?: string;
    };

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
    /(?:https?:\/\/)?(?:www\.)?(?:google\.[^/\s]+\/maps\S*|maps\.google\.[^/\s]+\S*|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|share\.google\/\S+|g\.co\/\S+)/i;
  const match = trimmed.match(MAPS_URL_REGEX);
  if (!match) return null;
  let url = match[0].replace(/[)>\].,;'"*_~]+$/g, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
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
 * Maps path uses + for spaces, but Plus Codes encode + as %2B (or a real + after decode).
 */
function decodeMapsPlaceSlug(slug: string): string {
  const protect = String(slug || '')
    .replace(/%2B/gi, '\uE000')
    .replace(/^([A-Z0-9]{2,8})\+([A-Z0-9]{2,3})\b/i, (_, a, b) => `${a}\uE000${b}`);
  const spaced = protect.replace(/\+/g, ' ');
  let decoded = spaced;
  try {
    decoded = decodeURIComponent(spaced);
  } catch {
    /* keep spaced */
  }
  return decoded.replace(/\uE000/g, '+').replace(/\s+/g, ' ').trim();
}

/**
 * Place name from an expanded /place/Name,.../ Google Maps URL.
 */
export function extractPlaceNameFromMapsUrl(url: string): string | null {
  try {
    const rawUrl = sanitizeGoogleMapsInput(url);
    const match =
      rawUrl.match(/\/place\/([^/@?]+)/) ||
      normalizeUrlForParsing(rawUrl).match(/\/place\/([^/@?]+)/);
    if (!match) return null;

    const raw = decodeMapsPlaceSlug(match[1]);
    // Plus Codes often start with a digit (2QG7+J9F …). Only skip real lat,lng slugs.
    if (!raw || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(raw)) return null;

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
    value.includes('goo.gl/maps') ||
    value.includes('share.google/') ||
    /\/\/g\.co\//i.test(value)
  );
}

export function isGoogleMapsShortLink(url: string): boolean {
  const value = sanitizeGoogleMapsInput(url);
  return (
    value.includes('maps.app.goo.gl') ||
    value.includes('goo.gl/maps') ||
    value.includes('share.google/') ||
    /\/\/g\.co\//i.test(value)
  );
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
    placeName?: string;
    latitude?: number;
    longitude?: number;
    error?: string;
  } = {};

  try {
    data = (await response.json()) as typeof data;
  } catch {
    data = {};
  }

  const expandedUrl =
    typeof data.expandedUrl === 'string' && data.expandedUrl.trim()
      ? data.expandedUrl.trim()
      : undefined;
  const placeName =
    typeof data.placeName === 'string' && data.placeName.trim() ? data.placeName.trim() : undefined;

  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : 'Could not resolve this short link.',
      status: response.status,
      ...(expandedUrl ? { expandedUrl } : {}),
      ...(placeName ? { placeName } : {}),
    };
  }

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
      ...(placeName ? { placeName } : {}),
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

/** Geocode place name from share text when short-link expansion fails (Google via server). */
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

let googleMapsScriptPromise: Promise<void> | null = null;

function mapsScriptAlreadyUsable(): boolean {
  return Boolean(window.google?.maps?.Map || window.google?.maps?.Geocoder || window.google?.maps?.importLibrary);
}

/** Load Maps JS for client geocoder (works on mobile without staff API token). */
export function loadGoogleMapsGeocoderScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps is only available in the browser'));
  }
  if (mapsScriptAlreadyUsable()) {
    return Promise.resolve();
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key not configured'));
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        googleMapsScriptPromise = null;
        reject(err);
      };

      const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
      if (existing) {
        if (mapsScriptAlreadyUsable()) {
          done();
          return;
        }
        existing.addEventListener('load', () => done(), { once: true });
        existing.addEventListener('error', () => fail(new Error('Failed to load Google Maps')), {
          once: true,
        });
        const poll = window.setInterval(() => {
          if (mapsScriptAlreadyUsable()) {
            window.clearInterval(poll);
            done();
          }
        }, 50);
        window.setTimeout(() => window.clearInterval(poll), 12000);
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      script.onload = () => done();
      script.onerror = () => fail(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
  }

  return googleMapsScriptPromise;
}

/** Script tag can fire onload before Map/Geocoder exist (`loading=async`). */
export async function ensureGoogleMapsApi(): Promise<void> {
  await loadGoogleMapsGeocoderScript();
  const maps = window.google?.maps;
  if (!maps) {
    throw new Error('Google Maps failed to load');
  }
  if (typeof maps.importLibrary === 'function') {
    await maps.importLibrary('maps');
    try {
      await maps.importLibrary('places');
    } catch {
      /* places optional */
    }
    try {
      await maps.importLibrary('geocoding');
    } catch {
      /* geocoding optional */
    }
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (window.google?.maps?.Map) return;
    await new Promise((r) => window.setTimeout(r, 40));
  }
  if (!window.google?.maps?.Map) {
    throw new Error('Google Maps Map is not available');
  }
}

/** Forward-geocode via browser Google Maps JS — no login token (mobile-safe). */
export async function geocodePlaceHintWithGoogleMapsJs(
  query: string
): Promise<GeocodedPlaceHint | null> {
  const q = query.trim();
  if (!q) return null;

  try {
    await ensureGoogleMapsApi();
  } catch {
    return null;
  }

  if (!window.google?.maps?.Geocoder) return null;

  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    let settled = false;
    const finish = (value: GeocodedPlaceHint | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 5000);
    geocoder.geocode({ address: q, region: 'in' }, (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        finish({
          latitude: loc.lat(),
          longitude: loc.lng(),
          address: results[0].formatted_address || q,
        });
      } else {
        finish(null);
      }
    });
  });
}

/** Try client Google geocoder first, then staff server geocode. */
function expandPlaceHintQueries(hints: string[]): string[] {
  const queries: string[] = [];
  const add = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t && !queries.includes(t)) queries.push(t);
  };
  for (const hint of hints) {
    const withoutPlus = hint.replace(/^[A-Z0-9]{2,8}(?:\+|\s+)[A-Z0-9]{2,3}\s*,?\s*/i, '').trim();
    const plus = hint.match(/^([A-Z0-9]{2,8})(?:\+|\s+)([A-Z0-9]{2,3})\b/i);
    if (withoutPlus) {
      add(withoutPlus);
      const first = withoutPlus.split(',')[0];
      if (first && first !== withoutPlus) add(`${first}, Bengaluru, Karnataka, India`);
    }
    if (plus) {
      const locality =
        withoutPlus.split(',').slice(1).join(',').trim() || 'Bengaluru, Karnataka, India';
      add(`${plus[1]}+${plus[2]}, ${locality}`);
    }
    add(hint);
  }
  return queries;
}

export async function geocodeFromPlaceHints(
  hints: string[],
  accessToken: string | null
): Promise<{ geocoded: GeocodedPlaceHint; hint: string } | null> {
  const mapsJsBlocked =
    typeof window !== 'undefined' &&
    /localhost|127\.0\.0\.1/i.test(window.location.hostname);

  for (const hint of expandPlaceHintQueries(hints)) {
    if (!mapsJsBlocked) {
      const fromClient = await geocodePlaceHintWithGoogleMapsJs(hint);
      if (fromClient) return { geocoded: fromClient, hint };
    }
    if (accessToken) {
      const fromServer = await geocodePlaceHintViaApi(hint, accessToken);
      if (fromServer) return { geocoded: fromServer, hint };
    }
  }
  return null;
}

export type ResolveGoogleMapsInputResult =
  | {
      ok: true;
      coords: { latitude: number; longitude: number };
      resolvedLocation: string;
      didExpandShortLink: boolean;
      placeHintUsed?: string;
      /** Place / society name parsed from the link or share text (when available). */
      placeName?: string;
    }
  | { ok: false; error: string };

function deriveMapsPlaceName(opts: {
  resolvedLocation: string;
  shareText?: string | null;
  apiPlaceName?: string | null;
  placeHintUsed?: string | null;
}): string | undefined {
  const candidates = [
    opts.placeHintUsed,
    opts.apiPlaceName,
    extractPlaceNameFromMapsUrl(opts.resolvedLocation),
    opts.shareText ? extractPlaceHintFromShareText(opts.shareText) : null,
  ].filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  for (const candidate of candidates) {
    const primary = removePlusCode(candidate).split(',')[0].trim();
    if (primary.length >= 3 && !/^-?\d/.test(primary)) return primary;
  }
  return undefined;
}

/**
 * Resolve pasted Maps URL / short link to coordinates.
 * Named places (no lat/lng in URL) use client Google geocoder so mobile works without staff API.
 */
export async function resolveGoogleMapsInputToCoords(
  rawInput: string,
  options: {
    shareText?: string | null;
    addressHint?: string | null;
    accessToken?: string | null;
  } = {}
): Promise<ResolveGoogleMapsInputResult> {
  const googleLocation =
    extractMapsUrlFromText(rawInput) || sanitizeGoogleMapsInput(rawInput);

  if (!googleLocation || !isGoogleMapsUrl(googleLocation)) {
    return { ok: false, error: 'Please enter a valid Google Maps link' };
  }

  let resolvedLocation = googleLocation;
  let coords = extractCoordinatesFromGoogleMapsLink(resolvedLocation);
  let didExpandShortLink = false;
  let apiPlaceName: string | undefined;
  const accessToken = options.accessToken ?? null;

  if (!coords && isGoogleMapsShortLink(resolvedLocation)) {
    const resolveResult = await resolveGoogleMapsLinkViaApi(resolvedLocation);

    if (resolveResult.ok) {
      const resolved = resolveResult.data;
      resolvedLocation = resolved.expandedUrl;
      didExpandShortLink = true;
      apiPlaceName = resolved.placeName;
      coords =
        resolved.latitude !== undefined && resolved.longitude !== undefined
          ? { latitude: resolved.latitude, longitude: resolved.longitude }
          : extractCoordinatesFromGoogleMapsLink(resolved.expandedUrl);
    } else {
      if (resolveResult.expandedUrl) {
        resolvedLocation = resolveResult.expandedUrl;
        didExpandShortLink = true;
        apiPlaceName = resolveResult.placeName;
        coords = extractCoordinatesFromGoogleMapsLink(resolveResult.expandedUrl);
      }
    }

    if (!coords) {
      const placeHints = collectPlaceHints(
        options.shareText,
        resolvedLocation,
        options.addressHint
      );
      const placeNameHint = resolveResult.ok
        ? resolveResult.data.placeName
        : resolveResult.placeName;
      if (placeNameHint) {
        placeHints.unshift(placeNameHint);
      }
      const geocoded = await geocodeFromPlaceHints(placeHints, accessToken);
      if (geocoded) {
        coords = { latitude: geocoded.geocoded.latitude, longitude: geocoded.geocoded.longitude };
        const placeHintUsed = removePlusCode(geocoded.hint).split(',')[0];
        return {
          ok: true,
          coords,
          resolvedLocation,
          didExpandShortLink,
          placeHintUsed,
          placeName: deriveMapsPlaceName({
            resolvedLocation,
            shareText: options.shareText,
            apiPlaceName,
            placeHintUsed,
          }),
        };
      }

      return {
        ok: false,
        error:
          (!resolveResult.ok ? resolveResult.error : null) ||
          'Could not resolve this link. Copy the full share from Google Maps (place name + link), paste here, and try again.',
      };
    }
  } else if (!coords) {
    const placeHints = collectPlaceHints(
      options.shareText,
      resolvedLocation,
      options.addressHint
    );
    const geocoded = await geocodeFromPlaceHints(placeHints, accessToken);
    if (geocoded) {
      coords = { latitude: geocoded.geocoded.latitude, longitude: geocoded.geocoded.longitude };
      const placeHintUsed = removePlusCode(geocoded.hint).split(',')[0];
      return {
        ok: true,
        coords,
        resolvedLocation,
        didExpandShortLink: false,
        placeHintUsed,
        placeName: deriveMapsPlaceName({
          resolvedLocation,
          shareText: options.shareText,
          placeHintUsed,
        }),
      };
    }
    return { ok: false, error: 'Could not extract coordinates from this link.' };
  }

  if (!coords) {
    return { ok: false, error: 'Could not extract coordinates from this link.' };
  }

  return {
    ok: true,
    coords,
    resolvedLocation,
    didExpandShortLink,
    placeName: deriveMapsPlaceName({
      resolvedLocation,
      shareText: options.shareText,
      apiPlaceName,
    }),
  };
}
