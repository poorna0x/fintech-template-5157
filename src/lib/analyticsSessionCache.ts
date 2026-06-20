/** In-memory cache for CRM Analytics main load (same browser tab, short TTL). */

const TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  key: string;
  at: number;
  data: unknown;
};

let entry: CacheEntry | null = null;

export type AnalyticsCacheKeyInput = {
  period: string;
  customStartDate: string;
  customEndDate: string;
  customMonthValue: string;
};

export function buildAnalyticsCacheKey(input: AnalyticsCacheKeyInput): string {
  return JSON.stringify(input);
}

export function readAnalyticsSessionCache<T>(key: string): T | null {
  if (!entry || entry.key !== key) return null;
  if (Date.now() - entry.at > TTL_MS) {
    entry = null;
    return null;
  }
  return entry.data as T;
}

export function writeAnalyticsSessionCache(key: string, data: unknown): void {
  entry = { key, at: Date.now(), data };
}

export function clearAnalyticsSessionCache(): void {
  entry = null;
}
