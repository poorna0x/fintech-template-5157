/** In-memory cache for Website analytics card (same browser tab, short TTL). */

const TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  key: string;
  at: number;
  data: unknown;
};

let summaryEntry: CacheEntry | null = null;
let recentEntry: CacheEntry | null = null;

function readEntry<T>(entry: CacheEntry | null, key: string): T | null {
  if (!entry || entry.key !== key) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.data as T;
}

function writeEntry(key: string, data: unknown): CacheEntry {
  return { key, at: Date.now(), data };
}

export function buildWebsiteSummaryCacheKey(from: string, to: string): string {
  return JSON.stringify({ from, to });
}

export function buildWebsiteRecentCacheKey(input: {
  from: string;
  to: string;
  siteFilter: string;
  page: number;
  perPage: number;
}): string {
  return JSON.stringify(input);
}

export function readWebsiteSummaryCache<T>(key: string): T | null {
  const hit = readEntry<T>(summaryEntry, key);
  if (!hit) summaryEntry = null;
  return hit;
}

export function writeWebsiteSummaryCache(key: string, data: unknown): void {
  summaryEntry = writeEntry(key, data);
}

export function readWebsiteRecentCache<T>(key: string): T | null {
  const hit = readEntry<T>(recentEntry, key);
  if (!hit) recentEntry = null;
  return hit;
}

export function writeWebsiteRecentCache(key: string, data: unknown): void {
  recentEntry = writeEntry(key, data);
}

export function clearWebsiteAnalyticsSessionCache(): void {
  summaryEntry = null;
  recentEntry = null;
}
