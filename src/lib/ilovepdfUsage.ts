import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type ILovePdfUsagePayload = {
  ok: boolean;
  configured?: boolean;
  remainingCredits?: number | null;
  remainingFiles?: number | null;
  estimatedCompressJobs?: number | null;
  compressCreditsPerFile?: number;
  level?: string;
  region?: string;
  dashboardEnabled?: boolean;
  generatedAt?: string;
  error?: string;
};

export async function fetchILovePdfUsage(): Promise<ILovePdfUsagePayload> {
  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) return { ok: false, error: 'Not signed in' };

    const res = await fetch('/.netlify/functions/ilovepdf-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as ILovePdfUsagePayload;
    if (!res.ok && data.ok !== true) {
      return {
        ok: false,
        configured: data.configured,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: Boolean(data.ok),
      configured: data.configured,
      remainingCredits: data.remainingCredits ?? null,
      remainingFiles: data.remainingFiles ?? null,
      estimatedCompressJobs: data.estimatedCompressJobs ?? null,
      compressCreditsPerFile: data.compressCreditsPerFile ?? 10,
      level: data.level,
      region: data.region,
      dashboardEnabled: data.dashboardEnabled,
      generatedAt: data.generatedAt,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load iLovePDF usage',
    };
  }
}
