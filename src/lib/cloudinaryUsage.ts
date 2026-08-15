import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type CloudinaryMeter = {
  available: boolean;
  usage: number | null;
  limit: number | null;
  usedPercent: number | null;
  remaining: number | null;
  creditsUsage: number | null;
  quotaSource?: 'api' | 'free_plan';
  breakdown?: Record<string, number> | null;
};

export type CloudinaryAssetRow = {
  publicId: string;
  filename: string;
  resourceType: string;
  format: string;
  bytes: number | null;
  folder: string;
  createdAt: string | null;
  previewUrl?: string | null;
};

export type CloudinaryAccountOverview = {
  id: string;
  label: string;
  cloudName: string;
  cached?: boolean;
  lastUpdated?: string;
  usage?: {
    plan: string | null;
    cloudinaryLastUpdated: string | null;
    dateRequested: string | null;
    resources: number | null;
    derivedResources: number | null;
    mediaLimits: Record<string, number> | null;
    meters: {
      storage: CloudinaryMeter;
      bandwidth: CloudinaryMeter;
      transformations: CloudinaryMeter;
      objects: CloudinaryMeter;
      credits: CloudinaryMeter;
      impressions: CloudinaryMeter;
      secondsDelivered: CloudinaryMeter;
      requests: CloudinaryMeter;
    };
    addons: Array<{ key: string } & CloudinaryMeter>;
  } | null;
  resourceCounts?: { image: number | null; video: number | null; raw: number | null };
  resourceCountTotal?: number | null;
  sizeByResourceType?: { available: boolean; reason?: string };
  rateLimit?: { limit: number | null; remaining: number | null; resetAt: string | null };
};

export type CloudinaryAccountDetails = {
  folders?: {
    available: boolean;
    count: number | null;
    names: string[];
    truncated?: boolean;
    sizeByFolder?: { available: boolean; reason?: string };
    error?: string;
  };
  recentAssets?: { available: boolean; items: CloudinaryAssetRow[]; error?: string };
  largestAssets?: { available: boolean; items: CloudinaryAssetRow[]; error?: string };
  aggregations?: {
    available: boolean;
    reason?: string;
    byFormat: Record<string, number> | null;
    byResourceType: Record<string, number> | null;
  };
  lastUpdated?: string;
};

export type CloudinaryHistoryPoint = {
  date: string;
  storage: number | null;
  bandwidth: number | null;
  transformations: number | null;
  resources: number | null;
};

export type CloudinaryUsagePayload = {
  ok: boolean;
  lastUpdated?: string;
  error?: string;
  accounts: Array<{
    id: string;
    label: string;
    cloudName: string;
    overview?: CloudinaryAccountOverview;
    overviewError?: string;
    details?: CloudinaryAccountDetails;
    detailsError?: string;
    history?: { history?: { available: boolean; points: CloudinaryHistoryPoint[] } };
    historyError?: string;
    rateLimited?: boolean;
  }>;
};

async function callUsage(body: Record<string, boolean>): Promise<CloudinaryUsagePayload> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in', accounts: [] };

  const res = await fetch('/.netlify/functions/cloudinary-usage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as CloudinaryUsagePayload;
  if (!res.ok && !data?.accounts) {
    return {
      ok: false,
      error: data?.error || `HTTP ${res.status}`,
      accounts: [],
    };
  }
  return {
    ok: Boolean(data.ok),
    lastUpdated: data.lastUpdated,
    error: data.error,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
  };
}

export function fetchCloudinaryUsage(refresh = false): Promise<CloudinaryUsagePayload> {
  return callUsage({ refresh });
}

export function fetchCloudinaryUsageDetails(refresh = false): Promise<CloudinaryUsagePayload> {
  return callUsage({ refresh, details: true });
}

export function fetchCloudinaryUsageHistory(refresh = false): Promise<CloudinaryUsagePayload> {
  return callUsage({ refresh, history: true });
}

export function meterLabel(meter: CloudinaryMeter | undefined, format: (n: number) => string): string {
  if (!meter?.available || meter.usage == null) return 'Not available through Cloudinary API';
  return format(meter.usage);
}
