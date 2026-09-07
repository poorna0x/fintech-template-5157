/**
 * Rank Settings command-palette rows. Exact hits stay on top; a small
 * Levenshtein allowance covers everyday typos (whatsap, remiders, serach).
 */

export type SettingsSearchable = {
  id: string;
  label: string;
  description: string;
  keywords: string;
};

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
  if (tokenLen < 4) return 0;
  if (tokenLen <= 5) return 1;
  return 2;
}

function wordsFrom(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

function tokenMatchesWord(token: string, word: string): boolean {
  if (!token || !word) return false;
  if (word === token || word.startsWith(token) || (token.length >= 4 && token.startsWith(word))) {
    return true;
  }
  if (token.length >= 3 && word.includes(token)) return true;

  const maxDist = maxEditDistance(token.length);
  if (maxDist === 0) return false;
  if (Math.abs(word.length - token.length) > maxDist) return false;
  return levenshtein(token, word) <= maxDist;
}

function tokenHitsHaystack(token: string, words: string[]): boolean {
  return words.some((word) => tokenMatchesWord(token, word));
}

export function scoreSettingsMatch(item: SettingsSearchable, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 1;

  const label = item.label.toLowerCase();
  const description = item.description.toLowerCase();
  const keywords = item.keywords.toLowerCase();
  const id = item.id.toLowerCase().replace(/-/g, ' ');
  const labelWords = wordsFrom(item.label);
  const keywordWords = wordsFrom(item.keywords);
  const idWords = wordsFrom(id);
  const descriptionWords = wordsFrom(item.description);
  const allWords = [...labelWords, ...keywordWords, ...idWords, ...descriptionWords];

  if (label === query || id === query) return 1000;
  if (label.startsWith(query)) return 900;
  if (labelWords.some((word) => word === query)) return 850;
  if (labelWords.some((word) => word.startsWith(query))) return 800;
  if (id.startsWith(query) || id.includes(` ${query}`)) return 750;
  if (label.includes(query)) return 700;
  if (keywordWords.some((word) => word === query)) return 650;
  if (keywordWords.some((word) => word.startsWith(query))) return 600;
  if (keywords.includes(query)) return 500;
  if (description.includes(query)) return 400;

  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;

  const allHit = tokens.every((token) => tokenHitsHaystack(token, allWords));
  if (!allHit) return 0;

  const labelHit = tokens.every((token) => tokenHitsHaystack(token, labelWords));
  if (labelHit) return 320;
  const keywordHit = tokens.every((token) => tokenHitsHaystack(token, [...labelWords, ...keywordWords]));
  if (keywordHit) return 260;
  return 180;
}
