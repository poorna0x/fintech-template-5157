/**
 * Shared job fields for assign WhatsApp / push / edit notifications.
 */
import { parseJobRequirements } from '@/lib/adminUtils';

export function getJobDescriptionText(job: Record<string, unknown> | null | undefined): string {
  if (!job) return '';
  return String((job as { description?: string }).description || '').trim();
}

/** Agreed cost from requirements.cost_range, else estimated_cost. */
export function getJobAgreedCostLabel(job: Record<string, unknown> | null | undefined): string {
  if (!job) return '';
  try {
    const reqs = parseJobRequirements((job as { requirements?: unknown }).requirements);
    for (const r of reqs) {
      if (r && typeof r === 'object' && (r as { cost_range?: unknown }).cost_range != null) {
        const range = String((r as { cost_range: unknown }).cost_range).trim();
        if (range) return range;
      }
    }
  } catch {
    /* ignore */
  }
  const n = Number(
    (job as { estimated_cost?: unknown }).estimated_cost ??
      (job as { estimatedCost?: unknown }).estimatedCost
  );
  if (Number.isFinite(n) && n > 0) return `₹${n.toLocaleString('en-IN')}`;
  return '';
}

export function appendAssignExtras(
  base: string,
  opts: { description?: string; agreedCost?: string; maxLen?: number }
): string {
  const parts = [base];
  const cost = (opts.agreedCost || '').trim();
  const desc = (opts.description || '').trim();
  if (cost) parts.push(`Agreed: ${cost}`);
  if (desc) parts.push(`Note: ${desc}`);
  let out = parts.join(' | ');
  const max = opts.maxLen ?? 300;
  if (out.length > max) out = `${out.slice(0, max - 1)}…`;
  return out;
}

export function customerHasPurifierPhoto(photos: unknown): boolean {
  if (!Array.isArray(photos) || photos.length === 0) return false;
  return photos.some((p) => {
    const url =
      typeof p === 'string'
        ? p
        : p && typeof p === 'object'
          ? String((p as { url?: string; secure_url?: string }).url || (p as { secure_url?: string }).secure_url || '')
          : '';
    return url.trim().startsWith('http');
  });
}

/** True when the customer has no purifier photo on file. */
export function customerMissingPurifierPhoto(
  customer: Record<string, unknown> | null | undefined
): boolean {
  if (!customer) return true;
  const photos =
    (customer as { photos?: unknown }).photos ??
    (customer as { Photos?: unknown }).Photos;
  return !customerHasPurifierPhoto(photos);
}
