import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type GoogleMapsSkuUsage = {
  id: string;
  label: string;
  hint: string;
  freeCap: number;
  usdPerThousand: number;
  requests: number;
  billable: number;
  estimatedUsd: number;
};

/** Shown before the function responds, and when Monitoring is not configured. */
export const GOOGLE_MAPS_SKU_FALLBACK: GoogleMapsSkuUsage[] = [
  {
    id: 'dynamic_maps',
    label: 'Dynamic Maps',
    hint: 'Each Maps JavaScript load (booking, hubs, spread, CRM pins)',
    freeCap: 10_000,
    usdPerThousand: 7,
    requests: 0,
    billable: 0,
    estimatedUsd: 0,
  },
  {
    id: 'places',
    label: 'Places',
    hint: 'Autocomplete and place details when searching an address',
    freeCap: 10_000,
    usdPerThousand: 2.83,
    requests: 0,
    billable: 0,
    estimatedUsd: 0,
  },
  {
    id: 'geocoding',
    label: 'Geocoding',
    hint: 'Pin → address and pasted Maps links',
    freeCap: 10_000,
    usdPerThousand: 5,
    requests: 0,
    billable: 0,
    estimatedUsd: 0,
  },
  {
    id: 'distance',
    label: 'Distance / Routes',
    hint: 'Travel km and avoid-tolls lookups',
    freeCap: 10_000,
    usdPerThousand: 5,
    requests: 0,
    billable: 0,
    estimatedUsd: 0,
  },
];

export type GoogleMapsUsagePayload = {
  ok: boolean;
  configured?: boolean;
  credentialSource?: string | null;
  projectId?: string | null;
  monthKey?: string;
  skus?: GoogleMapsSkuUsage[];
  other?: Array<{ service: string; requests: number }>;
  requests?: number;
  estimatedUsd?: number;
  consoleUrl?: string;
  generatedAt?: string;
  error?: string;
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
    if (!res.ok && data.ok !== true) {
      return {
        ok: false,
        configured: data.configured,
        skus: Array.isArray(data.skus) ? data.skus : [],
        consoleUrl: data.consoleUrl,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: Boolean(data.ok),
      configured: data.configured,
      credentialSource: data.credentialSource,
      projectId: data.projectId,
      monthKey: data.monthKey,
      skus: Array.isArray(data.skus) ? data.skus : [],
      other: Array.isArray(data.other) ? data.other : [],
      requests: Number(data.requests) || 0,
      estimatedUsd: Number(data.estimatedUsd) || 0,
      consoleUrl: data.consoleUrl,
      generatedAt: data.generatedAt,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load Google Maps usage',
    };
  }
}
