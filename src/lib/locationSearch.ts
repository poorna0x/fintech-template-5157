/**
 * Fuzzy locality matching for CRM address / area search.
 * PostgREST only has `ilike`, so we expand the query into a few OR tokens
 * (drop filler words, split on spaces, keep a short prefix of long names)
 * instead of requiring the whole typed phrase as one substring.
 */

const MAX_LOCATION_TOKENS = 8;

const LOCATION_STOPWORDS = new Set([
  'road',
  'rd',
  'street',
  'st',
  'nagar',
  'layout',
  'colony',
  'phase',
  'stage',
  'cross',
  'block',
  'blk',
  'sector',
  'main',
  'near',
  'opp',
  'opposite',
  'beside',
  'next',
  'the',
  'and',
  'in',
  'at',
  'of',
  'to',
  'area',
  'west',
  'east',
  'north',
  'south',
  'bangalore',
  'bengaluru',
  'karnataka',
  'india',
  'apartment',
  'apartments',
  'apt',
  'flats',
  'society',
  'township',
  'village',
  'post',
  'hobli',
  'taluk',
  'dist',
  'district',
]);

function locationPrefix(token: string): string | null {
  if (token.length < 6 || /^\d+$/.test(token) || /\s/.test(token) || /[\/\-]/.test(token)) return null;
  const prefixLen = token.length <= 7 ? token.length - 1 : Math.min(8, token.length - 2);
  if (prefixLen < 4 || prefixLen >= token.length) return null;
  return token.slice(0, prefixLen);
}

/** Flat / house tokens: 123, 12A, B204, 12/3, 10-2. Skips 1-digit noise and 6-digit pincodes. */
export function isHouseNumberToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t || /^\d{6}$/.test(t)) return false;
  if (/^\d{2,5}$/.test(t)) return true;
  if (/^\d{1,5}[a-z]$/.test(t)) return true;
  if (/^[a-z]\d{1,5}[a-z]?$/.test(t)) return true;
  if (/^\d{1,4}[\/\-]\d{1,4}[a-z]?$/.test(t)) return true;
  if (/^[a-z][\/\-]\d{1,5}$/.test(t)) return true;
  return false;
}

function collapseLocationText(input: string): string {
  return input.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function segmentSeeds(segment: string): string[] {
  const collapsed = collapseLocationText(segment);
  if (!collapsed) return [];
  const raw = collapsed
    .split(/[^a-z0-9\/\-]+/)
    .map((t) => t.replace(/^\/+|\/+$/g, '').replace(/^-+|-+$/g, '').trim())
    .filter(Boolean);

  const meaningful: string[] = [];
  for (const t of raw) {
    if (LOCATION_STOPWORDS.has(t)) continue;
    if (/^\d{6}$/.test(t)) {
      meaningful.push(t);
      continue;
    }
    if (isHouseNumberToken(t)) {
      meaningful.push(t);
      continue;
    }
    if (/^\d+$/.test(t)) continue;
    if (t.length < 3) continue;
    meaningful.push(t);
  }
  if (meaningful.length > 0) return meaningful;
  return collapsed.length >= 2 ? [collapsed] : [];
}

/**
 * Comma-separated places are alternatives.
 * Words inside one place must all match (so "Rohan Upavan" is that society,
 * not every address that contains Rohan). Each word includes a short prefix
 * so a near-miss spelling still hits.
 */
export function locationPlaceGroups(input: string): string[][][] {
  const segments = input
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const groups: string[][][] = [];
  for (const segment of segments) {
    const words = segmentSeeds(segment).map((seed) => {
      const variants = [seed];
      const prefix = locationPrefix(seed);
      if (prefix) variants.push(prefix);
      return variants;
    });
    if (words.length) groups.push(words);
  }
  return groups;
}

/**
 * Expand a typed area string into match tokens.
 * "Kasavanahalli main road, Haralur" → kasavanahalli, kasavana, haralur, haralu
 * "123 Haralur" keeps 123 as a flat/house token.
 */
export function tokenizeLocationQuery(input: string): string[] {
  const flat = locationPlaceGroups(input).flat(2);
  return [...new Set(flat)].slice(0, MAX_LOCATION_TOKENS);
}

/** Street line to show when the short area name hides the place that was searched. */
export function searchMatchAddressLine(
  query: string,
  visibleAddress: string | null | undefined,
  street: string | null | undefined
): string {
  const short = (visibleAddress || '').trim();
  const line = (street || '').trim();
  if (!line) return short || '—';
  const words = collapseLocationText(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return short || line;
  const lineL = line.toLowerCase();
  const shortL = short.toLowerCase();
  const missingFromShort = words.filter((w) => !shortL.includes(w));
  const streetHasMissing = missingFromShort.some((w) => lineL.includes(w));
  if (!streetHasMissing) return short || line;
  const first = missingFromShort
    .map((w) => lineL.indexOf(w))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, first - 24);
  const snippet = (start > 0 ? '…' : '') + line.slice(start, start + 72).trim() + (start + 72 < line.length ? '…' : '');
  return short ? `${snippet} · ${short}` : snippet;
}

/** Client-side: area name matches a fuzzy location query (suggestions). */
export function locationQueryMatchesText(query: string, haystack: string): boolean {
  const tokens = tokenizeLocationQuery(query);
  if (tokens.length === 0) return false;
  const hay = haystack.trim().toLowerCase();
  if (!hay) return false;
  const exact = query.trim().toLowerCase();
  if (exact && hay.includes(exact)) return true;
  return tokens.some((t) => hay.includes(t));
}

export function filterLocationSuggestions(
  query: string,
  areas: readonly string[],
  limit = 12
): string[] {
  const q = query.trim();
  if (!q) return [];
  const tokens = tokenizeLocationQuery(q);
  if (tokens.length === 0) return [];
  const qLower = q.toLowerCase();
  const seen = new Set<string>();
  const scored: { area: string; score: number; len: number }[] = [];

  for (const area of areas) {
    const trimmed = area.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    const lower = trimmed.toLowerCase();
    let score = -1;
    if (lower.includes(qLower)) score = 0;
    else if (tokens.some((t) => lower.includes(t))) score = 1;
    if (score < 0) continue;
    seen.add(lower);
    scored.push({ area: trimmed, score, len: trimmed.length });
  }

  scored.sort((a, b) => a.score - b.score || a.len - b.len || a.area.localeCompare(b.area));
  return scored.slice(0, limit).map((s) => s.area);
}
