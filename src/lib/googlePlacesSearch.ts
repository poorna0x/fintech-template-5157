import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';
import { trackGoogleMapsUsage } from '@/lib/googleMapsUsageTrack';
import { removePlusCode } from '@/lib/maps';

/** Skip 1–2 letter queries so Autocomplete does not fire on every first keystroke. */
export const MIN_PLACE_QUERY_LEN = 3;

export type GooglePlacePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export type GooglePlaceDetails = {
  coords: { lat: number; lng: number };
  address: string;
  name: string;
};

export type PlacesSessionToken = google.maps.places.AutocompleteSessionToken;

type PlaceLike = {
  fetchFields: (request: { fields: string[] }) => Promise<unknown>;
  location?: { lat: () => number; lng: () => number } | { lat: number; lng: number };
  formattedAddress?: string;
  displayName?: string | { text?: string };
};

/** Last Autocomplete (New) predictions in this session — used to close billing with Place.fetchFields. */
const placeFactoryById = new Map<string, () => PlaceLike>();

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    return String((value as { toString: () => string }).toString());
  }
  return '';
}

function coordsFromLatLng(loc: PlaceLike['location']): { lat: number; lng: number } | null {
  if (!loc) return null;
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function displayNameOf(place: PlaceLike): string {
  const raw = place.displayName;
  if (typeof raw === 'string') return raw;
  return asText(raw?.text);
}

export function getOrCreatePlacesSessionToken(ref: {
  current: PlacesSessionToken | null;
}): PlacesSessionToken | null {
  if (ref.current) return ref.current;
  const Ctor = window.google?.maps?.places?.AutocompleteSessionToken;
  if (!Ctor) return null;
  ref.current = new Ctor();
  return ref.current;
}

export function clearPlacesSessionToken(ref: { current: PlacesSessionToken | null }) {
  ref.current = null;
  placeFactoryById.clear();
}

async function fetchPredictionsLegacy(
  input: string,
  sessionToken?: PlacesSessionToken | null
): Promise<GooglePlacePrediction[]> {
  const AutocompleteService = window.google?.maps?.places?.AutocompleteService;
  if (!AutocompleteService) return [];
  const service = new AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'in' },
        ...(sessionToken ? { sessionToken } : {}),
      },
      (results, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          resolve([]);
          return;
        }
        resolve(
          results.map((item) => ({
            placeId: item.place_id,
            mainText: item.structured_formatting?.main_text || item.description,
            secondaryText: item.structured_formatting?.secondary_text || '',
          }))
        );
      }
    );
  });
}

/**
 * Place search for booking + Location Hubs.
 * Pass a session token and later resolveGooglePlaceDetails with the same token
 * so Autocomplete Session Usage (unlimited) applies instead of per-keystroke billing.
 */
export async function fetchGooglePlacePredictions(
  input: string,
  sessionToken?: PlacesSessionToken | null
): Promise<GooglePlacePrediction[]> {
  const trimmed = input.trim();
  if (trimmed.length < MIN_PLACE_QUERY_LEN) return [];
  await ensureGoogleMapsApi();

  try {
    const placesLib = (await window.google.maps.importLibrary('places')) as {
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions: (request: {
          input: string;
          includedRegionCodes?: string[];
          language?: string;
          sessionToken?: PlacesSessionToken;
        }) => Promise<{
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              text?: unknown;
              mainText?: unknown;
              secondaryText?: unknown;
              toPlace?: () => PlaceLike;
            };
          }>;
        }>;
      };
    };
    const Suggestion = placesLib?.AutocompleteSuggestion;
    if (Suggestion?.fetchAutocompleteSuggestions) {
      const { suggestions } = await Suggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        includedRegionCodes: ['IN'],
        language: 'en-IN',
        ...(sessionToken ? { sessionToken } : {}),
      });
      placeFactoryById.clear();
      return (suggestions || [])
        .map((row) => {
          const pred = row.placePrediction;
          const placeId = String(pred?.placeId || '').trim();
          if (!placeId) return null;
          if (typeof pred?.toPlace === 'function') {
            placeFactoryById.set(placeId, () => pred.toPlace!());
          }
          return {
            placeId,
            mainText: asText(pred?.mainText) || asText(pred?.text),
            secondaryText: asText(pred?.secondaryText),
          };
        })
        .filter((row): row is GooglePlacePrediction => Boolean(row));
    }
  } catch {
    /* fall through to AutocompleteService */
  }

  return fetchPredictionsLegacy(trimmed, sessionToken);
}

function detailsFromPlace(place: PlaceLike, fallbackName: string): GooglePlaceDetails | null {
  const coords = coordsFromLatLng(place.location);
  if (!coords) return null;
  const name = displayNameOf(place) || fallbackName;
  return {
    coords,
    name,
    address: removePlusCode(place.formattedAddress || name),
  };
}

async function resolvePlaceDetailsNew(
  placeId: string,
  fallbackName: string
): Promise<GooglePlaceDetails | null> {
  const factory = placeFactoryById.get(placeId);
  if (!factory) return null;
  try {
    const place = factory();
    await place.fetchFields({
      fields: ['location', 'formattedAddress', 'displayName'],
    });
    const details = detailsFromPlace(place, fallbackName);
    if (details) trackGoogleMapsUsage('places_details');
    return details;
  } catch {
    return null;
  }
}

function resolvePlaceDetailsLegacy(
  placeId: string,
  fallbackName: string,
  sessionToken: PlacesSessionToken | null | undefined,
  host?: HTMLElement | google.maps.Map | null
): Promise<GooglePlaceDetails | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.places?.PlacesService) {
      resolve(null);
      return;
    }
    const service = new window.google.maps.places.PlacesService(
      host || document.createElement('div')
    );
    service.getDetails(
      {
        placeId,
        fields: ['formatted_address', 'geometry', 'name'],
        ...(sessionToken ? { sessionToken } : {}),
      },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) {
          resolve(null);
          return;
        }
        const loc = place.geometry?.location;
        if (!loc || typeof loc.lat !== 'function') {
          resolve(null);
          return;
        }
        const lat = loc.lat();
        const lng = loc.lng();
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
          resolve(null);
          return;
        }
        const name = place.name || fallbackName;
        resolve({
          coords: { lat, lng },
          name,
          address: removePlusCode(place.formatted_address || name),
        });
      }
    );
  });
}

/** One Place Details call (Essentials fields only). Do not also Geocode the same place. */
export async function resolveGooglePlaceDetails(
  placeId: string,
  options?: {
    sessionToken?: PlacesSessionToken | null;
    fallbackName?: string;
    host?: HTMLElement | google.maps.Map | null;
  }
): Promise<GooglePlaceDetails | null> {
  const id = placeId.trim();
  if (!id) return null;
  await ensureGoogleMapsApi();
  const fallbackName = options?.fallbackName || '';
  const fromNew = await resolvePlaceDetailsNew(id, fallbackName);
  if (fromNew) {
    placeFactoryById.delete(id);
    return fromNew;
  }
  return resolvePlaceDetailsLegacy(id, fallbackName, options?.sessionToken, options?.host);
}
