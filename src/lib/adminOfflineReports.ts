/**
 * Admin phone copy of customer search + completed-job reports.
 * Text only. Photo URLs are stripped so the copy stays a few megabytes.
 * Search uses an in-memory index of that copy.
 */
import { supabase } from '@/lib/supabaseClient';
import { normalizePhoneForSearch } from '@/lib/utils';

const DB_NAME = 'hro-admin-offline-reports';
const DB_VERSION = 1;

const CUSTOMER_COLS = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'visible_address',
  'address',
  'service_type',
  'brand',
  'model',
  'last_service_date',
  'raw_water_tds',
  'installation_date',
  'warranty_expiry',
  'gst_number',
  'notes',
  'updated_at',
].join(', ');

const JOB_COLS = [
  'id',
  'job_number',
  'customer_id',
  'status',
  'service_type',
  'service_sub_type',
  'service_brand',
  'brand',
  'model',
  'scheduled_date',
  'created_at',
  'updated_at',
  'completed_at',
  'end_time',
  'completed_by',
  'payment_amount',
  'actual_cost',
  'estimated_cost',
  'payment_method',
  'parts_cost_total',
  'completion_notes',
  'description',
  'requirements',
  'raw_water_tds',
].join(', ');

type Meta = {
  customerAfterId: string;
  jobAfterId: string;
  customersDone: boolean;
  jobsDone: boolean;
  syncedAt: string;
  customerSyncedAt: string;
  jobSyncedAt: string;
  lastDeltaAt: string;
};

const EMPTY_META: Meta = {
  customerAfterId: '',
  jobAfterId: '',
  customersDone: false,
  jobsDone: false,
  syncedAt: '',
  customerSyncedAt: '',
  jobSyncedAt: '',
  lastDeltaAt: '',
};

/** Caught-up phones wait this long before asking the server what changed. */
const DELTA_COOLDOWN_MS = 30 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;
let searchIndex: Array<{ row: Record<string, unknown>; hay: string }> | null = null;
let syncing = false;
let techNamesCache: Map<string, string> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('jobs')) {
        const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
        jobs.createIndex('customer_id', 'customer_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
      if (!db.objectStoreNames.contains('technicians')) {
        db.createObjectStore('technicians', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function haystack(row: Record<string, unknown>): string {
  const phone = normalizePhoneForSearch(String(row.phone || ''));
  const alt = normalizePhoneForSearch(String(row.alternate_phone || ''));
  return [row.full_name, row.customer_id, row.phone, row.alternate_phone, phone, alt, row.visible_address]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
}

function stripPhotoFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPhotoFields);
  if (!value || typeof value !== 'object') return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(src)) {
    if (/photo|image|screenshot|qr_photos|bill_photos|payment_photos/i.test(key)) continue;
    if (typeof child === 'string' && /^https?:\/\//i.test(child) && /cloudinary|r2\.dev|supabase\.co\/storage/i.test(child)) {
      continue;
    }
    out[key] = stripPhotoFields(child);
  }
  return out;
}

function parseRequirements(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function slimJob(row: Record<string, unknown>, techNames: Map<string, string>): Record<string, unknown> {
  const completedBy = String(row.completed_by || '');
  const name = techNames.get(completedBy);
  return {
    ...row,
    requirements: stripPhotoFields(parseRequirements(row.requirements)),
    before_photos: [],
    after_photos: [],
    images: [],
    ...(name ? { completed_by_name: name } : {}),
  };
}

async function readMeta(): Promise<Meta> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get('sync');
    req.onsuccess = () => resolve({ ...EMPTY_META, ...(req.result || {}) });
    req.onerror = () => resolve({ ...EMPTY_META });
  });
}

async function writeMeta(meta: Meta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(meta, 'sync');
  await txDone(tx);
}

async function putAll(store: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const obj = tx.objectStore(store);
  for (const row of rows) {
    if (row?.id) obj.put(row);
  }
  await txDone(tx);
  if (store === 'customers') searchIndex = null;
}

export async function saveOfflineCustomers(rows: Record<string, unknown>[]): Promise<void> {
  const slim = rows
    .filter((row) => row?.id)
    .map((row) => {
      const copy = { ...row };
      delete copy.photos;
      delete copy.location;
      delete copy.alternate_location;
      return copy;
    });
  if (!slim.length) return;
  const db = await openDb();
  const tx = db.transaction('customers', 'readwrite');
  const store = tx.objectStore('customers');
  await Promise.all(
    slim.map(
      (row) =>
        new Promise<void>((resolve, reject) => {
          const req = store.get(row.id as IDBValidKey);
          req.onsuccess = () => {
            const prev = { ...((req.result || {}) as Record<string, unknown>) };
            delete prev.photos;
            delete prev.location;
            delete prev.alternate_location;
            const merged: Record<string, unknown> = { ...prev, id: row.id };
            for (const [key, value] of Object.entries(row)) {
              if (value !== undefined && value !== null && value !== '') merged[key] = value;
            }
            store.put(merged);
            resolve();
          };
          req.onerror = () => reject(req.error);
        })
    )
  );
  await txDone(tx);
  searchIndex = null;
}

export async function saveOfflineReportJobs(rows: Record<string, unknown>[]): Promise<void> {
  const techNames = await readTechNames();
  await putAll(
    'jobs',
    rows.filter((row) => row?.id).map((row) => slimJob(row, techNames))
  );
}

async function readTechNames(): Promise<Map<string, string>> {
  const db = await openDb();
  const rows = await new Promise<Array<{ id: string; full_name?: string }>>((resolve) => {
    const tx = db.transaction('technicians', 'readonly');
    const req = tx.objectStore('technicians').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  return new Map(rows.map((row) => [row.id, String(row.full_name || '').trim()]));
}

async function loadSearchIndex(): Promise<Array<{ row: Record<string, unknown>; hay: string }>> {
  if (searchIndex) return searchIndex;
  const db = await openDb();
  const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
    const tx = db.transaction('customers', 'readonly');
    const req = tx.objectStore('customers').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  searchIndex = rows.map((row) => ({ row, hay: haystack(row) }));
  return searchIndex;
}

export async function searchOfflineCustomers(
  query: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const phone = normalizePhoneForSearch(query);
  const index = await loadSearchIndex();
  const hits: Record<string, unknown>[] = [];
  for (const item of index) {
    const phoneHit = phone.length >= 7 && item.hay.includes(phone);
    if (phoneHit || item.hay.includes(q)) {
      hits.push(item.row);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export async function readOfflineReportJobs(customerId: string): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction('jobs', 'readonly');
    const req = tx.objectStore('jobs').index('customer_id').getAll(customerId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function pageById(
  table: 'customers' | 'jobs',
  cols: string,
  afterId: string
): Promise<{ rows: Record<string, unknown>[]; afterId: string; more: boolean }> {
  const pageSize = table === 'jobs' ? 80 : 200;
  let query = supabase.from(table).select(cols).order('id', { ascending: true }).limit(pageSize);
  if (table === 'jobs') query = query.eq('status', 'COMPLETED');
  if (afterId) query = query.gt('id', afterId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as Record<string, unknown>[];
  const last = rows[rows.length - 1];
  return {
    rows,
    afterId: last ? String(last.id || afterId) : afterId,
    more: rows.length >= pageSize,
  };
}

async function pageChangedSince(
  table: 'customers' | 'jobs',
  cols: string,
  since: string
): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from(table)
    .select(cols)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(table === 'jobs' ? 80 : 200);
  if (table === 'jobs') query = query.eq('status', 'COMPLETED');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

async function ensureTechNames(refresh: boolean): Promise<Map<string, string>> {
  if (!refresh && techNamesCache?.size) return techNamesCache;
  if (!refresh) {
    const existing = await readTechNames();
    if (existing.size) {
      techNamesCache = existing;
      return existing;
    }
  }
  const { data: techs } = await supabase.from('technicians').select('id, full_name').limit(300);
  if (techs?.length) {
    await putAll(
      'technicians',
      techs.map((row) => ({ id: row.id, full_name: row.full_name }))
    );
  }
  techNamesCache = await readTechNames();
  return techNamesCache;
}

function deltaIsFresh(meta: Meta): boolean {
  if (!meta.customersDone || !meta.jobsDone || !meta.lastDeltaAt) return false;
  const age = Date.now() - Date.parse(meta.lastDeltaAt);
  return age >= 0 && age < DELTA_COOLDOWN_MS;
}

function advanceCursor(rows: Record<string, unknown>[], full: boolean, previous: string): { cursor: string; more: boolean } {
  if (!full) return { cursor: new Date().toISOString(), more: false };
  const stamp = String(rows[rows.length - 1]?.updated_at || '');
  if (!stamp || stamp === previous) return { cursor: previous, more: false };
  return { cursor: stamp, more: true };
}

async function syncOneRound(refreshTechs: boolean): Promise<boolean> {
  const meta = await readMeta();
  if (deltaIsFresh(meta)) return false;
  const techNames = await ensureTechNames(refreshTechs);
  const next = { ...meta };

  if (!meta.customersDone || !meta.jobsDone) {
    if (!next.syncedAt) next.syncedAt = new Date().toISOString();
    if (!meta.customersDone) {
      const customers = await pageById('customers', CUSTOMER_COLS, meta.customerAfterId);
      if (customers.rows.length) await saveOfflineCustomers(customers.rows);
      next.customerAfterId = customers.afterId;
      next.customersDone = !customers.more;
      await writeMeta(next);
    }
    if (!next.jobsDone) {
      const jobs = await pageById('jobs', JOB_COLS, next.jobAfterId);
      if (jobs.rows.length) {
        await putAll(
          'jobs',
          jobs.rows.map((row) => slimJob(row, techNames))
        );
      }
      next.jobAfterId = jobs.afterId;
      next.jobsDone = !jobs.more;
      await writeMeta(next);
    }
    if (next.customersDone && next.jobsDone) {
      const now = new Date().toISOString();
      next.customerSyncedAt = next.customerSyncedAt || next.syncedAt || now;
      next.jobSyncedAt = next.jobSyncedAt || next.syncedAt || now;
      next.syncedAt = next.customerSyncedAt;
      next.lastDeltaAt = now;
      await writeMeta(next);
    }
    return !(next.customersDone && next.jobsDone);
  }

  const customerSince = meta.customerSyncedAt || meta.syncedAt;
  const jobSince = meta.jobSyncedAt || meta.syncedAt;
  const [customers, jobs] = await Promise.all([
    pageChangedSince('customers', CUSTOMER_COLS, customerSince),
    pageChangedSince('jobs', JOB_COLS, jobSince),
  ]);
  if (customers.length) await saveOfflineCustomers(customers);
  if (jobs.length) {
    await putAll(
      'jobs',
      jobs.map((row) => slimJob(row, techNames))
    );
  }
  const customerCursor = advanceCursor(customers, customers.length >= 200, customerSince);
  const jobCursor = advanceCursor(jobs, jobs.length >= 80, jobSince);
  next.customerSyncedAt = customerCursor.cursor;
  next.jobSyncedAt = jobCursor.cursor;
  next.syncedAt = next.customerSyncedAt;
  if (!customerCursor.more && !jobCursor.more) next.lastDeltaAt = new Date().toISOString();
  await writeMeta(next);
  return customerCursor.more || jobCursor.more;
}

/** Pull report text in the background. Resumes from the last saved row. */
export function startAdminOfflineReportSync(): void {
  if (syncing || typeof indexedDB === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  syncing = true;
  void (async () => {
    let resume = false;
    try {
      const meta = await readMeta();
      if (deltaIsFresh(meta)) return;
      let more = true;
      let rounds = 0;
      let refreshTechs = meta.customersDone && meta.jobsDone;
      while (more && rounds < 25 && navigator.onLine !== false) {
        more = await syncOneRound(refreshTechs);
        refreshTechs = false;
        rounds += 1;
        await new Promise((r) => setTimeout(r, 250));
      }
      resume = more;
    } catch (err) {
      console.warn('[admin-offline] sync failed', err);
    } finally {
      syncing = false;
    }
    if (resume) window.setTimeout(() => startAdminOfflineReportSync(), 20_000);
  })();
}
