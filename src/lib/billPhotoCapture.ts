/** How a bill photo was added. Only set for new uploads; older photos have no entry. */
export type PhotoCaptureSource = 'camera' | 'gallery';

export function isPhotoCaptureSource(value: unknown): value is PhotoCaptureSource {
  return value === 'camera' || value === 'gallery';
}

export function captureSourceLabel(source?: string | null): string | null {
  if (source === 'camera') return 'Camera';
  if (source === 'gallery') return 'Gallery';
  return null;
}

const urlKey = (url: string) => url.split('?')[0].split('#')[0];

export function lookupCaptureSource(
  map: Record<string, unknown> | null | undefined,
  url: string
): PhotoCaptureSource | null {
  if (!map || !url) return null;
  const direct = map[url];
  if (isPhotoCaptureSource(direct)) return direct;
  const needle = urlKey(url);
  for (const [key, value] of Object.entries(map)) {
    if (urlKey(key) === needle && isPhotoCaptureSource(value)) return value;
  }
  return null;
}

export function pickCaptureSourcesForUrls(
  urls: string[],
  map: Record<string, PhotoCaptureSource>
): Record<string, PhotoCaptureSource> {
  const out: Record<string, PhotoCaptureSource> = {};
  for (const url of urls) {
    const source = lookupCaptureSource(map, url);
    if (source) out[url] = source;
  }
  return out;
}

export function extractBillPhotoSources(requirements: unknown): Record<string, PhotoCaptureSource> {
  const list = Array.isArray(requirements) ? requirements : [];
  const req = list.find((row: any) => row && typeof row === 'object' && row.bill_photos);
  const raw = req?.bill_photo_sources;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PhotoCaptureSource> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isPhotoCaptureSource(value)) out[key] = value;
  }
  return out;
}

export function billPhotosRequirement(
  billPhotos: string[],
  sources: Record<string, PhotoCaptureSource>
): { bill_photos: string[]; bill_photo_sources?: Record<string, PhotoCaptureSource> } {
  const bill_photo_sources = pickCaptureSourcesForUrls(billPhotos, sources);
  if (Object.keys(bill_photo_sources).length === 0) return { bill_photos: billPhotos };
  return { bill_photos: billPhotos, bill_photo_sources };
}
