import { supabase } from '@/lib/supabaseClient';

function requirementEntries(requirements: unknown): Record<string, unknown>[] {
  let parsed = requirements;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
  }
  if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
  return [];
}

function photoUrl(photo: unknown): string | null {
  if (typeof photo === 'string') {
    const trimmed = photo.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }
  if (photo && typeof photo === 'object') {
    const row = photo as { secure_url?: unknown; url?: unknown };
    if (typeof row.secure_url === 'string' && /^https?:\/\//i.test(row.secure_url.trim())) {
      return row.secure_url.trim();
    }
    if (typeof row.url === 'string' && /^https?:\/\//i.test(row.url.trim())) {
      return row.url.trim();
    }
  }
  return null;
}

/** Brand-sticker photos stored on the job (customer gallery only). */
export function stickerPhotoUrlsFromJob(job: { requirements?: unknown }): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const req of requirementEntries(job.requirements)) {
    const list = req.sticker_photos;
    if (!Array.isArray(list)) continue;
    for (const photo of list) {
      const url = photoUrl(photo);
      if (!url) continue;
      const key = url.split('?')[0].split('#')[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(url);
    }
  }
  return urls;
}

export function jobStickerSkipped(job: { requirements?: unknown }): boolean {
  if (stickerPhotoUrlsFromJob(job).length > 0) return false;
  return requirementEntries(job.requirements).some((req) => req.sticker_skipped === true);
}

export function collectStickerSkipNotes(
  jobs: Array<{
    requirements?: unknown;
    completed_at?: string | null;
    created_at?: string | null;
    job_number?: string | null;
    jobNumber?: string | null;
  }>
): string[] {
  const notes: string[] = [];
  for (const job of jobs) {
    if (!jobStickerSkipped(job)) continue;
    const num = String(job.job_number || job.jobNumber || '').trim();
    const when = job.completed_at || job.created_at;
    let label = 'Brand sticker skipped';
    if (num) label += ` · ${num}`;
    if (when) {
      const d = new Date(when);
      if (!Number.isNaN(d.getTime())) {
        label += ` · ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
    }
    notes.push(label);
  }
  return notes;
}

/** Soft-fails to false when the column is not on the database yet. */
export async function loadBrandStickerRequired(technicianId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('technicians')
    .select('brand_sticker_required')
    .eq('id', technicianId)
    .maybeSingle();
  if (error) {
    if (/brand_sticker_required/i.test(error.message || '')) return false;
    return false;
  }
  return (data as { brand_sticker_required?: boolean } | null)?.brand_sticker_required === true;
}
