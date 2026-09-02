/** `jobs.raw_water_tds` — absent until `scripts/add-jobs-raw-water-tds.sql` is applied. */

let rawWaterTdsColumnAvailable: boolean | null = null;

export function isMissingRawWaterTdsColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const details = String((error as { details?: string }).details ?? '');
  const hint = String((error as { hint?: string }).hint ?? '');
  const code = String((error as { code?: string }).code ?? '');
  const blob = `${message} ${details} ${hint}`;
  return (
    (blob.includes('raw_water_tds') && (blob.includes('jobs') || blob.includes('schema cache') || code === 'PGRST204' || code === '42703')) ||
    (code === 'PGRST204' && blob.toLowerCase().includes('raw_water_tds')) ||
    (code === '42703' && blob.includes('raw_water_tds'))
  );
}

export function markRawWaterTdsColumnMissing(): void {
  rawWaterTdsColumnAvailable = false;
}

export function isRawWaterTdsColumnAssumedAvailable(): boolean {
  return rawWaterTdsColumnAvailable !== false;
}

/** Strip top-level `raw_water_tds` only (keeps `customers(...,raw_water_tds)` embeds). */
export function omitRawWaterTdsFromSelect(columnList: string): string {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < columnList.length; i++) {
    const ch = columnList[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const token = buf.trim();
      if (token && token !== 'raw_water_tds') parts.push(token);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const last = buf.trim();
  if (last && last !== 'raw_water_tds') parts.push(last);
  return parts.join(',');
}

export function resolveRawWaterTdsJobSelect(select: string): string {
  if (rawWaterTdsColumnAvailable === false) return omitRawWaterTdsFromSelect(select);
  return select;
}

export function omitRawWaterTdsFromJobUpdate<T extends Record<string, unknown>>(updates: T): T {
  if (!('raw_water_tds' in updates) && !('rawWaterTds' in updates)) return updates;
  const next = { ...updates };
  delete next.raw_water_tds;
  delete next.rawWaterTds;
  return next;
}
