/**
 * Client-side approximate inventory search.
 * Pure functions over already-loaded rows — no network / egress.
 *
 * Matching strategy (best → weakest that still counts as a hit):
 * 1. Exact / starts-with on normalized name or code
 * 2. Contiguous substring (legacy includes behavior)
 * 3. All query tokens present (order-independent; spaces/hyphens ignored in normalize)
 * 4. Light typo tolerance (edit distance ≤ 1 for short tokens, ≤ 2 for longer)
 */

export type InventorySearchable = {
  product_name?: string | null;
  code?: string | null;
};

/** Lowercase + strip spaces/punctuation so "pre filter" ≈ "Prefilter" / "SF-10" ≈ "sf10". */
export function normalizeInventoryText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Tokens for multi-word queries; keeps alphanumerics only. */
export function tokenizeInventoryQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function maxEditDistance(tokenLen: number): number {
  // Short tokens: exact substring only. Fuzzy on 3-letter needles
  // (e.g. "rom" → "ro") falsely hits names that merely contain "ro".
  if (tokenLen < 4) return 0;
  if (tokenLen <= 5) return 1;
  return 2;
}

/** Contiguous or near-contiguous match of a token inside a normalized haystack. */
function tokenMatchesNormalized(hayNorm: string, token: string): boolean {
  const needle = normalizeInventoryText(token);
  if (!needle) return true;
  if (hayNorm.includes(needle)) return true;

  const maxDist = maxEditDistance(needle.length);
  if (maxDist === 0 || hayNorm.length === 0) return false;

  const n = needle.length;
  // Keep window length close to the needle so deletions can't shrink
  // "rom" into "ro" (or similar) and match unrelated products.
  const minLen = Math.max(1, n - maxDist);
  const maxLen = n + maxDist;
  const limit = Math.min(hayNorm.length, 120); // inventory names/codes are short
  for (let i = 0; i <= limit - minLen; i++) {
    for (let len = minLen; len <= maxLen; len++) {
      if (i + len > hayNorm.length) break;
      if (levenshtein(needle, hayNorm.slice(i, i + len)) <= maxDist) return true;
    }
  }
  return false;
}

/**
 * Higher score = better match. Returns null if no match.
 * Scores are designed so callers can sort descending.
 */
export function scoreInventoryMatch(
  productName: string | null | undefined,
  code: string | null | undefined,
  query: string
): number | null {
  const q = query.trim();
  if (!q) return 0;

  const name = productName ?? '';
  const codeStr = code ?? '';
  const nameLower = name.toLowerCase();
  const codeLower = codeStr.toLowerCase();
  const qLower = q.toLowerCase();
  const nameNorm = normalizeInventoryText(name);
  const codeNorm = normalizeInventoryText(codeStr);
  const qNorm = normalizeInventoryText(q);
  const tokens = tokenizeInventoryQuery(q);

  // Punctuation / symbol-only query (nothing alphanumeric to match)
  if (!qNorm && tokens.length === 0) return null;

  // Exact normalized code / name
  if (codeNorm && codeNorm === qNorm) return 1000;
  if (nameNorm && nameNorm === qNorm) return 950;

  // Starts-with (raw or normalized)
  if (codeLower.startsWith(qLower) || (codeNorm && qNorm && codeNorm.startsWith(qNorm))) return 900;
  if (nameLower.startsWith(qLower) || (nameNorm && qNorm && nameNorm.startsWith(qNorm))) return 850;

  // Contiguous substring (legacy includes)
  if (codeLower.includes(qLower) || (codeNorm && qNorm && codeNorm.includes(qNorm))) return 800;
  if (nameLower.includes(qLower) || (nameNorm && qNorm && nameNorm.includes(qNorm))) return 750;

  // All tokens present (order-independent) on name or code
  if (tokens.length > 0) {
    const hay = `${nameNorm} ${codeNorm}`;
    const allHit = tokens.every((t) => tokenMatchesNormalized(hay, t));
    if (allHit) {
      // Prefer more specific (fewer leftover chars)
      const coverage = Math.min(100, Math.round((qNorm.length / Math.max(nameNorm.length, 1)) * 100));
      return 500 + coverage;
    }
  }

  return null;
}

export function matchesInventorySearch(
  productName: string | null | undefined,
  code: string | null | undefined,
  query: string
): boolean {
  if (!query.trim()) return true;
  return scoreInventoryMatch(productName, code, query) != null;
}

/**
 * Filter + rank inventory-like rows. Stable for empty query (returns input order).
 */
export function filterInventoryByApproxSearch<T extends InventorySearchable>(
  items: T[],
  query: string
): T[] {
  const q = query.trim();
  if (!q) return items;

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = scoreInventoryMatch(item.product_name, item.code, q);
    if (score != null) scored.push({ item, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const an = a.item.product_name || '';
    const bn = b.item.product_name || '';
    return an.localeCompare(bn);
  });
  return scored.map((s) => s.item);
}

/**
 * For rows that nest inventory under `.inventory` (tech bag rows).
 */
export function filterNestedInventoryByApproxSearch<
  T extends { inventory?: InventorySearchable | null; inventory_id?: string }
>(
  items: T[],
  query: string,
  resolve?: (item: T) => InventorySearchable | null | undefined
): T[] {
  const q = query.trim();
  if (!q) return items;

  const scored: Array<{ item: T; score: number; name: string }> = [];
  for (const item of items) {
    const inv = resolve?.(item) ?? item.inventory ?? null;
    const score = scoreInventoryMatch(inv?.product_name, inv?.code, q);
    if (score != null) {
      scored.push({ item, score, name: inv?.product_name || '' });
    }
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
  return scored.map((s) => s.item);
}
