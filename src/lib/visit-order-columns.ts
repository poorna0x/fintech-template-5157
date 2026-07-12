/** `jobs.visit_order` — absent until `scripts/add-job-visit-order-column.sql` is applied. */

let visitOrderColumnAvailable: boolean | null = null;

export function isMissingVisitOrderColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const details = String((error as { details?: string }).details ?? '');
  const hint = String((error as { hint?: string }).hint ?? '');
  const code = String((error as { code?: string }).code ?? '');
  const blob = `${message} ${details} ${hint}`;
  return (
    blob.includes('visit_order') ||
    (code === 'PGRST204' && blob.toLowerCase().includes('visit_order')) ||
    (code === '42703' && blob.includes('visit_order'))
  );
}

export function markVisitOrderColumnMissing(): void {
  visitOrderColumnAvailable = false;
}

export function isVisitOrderColumnAssumedAvailable(): boolean {
  return visitOrderColumnAvailable !== false;
}

export function omitVisitOrderFromSelect(columnList: string): string {
  return columnList
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== 'visit_order' && !c.startsWith('visit_order'))
    .join(',');
}

/** Prefer full select; strip visit_order after we learn the column is missing. */
export function resolveJobSelect(select: string): string {
  if (visitOrderColumnAvailable === false) return omitVisitOrderFromSelect(select);
  return select;
}
