/** DB columns for dual-site customers/jobs — may be absent until migration SQL is applied. */

export const DUAL_SITE_CUSTOMER_COLUMNS = [
  'alternate_brand',
  'alternate_model',
  'alternate_service_type',
] as const;

export const DUAL_SITE_JOB_COLUMNS = ['service_site'] as const;

export function isMissingDualSiteColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const code = String((error as { code?: string }).code ?? '');
  return (
    DUAL_SITE_CUSTOMER_COLUMNS.some((col) => message.includes(col)) ||
    message.includes('service_site') ||
    code === 'PGRST204'
  );
}

export function omitDualSiteCustomerCols(columnList: string): string {
  const drop = new Set<string>(DUAL_SITE_CUSTOMER_COLUMNS);
  return columnList
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && !drop.has(c))
    .join(',');
}

export function omitDualSiteJobCols(columnList: string): string {
  return columnList
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== 'service_site')
    .join(',');
}

export function stripDualSiteCustomerFields<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const key of DUAL_SITE_CUSTOMER_COLUMNS) {
    delete out[key];
  }
  return out;
}

export function stripDualSiteJobFields<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const key of DUAL_SITE_JOB_COLUMNS) {
    delete out[key];
  }
  return out;
}
