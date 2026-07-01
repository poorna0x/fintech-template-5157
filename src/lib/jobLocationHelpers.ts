/** Shared job/customer location helpers for admin assign/reassign/measure flows (slim + full rows). */

import {
  extractCoordinatesFromGoogleMapsLink,
  extractMapsUrlFromText,
  extractPlaceNameFromMapsUrl,
  isGoogleMapsShortLink,
  isGoogleMapsUrl,
  resolveGoogleMapsInputToCoords,
} from '@/lib/googleMapsLink';

function coordsQueryLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function getCompactGoogleMapsLink(url: string): string {
  const value = url.trim();
  if (!value) return '';

  if (extractPlaceNameFromMapsUrl(value)) {
    return value;
  }

  if (value.includes('maps.app.goo.gl') || value.includes('goo.gl/maps')) {
    return value;
  }

  const coordinatePatterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of coordinatePatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return coordsQueryLink(latitude, longitude);
    }
  }

  return value;
}

export function getLocationLinkFromObject(location: any): string {
  if (!location) return '';

  if (location.googleLocation || location.google_location) {
    const googleLoc = location.googleLocation || location.google_location;
    if (
      googleLoc &&
      typeof googleLoc === 'string' &&
      (googleLoc.includes('google.com/maps') ||
        googleLoc.includes('maps.app.goo.gl') ||
        googleLoc.includes('goo.gl/maps')) &&
      !googleLoc.includes('localhost') &&
      !googleLoc.includes('127.0.0.1')
    ) {
      return getCompactGoogleMapsLink(googleLoc);
    }
  }
  if (
    location.latitude &&
    location.longitude &&
    location.latitude !== 0 &&
    location.longitude !== 0
  ) {
    return coordsQueryLink(location.latitude, location.longitude);
  }
  if (
    location.formattedAddress &&
    typeof location.formattedAddress === 'string' &&
    (location.formattedAddress.includes('google.com/maps') ||
      location.formattedAddress.includes('maps.app.goo.gl')) &&
    !location.formattedAddress.includes('localhost') &&
    !location.formattedAddress.includes('127.0.0.1')
  ) {
    return getCompactGoogleMapsLink(location.formattedAddress);
  }
  return '';
}

export function getGoogleMapsLinkForJobRow(jobRow: any): string {
  const customer = jobRow?.customer || {};
  const customerLocation = customer?.location || {};
  const serviceLocation = jobRow?.service_location || jobRow?.serviceLocation || {};
  return getLocationLinkFromObject(customerLocation) || getLocationLinkFromObject(serviceLocation);
}

export async function getFreshGoogleMapsLinkForJobRow(
  jobRow: any,
  loaders: {
    getCustomerById?: (customerId: string) => Promise<{ data?: any; error?: any }>;
    getJobByIdFull?: (jobId: string) => Promise<{ data?: any; error?: any }>;
  } = {}
): Promise<string> {
  const customer = jobRow?.customer || {};
  const embeddedCustomerLink = getLocationLinkFromObject(customer?.location);
  if (embeddedCustomerLink) return embeddedCustomerLink;

  const customerId = customer?.id || jobRow?.customer_id || jobRow?.customerId;
  if (customerId && loaders.getCustomerById) {
    const { data, error } = await loaders.getCustomerById(String(customerId));
    if (!error) {
      const freshCustomerLink = getLocationLinkFromObject(data?.location);
      if (freshCustomerLink) return freshCustomerLink;
    }
  }

  if (jobRow?.id && loaders.getJobByIdFull) {
    const { data, error } = await loaders.getJobByIdFull(String(jobRow.id));
    if (!error && data) {
      return getGoogleMapsLinkForJobRow(data);
    }
  }

  return getGoogleMapsLinkForJobRow(jobRow);
}

export function getJobLatLngFromJobRow(jobRow: any): { lat: number; lng: number } | null {
  return resolveJobDestinationCoordsSync(jobRow);
}

type MapsLinkCandidate = {
  shareText: string;
  addressHint: string;
};

function pushMapsCandidate(out: MapsLinkCandidate[], shareText: string, addressHint: string) {
  const text = (shareText || '').trim();
  if (!text) return;
  const url = extractMapsUrlFromText(text) || (isGoogleMapsUrl(text) ? text : null);
  if (!url) return;
  const key = `${url}::${addressHint}`;
  if (out.some((c) => `${extractMapsUrlFromText(c.shareText) || c.shareText}::${c.addressHint}` === key)) {
    return;
  }
  out.push({ shareText: text, addressHint: (addressHint || '').trim() });
}

function collectMapsLinkCandidates(jobRow: any): MapsLinkCandidate[] {
  const out: MapsLinkCandidate[] = [];
  const customer = jobRow?.customer || {};
  const customerLocation = customer?.location || {};
  const serviceLocation = jobRow?.service_location || jobRow?.serviceLocation || {};
  const streetHint =
    customerLocation?.street ||
    customerLocation?.visible_address ||
    customer?.address?.street ||
    customer?.visible_address ||
    '';

  for (const loc of [customerLocation, serviceLocation]) {
    if (!loc || typeof loc !== 'object') continue;
    const gl = loc.googleLocation || loc.google_location;
    if (typeof gl === 'string') {
      pushMapsCandidate(out, gl, streetHint);
    }
    const formatted = loc.formattedAddress;
    if (typeof formatted === 'string') {
      pushMapsCandidate(out, formatted, streetHint);
    }
  }

  return out;
}

/** True when sync coords failed but a Maps URL (e.g. short link) may be resolved via API. */
export function jobRowNeedsMapsLinkResolve(jobRow: any): boolean {
  if (resolveJobDestinationCoordsSync(jobRow)) return false;

  for (const candidate of collectMapsLinkCandidates(jobRow)) {
    const url =
      extractMapsUrlFromText(candidate.shareText) ||
      (isGoogleMapsUrl(candidate.shareText) ? candidate.shareText : null);
    if (!url) continue;
    if (isGoogleMapsShortLink(url) || !extractCoordinatesFromGoogleMapsLink(url)) {
      return true;
    }
  }
  return false;
}

/** Lat/lng from stored coordinates or coords embedded in a full Maps URL (not short links). */
export function resolveJobDestinationCoordsSync(jobRow: any): { lat: number; lng: number } | null {
  const customer = jobRow?.customer || {};
  const customerLocation = customer?.location || {};
  const serviceLocation = jobRow?.service_location || jobRow?.serviceLocation || {};

  for (const loc of [customerLocation, serviceLocation]) {
    if (!loc || typeof loc !== 'object') continue;

    if (
      loc.latitude != null &&
      loc.longitude != null &&
      loc.latitude !== 0 &&
      loc.longitude !== 0
    ) {
      return { lat: Number(loc.latitude), lng: Number(loc.longitude) };
    }

    for (const raw of [loc.googleLocation, loc.google_location, loc.formattedAddress]) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const url = extractMapsUrlFromText(raw) || (isGoogleMapsUrl(raw) ? raw : null);
      if (!url) continue;
      const extracted = extractCoordinatesFromGoogleMapsLink(url);
      if (extracted) {
        return { lat: extracted.latitude, lng: extracted.longitude };
      }
    }
  }

  return null;
}

export type ResolvedJobCoords = {
  lat: number;
  lng: number;
  resolvedLocation?: string;
  didExpandShortLink?: boolean;
};

/**
 * Resolve job destination coordinates, including maps.app.goo.gl short links via server
 * (same path as Fetch location in customer edit).
 */
export async function resolveJobDestinationCoordsAsync(
  jobRow: any,
  options: { accessToken?: string | null } = {}
): Promise<ResolvedJobCoords | null> {
  const sync = resolveJobDestinationCoordsSync(jobRow);
  if (sync) return sync;

  for (const candidate of collectMapsLinkCandidates(jobRow)) {
    const url =
      extractMapsUrlFromText(candidate.shareText) ||
      (isGoogleMapsUrl(candidate.shareText) ? candidate.shareText : null);
    if (!url) continue;

    const needsServer =
      isGoogleMapsShortLink(url) || !extractCoordinatesFromGoogleMapsLink(url);
    if (!needsServer) continue;

    const resolved = await resolveGoogleMapsInputToCoords(url, {
      shareText: candidate.shareText,
      addressHint: candidate.addressHint,
      accessToken: options.accessToken ?? null,
    });

    if (resolved.ok) {
      return {
        lat: resolved.coords.latitude,
        lng: resolved.coords.longitude,
        resolvedLocation: resolved.resolvedLocation,
        didExpandShortLink: resolved.didExpandShortLink,
      };
    }
  }

  return null;
}

export type ResolvedJobLatLng = {
  lat: number;
  lng: number;
  workingRow: any;
};

/**
 * Resolve job lat/lng for distance sorting (assign/reassign/measure).
 * Sync first, optional full job fetch, short-link API only when needed.
 */
export async function resolveJobLatLngFromRow(
  jobRow: any,
  options: {
    getJobByIdFull?: (id: string) => Promise<{ data: any; error: any }>;
    accessToken?: string | null;
    onResolvingLink?: () => void;
  } = {}
): Promise<ResolvedJobLatLng | null> {
  let row = jobRow;
  let c = resolveJobDestinationCoordsSync(row);
  if (c) return { lat: c.lat, lng: c.lng, workingRow: row };

  const jobId = jobRow?.id;
  if (jobId && options.getJobByIdFull) {
    try {
      const { data, error } = await options.getJobByIdFull(jobId);
      if (!error && data) row = data;
    } catch {
      /* ignore */
    }
  }

  c = resolveJobDestinationCoordsSync(row);
  if (c) return { lat: c.lat, lng: c.lng, workingRow: row };

  if (!jobRowNeedsMapsLinkResolve(row)) return null;

  options.onResolvingLink?.();

  let accessToken = options.accessToken;
  if (accessToken === undefined) {
    const { resolveSupabaseAccessTokenForApi } = await import('@/lib/ensureSupabaseSession');
    accessToken = await resolveSupabaseAccessTokenForApi();
  }

  const resolved = await resolveJobDestinationCoordsAsync(row, { accessToken });
  if (!resolved) return null;
  return { lat: resolved.lat, lng: resolved.lng, workingRow: row };
}
