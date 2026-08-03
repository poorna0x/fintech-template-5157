/** `jobs.visit_order` — absent until `scripts/add-job-visit-order-column.sql` is applied.
 *  `jobs.tech_arrived_at` — absent until `scripts/add-job-tech-arrived-at.sql` is applied.
 */

let visitOrderColumnAvailable: boolean | null = null;
let techArrivedColumnAvailable: boolean | null = null;

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

export function isMissingTechArrivedColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const details = String((error as { details?: string }).details ?? '');
  const hint = String((error as { hint?: string }).hint ?? '');
  const code = String((error as { code?: string }).code ?? '');
  const blob = `${message} ${details} ${hint}`;
  return (
    blob.includes('tech_arrived_at') ||
    (code === 'PGRST204' && blob.toLowerCase().includes('tech_arrived_at')) ||
    (code === '42703' && blob.includes('tech_arrived_at'))
  );
}

export function markVisitOrderColumnMissing(): void {
  visitOrderColumnAvailable = false;
}

export function markTechArrivedColumnMissing(): void {
  techArrivedColumnAvailable = false;
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

export function omitTechArrivedFromSelect(columnList: string): string {
  return columnList
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== 'tech_arrived_at' && !c.startsWith('tech_arrived_at'))
    .join(',');
}

/** Prefer full select; strip optional columns after we learn they are missing. */
export function resolveJobSelect(select: string): string {
  let out = select;
  if (visitOrderColumnAvailable === false) out = omitVisitOrderFromSelect(out);
  if (techArrivedColumnAvailable === false) out = omitTechArrivedFromSelect(out);
  return out;
}
