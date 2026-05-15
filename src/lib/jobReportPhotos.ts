import { extractPhotoUrls, normalizePhotoUrl, parseJobRequirements } from '@/lib/adminUtils';
import { db } from '@/lib/supabase';

/** True when requirements already has payment + bill URLs (no after_photos fetch needed). */
export function jobHasPaymentAndBillPhotosInRequirements(job: {
  requirements?: unknown;
}): boolean {
  const requirements = parseJobRequirements(job.requirements);
  const qrPhotos = requirements.find((r: any) => r?.qr_photos)?.qr_photos;
  const hasQrPayment = Boolean(normalizePhotoUrl(qrPhotos?.payment_screenshot));

  const paymentPhotosReq = requirements.find((r: any) => r?.payment_photos);
  const paymentPhotos = paymentPhotosReq?.payment_photos;
  const hasPaymentPhotos =
    Array.isArray(paymentPhotos) && extractPhotoUrls(paymentPhotos).length > 0;

  const billPhotosReq = requirements.find((r: any) => r?.bill_photos)?.bill_photos;
  const hasBillPhotos =
    Array.isArray(billPhotosReq) && extractPhotoUrls(billPhotosReq).length > 0;

  return (hasQrPayment || hasPaymentPhotos) && hasBillPhotos;
}

/** Jobs that may store bill/payment only in after_photos (legacy rows). */
export function jobNeedsAfterPhotosFallback(job: { id?: string; requirements?: unknown }): boolean {
  if (!job?.id) return false;
  return !jobHasPaymentAndBillPhotosInRequirements(job);
}

/**
 * Batch-fetch after_photos only for jobs missing complete payment+bill URLs in requirements.
 * Preserves report / completed-card behavior while avoiding shipping photo JSON on every row.
 */
export async function enrichJobsWithAfterPhotosIfNeeded<T extends { id: string }>(
  jobs: T[]
): Promise<T[]> {
  if (!jobs.length) return jobs;

  const idsNeeding = jobs.filter(jobNeedsAfterPhotosFallback).map((j) => j.id);
  if (idsNeeding.length === 0) return jobs;

  const { data: photoRows, error } = await db.jobs.getPhotoFieldsForJobIds(idsNeeding);
  if (error || !photoRows?.length) return jobs;

  const byId = new Map(
    photoRows.map((row: any) => [
      row.id,
      Array.isArray(row.after_photos) ? row.after_photos : [],
    ])
  );

  return jobs.map((job) => {
    const after = byId.get(job.id);
    if (after === undefined) return job;
    return { ...job, after_photos: after };
  });
}
