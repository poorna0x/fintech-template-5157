import { supabase } from '@/lib/supabaseClient';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type GoogleMapsSkuId =
  | 'dynamic_maps'
  | 'places_autocomplete'
  | 'places_details'
  | 'places_find'
  | 'geocoding'
  | 'distance_matrix'
  | 'places'
  | 'distance';

const SKUS: Exclude<GoogleMapsSkuId, 'places' | 'distance'>[] = [
  'dynamic_maps',
  'places_autocomplete',
  'places_details',
  'places_find',
  'geocoding',
  'distance_matrix',
];

const ALIASES: Record<string, (typeof SKUS)[number]> = {
  places: 'places_details',
  distance: 'distance_matrix',
};

const pending: Record<(typeof SKUS)[number], number> = {
  dynamic_maps: 0,
  places_autocomplete: 0,
  places_details: 0,
  places_find: 0,
  geocoding: 0,
  distance_matrix: 0,
};

let flushTimer: number | null = null;
let listenersBound = false;

function canonicalSku(value: string): (typeof SKUS)[number] | null {
  const id = ALIASES[value] || value;
  return SKUS.includes(id as (typeof SKUS)[number]) ? (id as (typeof SKUS)[number]) : null;
}

/** Queue a billed Maps call. Flushes in a batch so booking/CRM does not hit Supabase per keystroke. */
export function trackGoogleMapsUsage(sku: GoogleMapsSkuId, count = 1) {
  if (typeof window === 'undefined') return;
  const id = canonicalSku(sku);
  if (!id) return;
  const n = Math.min(40, Math.max(1, Math.floor(Number(count) || 1)));
  pending[id] += n;
  bindFlushListeners();
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushGoogleMapsUsage();
  }, 8000);
}

export async function flushGoogleMapsUsage() {
  if (typeof window === 'undefined') return;
  if (flushTimer != null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  const counts: Partial<Record<(typeof SKUS)[number], number>> = {};
  for (const sku of SKUS) {
    if (pending[sku] > 0) {
      counts[sku] = Math.min(40, pending[sku]);
      pending[sku] = 0;
    }
  }
  if (!Object.keys(counts).length) return;

  const { error } = await supabase.rpc('increment_google_maps_usage', { p_counts: counts });
  if (!error) return;

  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) return;
    await fetch('/.netlify/functions/google-maps-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ increment: counts }),
    });
  } catch {
    /* public booking without SQL still no-ops */
  }
}

function bindFlushListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  const flush = () => {
    void flushGoogleMapsUsage();
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function geocodeOk(status: unknown): boolean {
  const g = window.google?.maps?.GeocoderStatus;
  return status === 'OK' || (g != null && status === g.OK);
}

function matrixOk(status: unknown): boolean {
  const g = window.google?.maps?.DistanceMatrixStatus;
  return status === 'OK' || (g != null && status === g.OK);
}

function placesOk(status: unknown): boolean {
  const g = window.google?.maps?.places?.PlacesServiceStatus;
  return status === 'OK' || (g != null && status === g.OK);
}

/**
 * Count Geocoder / Distance Matrix / Places Details / Autocomplete-without-session
 * from the JS APIs we already call. Idempotent.
 */
export function installGoogleMapsUsagePatches() {
  if (typeof window === 'undefined') return;
  const maps = window.google?.maps;
  if (!maps) return;

  try {
    const geoProto = maps.Geocoder?.prototype as
      | { geocode?: (...args: unknown[]) => unknown }
      | undefined;
    const origGeocode = geoProto?.geocode;
    if (origGeocode && !(origGeocode as { __hro?: boolean }).__hro) {
      const wrapped = function geocodeWithUsage(
        this: google.maps.Geocoder,
        request: google.maps.GeocoderRequest,
        callback?: (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => void
      ) {
        if (typeof callback === 'function') {
          return origGeocode.call(this, request, (results, status) => {
            if (geocodeOk(status)) trackGoogleMapsUsage('geocoding');
            callback(results, status);
          });
        }
        const ret = origGeocode.call(this, request) as Promise<{ results?: unknown }> | undefined;
        if (ret && typeof ret.then === 'function') {
          return ret.then((res) => {
            if (res?.results) trackGoogleMapsUsage('geocoding');
            return res;
          });
        }
        return ret;
      };
      (wrapped as { __hro?: boolean }).__hro = true;
      geoProto.geocode = wrapped;
    }
  } catch {
    /* ignore */
  }

  try {
    const matrixProto = maps.DistanceMatrixService?.prototype as
      | { getDistanceMatrix?: (...args: unknown[]) => unknown }
      | undefined;
    const origMatrix = matrixProto?.getDistanceMatrix;
    if (origMatrix && !(origMatrix as { __hro?: boolean }).__hro) {
      const wrapped = function matrixWithUsage(
        this: google.maps.DistanceMatrixService,
        request: google.maps.DistanceMatrixRequest,
        callback?: (
          response: google.maps.DistanceMatrixResponse | null,
          status: google.maps.DistanceMatrixStatus
        ) => void
      ) {
        const n = Math.max(1, (request.origins?.length || 1) * (request.destinations?.length || 1));
        if (typeof callback === 'function') {
          return origMatrix.call(this, request, (response, status) => {
            if (matrixOk(status)) trackGoogleMapsUsage('distance_matrix', n);
            callback(response, status);
          });
        }
        return origMatrix.call(this, request);
      };
      (wrapped as { __hro?: boolean }).__hro = true;
      matrixProto.getDistanceMatrix = wrapped;
    }
  } catch {
    /* ignore */
  }

  try {
    const detailsProto = maps.places?.PlacesService?.prototype as
      | { getDetails?: (...args: unknown[]) => unknown }
      | undefined;
    const origDetails = detailsProto?.getDetails;
    if (origDetails && !(origDetails as { __hro?: boolean }).__hro) {
      const wrapped = function detailsWithUsage(
        this: google.maps.places.PlacesService,
        request: google.maps.places.PlaceDetailsRequest,
        callback?: (
          result: google.maps.places.PlaceResult | null,
          status: google.maps.places.PlacesServiceStatus
        ) => void
      ) {
        if (typeof callback === 'function') {
          return origDetails.call(this, request, (result, status) => {
            if (placesOk(status)) trackGoogleMapsUsage('places_details');
            callback(result, status);
          });
        }
        return origDetails.call(this, request);
      };
      (wrapped as { __hro?: boolean }).__hro = true;
      detailsProto.getDetails = wrapped;
    }
  } catch {
    /* ignore */
  }

  try {
    const predProto = maps.places?.AutocompleteService?.prototype as
      | { getPlacePredictions?: (...args: unknown[]) => unknown }
      | undefined;
    const origPred = predProto?.getPlacePredictions;
    if (origPred && !(origPred as { __hro?: boolean }).__hro) {
      const wrapped = function predictionsWithUsage(
        this: google.maps.places.AutocompleteService,
        request: google.maps.places.AutocompletionRequest,
        callback?: (
          results: google.maps.places.AutocompletePrediction[] | null,
          status: google.maps.places.PlacesServiceStatus
        ) => void
      ) {
        const billedPerRequest = !request.sessionToken;
        if (typeof callback === 'function') {
          return origPred.call(this, request, (results, status) => {
            if (billedPerRequest && placesOk(status)) trackGoogleMapsUsage('places_autocomplete');
            callback(results, status);
          });
        }
        return origPred.call(this, request);
      };
      (wrapped as { __hro?: boolean }).__hro = true;
      predProto.getPlacePredictions = wrapped;
    }
  } catch {
    /* ignore */
  }

  try {
    const acProto = maps.places?.Autocomplete?.prototype as { getPlace?: () => google.maps.places.PlaceResult } | undefined;
    const origGetPlace = acProto?.getPlace;
    if (origGetPlace && !(origGetPlace as { __hro?: boolean }).__hro) {
      const wrapped = function getPlaceWithUsage(this: google.maps.places.Autocomplete) {
        const place = origGetPlace.call(this);
        if (place?.place_id || place?.geometry) trackGoogleMapsUsage('places_details');
        return place;
      };
      (wrapped as { __hro?: boolean }).__hro = true;
      acProto.getPlace = wrapped;
    }
  } catch {
    /* ignore */
  }
}
