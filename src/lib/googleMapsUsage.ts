import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type GoogleMapsSkuUsage = {
  id: string;
  label: string;
  hint: string;
  freeCap: number;
  usdPerThousand: number;
  requests: number;
  remaining?: number;
  usedPercent?: number;
  insideFree?: boolean;
  billable: number;
  estimatedUsd: number;
  trackedRequests?: number;
  googleRequests?: number;
};

function sku(
  id: string,
  label: string,
  hint: string,
  usdPerThousand: number
): GoogleMapsSkuUsage {
  return {
    id,
    label,
    hint,
    freeCap: 10_000,
    usdPerThousand,
    requests: 0,
    remaining: 10_000,
    usedPercent: 0,
    insideFree: true,
    billable: 0,
    estimatedUsd: 0,
  };
}

/** Shown before the function responds. One row per Maps API we use daily. */
export const GOOGLE_MAPS_SKU_FALLBACK: GoogleMapsSkuUsage[] = [
  sku('dynamic_maps', 'Maps JavaScript', 'Map shown on booking, hubs, spread, technician location, add/edit customer', 7),
  sku('places_autocomplete', 'Places Autocomplete', 'Address search as you type (website booking, hubs, add customer)', 2.83),
  sku('places_details', 'Places Details', 'Picking a suggested address (Place Details / Autocomplete getPlace)', 2.83),
  sku('places_find', 'Find Place', 'Pasted Google Maps links and WhatsApp place names', 5),
  sku('geocoding', 'Geocoding', 'GPS → address, pin reverse-geocode, Maps link coordinates', 5),
  sku('distance_matrix', 'Distance Matrix', 'Travel km, avoid-tolls, assign-job distance, visit order', 5),
];

export type GoogleMapsUsagePayload = {
  ok: boolean;
  configured?: boolean;
  trackingAvailable?: boolean;
  credentialSource?: string | null;
  projectId?: string | null;
  monthKey?: string;
  skus?: GoogleMapsSkuUsage[];
  other?: Array<{ service: string; requests: number }>;
  requests?: number;
  estimatedUsd?: number;
  insideFree?: boolean;
  consoleUrl?: string;
  generatedAt?: string;
  error?: string;
  note?: string;
};

export async function fetchGoogleMapsUsage(refresh = false): Promise<GoogleMapsUsagePayload> {
  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) return { ok: false, error: 'Not signed in' };

    const res = await fetch('/.netlify/functions/google-maps-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh }),
    });
    const data = (await res.json().catch(() => ({}))) as GoogleMapsUsagePayload;
    const skus = Array.isArray(data.skus) && data.skus.length ? data.skus : GOOGLE_MAPS_SKU_FALLBACK;
    return {
      ok: data.ok !== false && (res.ok || skus.length > 0),
      configured: data.configured,
      trackingAvailable: data.trackingAvailable,
      credentialSource: data.credentialSource,
      projectId: data.projectId,
      monthKey: data.monthKey,
      skus,
      other: Array.isArray(data.other) ? data.other : [],
      requests: Number(data.requests) || 0,
      estimatedUsd: Number(data.estimatedUsd) || 0,
      insideFree: data.insideFree !== false,
      consoleUrl: data.consoleUrl,
      generatedAt: data.generatedAt,
      error: data.error,
      note: data.note,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load Google Maps usage',
      skus: GOOGLE_MAPS_SKU_FALLBACK,
    };
  }
}
