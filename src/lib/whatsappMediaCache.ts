/**
 * On-device WhatsApp media cache (images / PDFs).
 * Persists blobs in IndexedDB so Admin APK / browser reopen without
 * re-hitting R2 signed-URL + download every time.
 *
 * Keyed by R2 object key (or message id fallback). Soft size + age limits.
 */
const DB_NAME = 'hro_wa_media_v1';
const STORE = 'media';
const DB_VERSION = 1;
/** Soft cap — evict oldest-by-access when over. */
const MAX_TOTAL_BYTES = 96 * 1024 * 1024;
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
/** Single object over this is still cached once, but eviction prioritizes large cold items. */
const WARN_ENTRY_BYTES = 8 * 1024 * 1024;

type MediaRecord = {
  key: string;
  mime: string;
  blob: Blob;
  size: number;
  savedAt: number;
  lastAccess: number;
};

const objectUrlByKey = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB request failed'));
  });
}

/** Stable cache key from media_url (+ optional message id). */
export function whatsappMediaCacheKey(
  mediaUrl: string | null | undefined,
  messageId?: string | null
): string | null {
  const raw = String(mediaUrl || '').trim();
  if (!raw && !messageId) return null;
  if (raw.startsWith('r2:')) return raw.slice(3).replace(/^\/+/, '') || null;
  if (
    raw.startsWith('whatsapp/inbound/') ||
    raw.startsWith('whatsapp/outbound/') ||
    raw.startsWith('whatsapp/accept/')
  ) {
    return raw;
  }
  if (raw.startsWith('whatsapp-media:')) {
    return messageId ? `msg:${messageId}` : raw;
  }
  if (/^https:\/\//i.test(raw)) {
    // Legacy public/CDN URLs — cache by URL (trimmed)
    return `https:${raw.slice(0, 240)}`;
  }
  if (messageId) return `msg:${messageId}`;
  return raw.slice(0, 240) || null;
}

function rememberObjectUrl(key: string, blob: Blob): string {
  const prev = objectUrlByKey.get(key);
  if (prev) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      /* ignore */
    }
  }
  const url = URL.createObjectURL(blob);
  objectUrlByKey.set(key, url);
  return url;
}

export function peekCachedMediaObjectUrl(key: string): string | null {
  return objectUrlByKey.get(key) || null;
}

async function readRecord(key: string): Promise<MediaRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const row = (await idbReq(tx.objectStore(STORE).get(key))) as MediaRecord | undefined;
    if (!row?.blob) return null;
    if (Date.now() - (row.savedAt || 0) > MAX_AGE_MS) {
      void deleteCachedMedia(key);
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

async function writeRecord(rec: MediaRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).put(rec));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IDB write failed'));
  });
}

async function listAllKeys(): Promise<MediaRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const all = (await idbReq(tx.objectStore(STORE).getAll())) as MediaRecord[];
  return Array.isArray(all) ? all : [];
}

async function evictIfNeeded(extraBytes = 0): Promise<void> {
  try {
    const rows = await listAllKeys();
    let total = rows.reduce((s, r) => s + (r.size || 0), 0) + extraBytes;
    if (total <= MAX_TOTAL_BYTES) return;
    const sorted = [...rows].sort(
      (a, b) => (a.lastAccess || a.savedAt || 0) - (b.lastAccess || b.savedAt || 0)
    );
    for (const row of sorted) {
      if (total <= MAX_TOTAL_BYTES * 0.85) break;
      await deleteCachedMedia(row.key);
      total -= row.size || 0;
    }
  } catch {
    /* ignore eviction errors */
  }
}

export async function deleteCachedMedia(key: string): Promise<void> {
  const url = objectUrlByKey.get(key);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    objectUrlByKey.delete(key);
  }
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).delete(key));
  } catch {
    /* ignore */
  }
}

/** Return blob URL from disk cache, or null. Touches lastAccess. */
export async function getCachedMediaObjectUrl(key: string): Promise<string | null> {
  const existing = objectUrlByKey.get(key);
  if (existing) {
    void touchAccess(key);
    return existing;
  }
  const row = await readRecord(key);
  if (!row?.blob) return null;
  void touchAccess(key);
  return rememberObjectUrl(key, row.blob);
}

/** Return cached bytes (copy) for PDF.js etc. */
export async function getCachedMediaBytes(
  key: string
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const row = await readRecord(key);
  if (!row?.blob) return null;
  void touchAccess(key);
  const buf = await row.blob.arrayBuffer();
  return { bytes: buf.slice(0), mime: row.mime || row.blob.type || 'application/octet-stream' };
}

async function touchAccess(key: string): Promise<void> {
  try {
    const row = await readRecord(key);
    if (!row) return;
    row.lastAccess = Date.now();
    await writeRecord(row);
  } catch {
    /* ignore */
  }
}

/** Persist blob and return a reusable object URL for this session. */
export async function putCachedMediaBlob(
  key: string,
  blob: Blob,
  mime?: string
): Promise<string> {
  const type = (mime || blob.type || 'application/octet-stream').trim();
  const size = blob.size || 0;
  const now = Date.now();
  if (size > 0) {
    await evictIfNeeded(size);
    try {
      await writeRecord({
        key,
        mime: type,
        blob,
        size,
        savedAt: now,
        lastAccess: now,
      });
    } catch (err) {
      // Quota — try eviction once more
      console.warn('[wa-media-cache] write failed', err);
      await evictIfNeeded(size + WARN_ENTRY_BYTES);
      try {
        await writeRecord({
          key,
          mime: type,
          blob,
          size,
          savedAt: now,
          lastAccess: now,
        });
      } catch {
        /* still fail — return ephemeral object URL only */
      }
    }
  }
  return rememberObjectUrl(key, blob);
}
