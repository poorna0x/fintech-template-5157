/** Raw water TDS in ppm (not tax TDS). */

export function parsePositiveTdsPpm(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Value to persist on a job at complete time. Softener visits store null. */
export function rawWaterTdsForJobComplete(isSoftener: boolean, input: string): number | null {
  if (isSoftener) return null;
  const n = parseInt(String(input || '').trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function isSoftenerJobVisit(job: {
  service_type?: unknown;
  serviceType?: unknown;
  service_sub_type?: unknown;
  serviceSubType?: unknown;
}): boolean {
  const serviceType = String(job.service_type || job.serviceType || '').toUpperCase();
  const serviceSubType = String(job.service_sub_type || job.serviceSubType || '').toUpperCase();
  return (
    serviceType === 'SOFTENER' ||
    serviceType.includes('SOFTENER') ||
    serviceSubType.includes('SOFTENER') ||
    serviceSubType.includes('SOFTNER')
  );
}

function visitTdsFieldWasStored(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * TDS for this visit. Prefers jobs.raw_water_tds (0 means none entered).
 * Falls back to the customer field only for legacy RO jobs that never stored a visit reading.
 * Softener visits never show customer TDS.
 */
export function jobVisitRawWaterTdsPpm(job: {
  raw_water_tds?: unknown;
  rawWaterTds?: unknown;
  service_type?: unknown;
  serviceType?: unknown;
  service_sub_type?: unknown;
  serviceSubType?: unknown;
  customer?: { raw_water_tds?: unknown; rawWaterTds?: unknown } | null;
}): number | null {
  const own = job.raw_water_tds !== undefined && job.raw_water_tds !== null ? job.raw_water_tds : job.rawWaterTds;
  if (visitTdsFieldWasStored(own)) {
    return parsePositiveTdsPpm(own);
  }
  if (isSoftenerJobVisit(job)) return null;
  return (
    parsePositiveTdsPpm(job.customer?.raw_water_tds) ??
    parsePositiveTdsPpm(job.customer?.rawWaterTds)
  );
}

/** Prefill for completed-job edit. Own visit value first; legacy RO jobs use customer TDS. */
export function rawWaterTdsEditInput(job: {
  raw_water_tds?: unknown;
  rawWaterTds?: unknown;
  service_type?: unknown;
  serviceType?: unknown;
  service_sub_type?: unknown;
  serviceSubType?: unknown;
  customer?: { raw_water_tds?: unknown; rawWaterTds?: unknown } | null;
}): string {
  if (isSoftenerJobVisit(job)) return '';
  const own = job.raw_water_tds !== undefined && job.raw_water_tds !== null ? job.raw_water_tds : job.rawWaterTds;
  if (visitTdsFieldWasStored(own)) {
    const n = parseInt(String(own).trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(n);
  }
  const fallback = jobVisitRawWaterTdsPpm(job);
  return fallback != null ? String(fallback) : '';
}
