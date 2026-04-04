// QR Code Management Utility
// Handles common QR codes and localStorage caching for mobile / offline PWA

export interface CommonQrCode {
  id: string;
  name: string;
  qrCodeUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Technician row as used in payment QR picker (3-dots flow). */
export interface TechnicianQrPickerRow {
  id: string;
  fullName: string;
  qrCode: string;
  visibleQrCodes: string[];
}

export interface TechnicianForReportRef {
  id: string;
  fullName: string;
  full_name: string;
}

/**
 * Full technician QR UI snapshot (common QRs + visibility + assigned common QRs).
 * Persists across sessions for offline and to avoid redundant API calls.
 */
export interface TechnicianQrSnapshotV1 {
  savedAt: number;
  allCommonQrCodes: CommonQrCode[];
  commonQrCodes: CommonQrCode[];
  allTechnicians: TechnicianQrPickerRow[];
  technicians: TechnicianQrPickerRow[];
  commonQrCodesForTechnician: CommonQrCode[];
  technicianVisibleQrCodes: string[];
  allTechniciansForReports: TechnicianForReportRef[];
}

const QR_CODES_STORAGE_KEY = 'hydrogenro_common_qr_codes';
/** Legacy: keep long enough for offline; voluntary refresh uses min-interval instead. */
const QR_CODES_CACHE_EXPIRY = 90 * 24 * 60 * 60 * 1000; // 90 days

const TECH_QR_SNAPSHOT_KEY = (technicianId: string) =>
  `hydrogenro_tech_qr_snapshot_v1_${technicianId}`;

/** Data URLs for assigned Common QR images (offline mobile). */
const TECH_QR_ASSIGNED_IMG_CACHE_KEY = (technicianId: string) =>
  `hydrogenro_tech_common_qr_img_v1_${technicianId}`;

const MAX_QR_IMAGE_BYTES = 2 * 1024 * 1024; // skip unusually large responses

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onloadend = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

/** Cached data URLs keyed by technician_common_qr id (current assignments only). */
export function getTechnicianCommonQrImageCache(technicianId: string): Record<string, string> {
  if (typeof window === 'undefined' || !technicianId) return {};
  try {
    const raw = localStorage.getItem(TECH_QR_ASSIGNED_IMG_CACHE_KEY(technicianId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: number; urls?: Record<string, string> };
    if (parsed?.v === 1 && parsed.urls && typeof parsed.urls === 'object') return parsed.urls;
    return {};
  } catch {
    return {};
  }
}

function saveTechnicianCommonQrImageCache(technicianId: string, urls: Record<string, string>): void {
  if (typeof window === 'undefined' || !technicianId) return;
  const payload = JSON.stringify({ v: 1, savedAt: Date.now(), urls });
  try {
    localStorage.setItem(TECH_QR_ASSIGNED_IMG_CACHE_KEY(technicianId), payload);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      try {
        const ids = Object.keys(urls);
        const trimmed: Record<string, string> = {};
        for (const id of ids.slice(-2)) trimmed[id] = urls[id];
        localStorage.setItem(
          TECH_QR_ASSIGNED_IMG_CACHE_KEY(technicianId),
          JSON.stringify({ v: 1, savedAt: Date.now(), urls: trimmed })
        );
      } catch {
        /* ignore */
      }
    }
  }
}

export function clearTechnicianCommonQrImageCache(technicianId: string): void {
  if (typeof window === 'undefined' || !technicianId) return;
  try {
    localStorage.removeItem(TECH_QR_ASSIGNED_IMG_CACHE_KEY(technicianId));
  } catch {
    /* ignore */
  }
}

/**
 * While online, download assigned Common QR images and store as data URLs for offline use.
 * Replaces cache entries to match the current assignment list only.
 */
export async function prefetchTechnicianCommonQrImages(
  technicianId: string,
  items: { id: string; qrCodeUrl: string }[]
): Promise<Record<string, string>> {
  if (typeof window === 'undefined' || !technicianId) {
    return {};
  }
  if (!items.length) {
    saveTechnicianCommonQrImageCache(technicianId, {});
    return {};
  }

  const prev = getTechnicianCommonQrImageCache(technicianId);
  const next: Record<string, string> = {};

  for (const it of items) {
    const url = (it.qrCodeUrl || '').trim();
    if (!url.startsWith('http')) {
      if (prev[it.id]) next[it.id] = prev[it.id];
      continue;
    }
    let fetched: string | null = null;
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (blob.size === 0 || blob.size > MAX_QR_IMAGE_BYTES) throw new Error('size');
      fetched = await blobToDataUrl(blob);
    } catch {
      fetched = null;
    }
    if (fetched) next[it.id] = fetched;
    else if (prev[it.id]) next[it.id] = prev[it.id];
  }

  saveTechnicianCommonQrImageCache(technicianId, next);
  return next;
}

export function commonQrDisplaySrc(
  qrId: string,
  remoteUrl: string,
  imageCache: Record<string, string>
): string {
  const local = imageCache[qrId];
  return local && local.startsWith('data:') ? local : remoteUrl;
}

/** Skip background network refresh if snapshot is newer than this (unless `force`). */
export const QR_NETWORK_MIN_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes

/** Drop snapshot only if absurdly old (corrupt / migration). */
const SNAPSHOT_HARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// Get QR codes from localStorage cache
export const getCachedQrCodes = (): CommonQrCode[] | null => {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(QR_CODES_STORAGE_KEY);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();

    if (now - timestamp > QR_CODES_CACHE_EXPIRY) {
      localStorage.removeItem(QR_CODES_STORAGE_KEY);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error reading cached QR codes:', error);
    return null;
  }
};

// Save QR codes to localStorage cache
export const cacheQrCodes = (qrCodes: CommonQrCode[]): void => {
  if (typeof window === 'undefined') return;

  try {
    const cacheData = {
      data: qrCodes,
      timestamp: Date.now(),
    };
    localStorage.setItem(QR_CODES_STORAGE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error caching QR codes:', error);
  }
};

// Check if we should use cache (mobile devices)
export const shouldUseCache = (): boolean => {
  if (typeof window === 'undefined') return false;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isMobile;
};

export const getTechnicianQrSnapshot = (technicianId: string): TechnicianQrSnapshotV1 | null => {
  if (typeof window === 'undefined' || !technicianId) return null;
  try {
    const raw = localStorage.getItem(TECH_QR_SNAPSHOT_KEY(technicianId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TechnicianQrSnapshotV1;
    if (!parsed || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.allCommonQrCodes)) {
      return null;
    }
    if (Date.now() - parsed.savedAt > SNAPSHOT_HARD_EXPIRY_MS) {
      localStorage.removeItem(TECH_QR_SNAPSHOT_KEY(technicianId));
      return null;
    }
    return parsed;
  } catch (e) {
    console.error('Error reading technician QR snapshot:', e);
    return null;
  }
};

export const saveTechnicianQrSnapshot = (
  technicianId: string,
  snapshot: Omit<TechnicianQrSnapshotV1, 'savedAt'> & { savedAt?: number }
): void => {
  if (typeof window === 'undefined' || !technicianId) return;
  try {
    const full: TechnicianQrSnapshotV1 = {
      ...snapshot,
      savedAt: snapshot.savedAt ?? Date.now(),
    };
    localStorage.setItem(TECH_QR_SNAPSHOT_KEY(technicianId), JSON.stringify(full));
  } catch (e) {
    console.error('Error saving technician QR snapshot:', e);
  }
};

/**
 * Normalize `technicians.common_qr_code_ids` (jsonb) from PostgREST.
 * Handles: real array, JSON string, legacy `common_qr_code_id` single uuid.
 * Mismatched shapes were causing only one assigned Common QR to match.
 */
export function normalizeTechnicianAssignedCommonQrIds(row: {
  common_qr_code_ids?: unknown;
  common_qr_code_id?: string | null;
}): string[] {
  const legacy = row?.common_qr_code_id;
  const raw = row?.common_qr_code_ids;

  const fromLegacy = (): string[] =>
    legacy != null && String(legacy).trim() !== '' ? [String(legacy).trim()] : [];

  if (raw == null || raw === '') {
    return fromLegacy();
  }
  if (Array.isArray(raw)) {
    const out = raw.map((x) => String(x).trim()).filter(Boolean);
    return out.length > 0 ? out : fromLegacy();
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return fromLegacy();
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          const out = parsed.map((x: unknown) => String(x).trim()).filter(Boolean);
          return out.length > 0 ? out : fromLegacy();
        }
      } catch {
        /* single uuid or invalid */
      }
    }
    return [s];
  }
  if (typeof raw === 'object' && raw !== null) {
    const vals = Object.values(raw as Record<string, unknown>)
      .map((x) => String(x).trim())
      .filter(Boolean);
    return vals.length > 0 ? vals : fromLegacy();
  }
  return fromLegacy();
}

export const clearTechnicianQrSnapshot = (technicianId: string): void => {
  if (typeof window === 'undefined' || !technicianId) return;
  try {
    localStorage.removeItem(TECH_QR_SNAPSHOT_KEY(technicianId));
    clearTechnicianCommonQrImageCache(technicianId);
  } catch (e) {
    console.error('Error clearing technician QR snapshot:', e);
  }
};

// Get technician QR code from localStorage cache
export const getCachedTechnicianQrCode = (technicianId: string): string | null => {
  if (typeof window === 'undefined') return null;

  try {
    const key = `hydrogenro_tech_qr_${technicianId}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();

    if (now - timestamp > QR_CODES_CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error reading cached technician QR code:', error);
    return null;
  }
};

// Cache technician QR code
export const cacheTechnicianQrCode = (technicianId: string, qrCodeUrl: string): void => {
  if (typeof window === 'undefined') return;

  try {
    const key = `hydrogenro_tech_qr_${technicianId}`;
    const cacheData = {
      data: qrCodeUrl,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error caching technician QR code:', error);
  }
};

// Invalidate QR codes cache (call this when QR codes are updated)
export const invalidateQrCodesCache = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(QR_CODES_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('qrCodesUpdated'));
  } catch (error) {
    console.error('Error invalidating QR codes cache:', error);
  }
};
