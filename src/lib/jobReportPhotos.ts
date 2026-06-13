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
export function jobNeedsAfterPhotosFallback(job: {
  id?: string;
  requirements?: unknown;
  after_photos?: unknown;
  afterPhotos?: unknown;
}): boolean {
  if (!job?.id) return false;
  if (jobHasPaymentAndBillPhotosInRequirements(job)) return false;
  const after = (job as { after_photos?: unknown; afterPhotos?: unknown }).after_photos
    ?? (job as { afterPhotos?: unknown }).afterPhotos;
  if (Array.isArray(after) && extractPhotoUrls(after).length > 0) return false;
  return true;
}

const normalizeUrlForCompare = (url: string) =>
  url.split('?')[0].split('#')[0].trim().toLowerCase();

export type JobBillPaymentPhotoResult = {
  billPhotos: string[];
  paymentScreenshot: string | null;
  allPhotos: string[];
};

/**
 * Resolve bill + payment photo URLs from requirements and/or after_photos (same rules as admin report UI).
 */
export function resolveJobBillAndPaymentPhotos(job: {
  requirements?: unknown;
  after_photos?: unknown;
  afterPhotos?: unknown;
  payment_method?: string | null;
  paymentMethod?: string | null;
}): JobBillPaymentPhotoResult {
  const requirements = parseJobRequirements(job.requirements);
  const qrPhotos = requirements.find((r: any) => r?.qr_photos)?.qr_photos;

  let paymentScreenshot: string | null = normalizePhotoUrl(qrPhotos?.payment_screenshot) || null;

  if (!paymentScreenshot) {
    const paymentPhotosReq = requirements.find((r: any) => r?.payment_photos);
    const paymentPhotos = paymentPhotosReq?.payment_photos;
    if (Array.isArray(paymentPhotos) && paymentPhotos.length > 0) {
      paymentScreenshot = normalizePhotoUrl(paymentPhotos[0]);
    }
  }

  const afterPhotosRaw = (job as { after_photos?: unknown; afterPhotos?: unknown }).after_photos
    ?? (job as { afterPhotos?: unknown }).afterPhotos;
  const afterPhotosExtracted = extractPhotoUrls(
    Array.isArray(afterPhotosRaw) ? afterPhotosRaw : []
  );

  const billPhotosFromRequirements = extractPhotoUrls(
    requirements.find((r: any) => r?.bill_photos)?.bill_photos || []
  );

  let billPhotos: string[] = [];

  if (afterPhotosExtracted.length > 0) {
    if (paymentScreenshot) {
      const paymentNorm = normalizeUrlForCompare(paymentScreenshot);
      billPhotos = afterPhotosExtracted.filter(
        (url) => normalizeUrlForCompare(url) !== paymentNorm
      );
    } else if (afterPhotosExtracted.length > billPhotosFromRequirements.length) {
      const potentialPaymentScreenshots = afterPhotosExtracted.filter((url) => {
        const normalizedUrl = normalizeUrlForCompare(url);
        return !billPhotosFromRequirements.some(
          (billUrl) => normalizeUrlForCompare(billUrl) === normalizedUrl
        );
      });
      if (potentialPaymentScreenshots.length > 0) {
        paymentScreenshot = potentialPaymentScreenshots[0];
        billPhotos = afterPhotosExtracted.filter((url) => {
          const normalizedUrl = normalizeUrlForCompare(url);
          return !potentialPaymentScreenshots.some(
            (ps) => normalizeUrlForCompare(ps) === normalizedUrl
          );
        });
      } else {
        billPhotos = afterPhotosExtracted;
      }
    } else {
      billPhotos = afterPhotosExtracted;
    }
  } else {
    billPhotos = billPhotosFromRequirements;
  }

  // Legacy rows: photos only in after_photos when requirements has none
  if (!paymentScreenshot && billPhotos.length === 0 && afterPhotosExtracted.length > 0) {
    billPhotos = afterPhotosExtracted;
  }

  if (
    paymentScreenshot &&
    !paymentScreenshot.startsWith('http://') &&
    !paymentScreenshot.startsWith('https://')
  ) {
    paymentScreenshot = null;
  }

  const allPhotos: string[] = [];
  if (paymentScreenshot) allPhotos.push(paymentScreenshot);
  for (const url of billPhotos) {
    if (!allPhotos.some((u) => normalizeUrlForCompare(u) === normalizeUrlForCompare(url))) {
      allPhotos.push(url);
    }
  }
  if (allPhotos.length === 0 && billPhotos.length > 0) {
    return { billPhotos, paymentScreenshot, allPhotos: billPhotos };
  }

  return { billPhotos, paymentScreenshot, allPhotos };
}

/** Resolve DB UUID for job/customer queries (admin uses customer.id; embed may only have C123). */
export async function resolveCustomerUuidForQueries(
  customer:
    | {
        id?: string | null;
        customer_id?: string | null;
        customerId?: string | null;
        customer_uuid?: string | null;
      }
    | string
    | null
    | undefined
): Promise<string | null> {
  if (!customer) return null;

  if (typeof customer === 'string') {
    const s = customer.trim();
    if (!s) return null;
    if (s.startsWith('C') && s.length < 36) {
      const { data: cust, error } = await db.customers.getByCustomerId(s);
      if (!error && cust?.id) return cust.id;
      return null;
    }
    return s;
  }

  const humanId = customer.customer_id ?? customer.customerId ?? null;
  const humanStr = humanId != null ? String(humanId).trim() : '';
  let customerUuid =
    customer.id ??
    customer.customer_uuid ??
    (customer as { customerUuid?: string }).customerUuid ??
    null;
  const uuidStr = customerUuid != null ? String(customerUuid).trim() : '';

  const uuidLooksValid = uuidStr.includes('-') && uuidStr.length >= 32;
  const humanIsCode = humanStr.startsWith('C');

  if (uuidLooksValid && (!humanIsCode || uuidStr !== humanStr)) {
    return uuidStr;
  }

  if (humanIsCode) {
    const { data: cust, error } = await db.customers.getByCustomerId(humanStr);
    if (!error && cust?.id) return cust.id;
  }

  if (uuidStr) return uuidStr;
  return null;
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

  // Only after_photos is read below, so fetch just that column (smaller egress than
  // pulling before_photos + images too).
  const { data: photoRows, error } = await db.jobs.getAfterPhotosForJobIds(idsNeeding);
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
