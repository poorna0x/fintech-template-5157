import { chromeStorage } from '@/lib/storage';
import { readAddCustomerUniversalResumeCached } from '@/lib/addCustomerUniversalResumeSettings';

const ADD_CUSTOMER_DRAFT_KEY = 'add_customer_draft_v1';
const REMOTE_DEBOUNCE_MS = 800;

export type AddCustomerDraft = {
  savedAt?: number;
  addFormData?: {
    full_name?: string;
    phone?: string;
    alternate_phone?: string;
    email?: string;
    address?: string;
    visible_address?: string;
    notes?: string;
    google_location?: string;
    service_types?: string[];
    equipment?: { [serviceType: string]: { brand?: string; model?: string } };
    photos?: { [serviceType: string]: string[] };
    [key: string]: unknown;
  };
  step5JobData?: Record<string, unknown>;
  currentStep?: number;
  shouldCreateJob?: boolean;
};

type DraftTombstone = { _cleared: true; savedAt: number };
type RemotePayload = AddCustomerDraft | DraftTombstone;

function isTestEnv(): boolean {
  return import.meta.env.MODE === 'test';
}

function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('add_customer_drafts')
  );
}

function isTombstone(payload: unknown): payload is DraftTombstone {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      (payload as DraftTombstone)._cleared === true
  );
}

function asDraft(raw: unknown): AddCustomerDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || isTombstone(raw)) return null;
  return raw as AddCustomerDraft;
}

let remoteUnavailable = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRemote: RemotePayload | null = null;

function cancelRemoteDebounce() {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

async function draftsApi() {
  const { db } = await import('./supabase');
  return db.addCustomerDrafts;
}

function stamp(payload: AddCustomerDraft): AddCustomerDraft {
  return { ...payload, savedAt: Date.now() };
}

function makeTombstone(): DraftTombstone {
  return { _cleared: true, savedAt: Date.now() };
}

function savedAtMs(draft: { savedAt?: number } | null | undefined, fallbackIso?: string): number {
  const n = Number(draft?.savedAt);
  if (Number.isFinite(n) && n > 0) return n;
  if (fallbackIso) {
    const fromIso = Date.parse(fallbackIso);
    if (Number.isFinite(fromIso)) return fromIso;
  }
  return 0;
}

export function loadAddCustomerDraft(): AddCustomerDraft | null {
  try {
    const raw = chromeStorage.getItem(ADD_CUSTOMER_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as AddCustomerDraft) : null;
  } catch {
    return null;
  }
}

function saveAddCustomerDraft(payload: AddCustomerDraft): void {
  try {
    chromeStorage.setItem(ADD_CUSTOMER_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearLocalCache(): void {
  try {
    chromeStorage.removeItem(ADD_CUSTOMER_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAddCustomerDraft(): void {
  clearLocalCache();
  scheduleRemote(makeTombstone(), { immediate: true });
}

/**
 * Persist a draft only when it has resume-worthy data; otherwise remove it
 * so clearing autofill / emptying the form does not leave a stale Resume prompt.
 * Local cache is immediate; the cloud copy is debounced so typing is not a write per keystroke.
 */
export function persistAddCustomerDraft(payload: AddCustomerDraft): void {
  if (draftHasData(payload)) {
    const stamped = stamp(payload);
    saveAddCustomerDraft(stamped);
    scheduleRemote(stamped);
  } else {
    clearLocalCache();
    scheduleRemote(makeTombstone());
  }
}

/** Push the latest local/cloud op now (dialog close, Start new, successful create). */
export async function flushAddCustomerDraft(payload?: AddCustomerDraft): Promise<void> {
  if (payload) {
    if (draftHasData(payload)) {
      const stamped = stamp(payload);
      saveAddCustomerDraft(stamped);
      pendingRemote = stamped;
    } else {
      clearLocalCache();
      pendingRemote = makeTombstone();
    }
  }
  await flushAddCustomerDraftRemote();
}

function cloudDraftSyncEnabled(): boolean {
  if (isTestEnv()) return false;
  return readAddCustomerUniversalResumeCached();
}

function scheduleRemote(next: RemotePayload, options?: { immediate?: boolean }): void {
  pendingRemote = next;
  if (isTestEnv() || !cloudDraftSyncEnabled()) return;
  cancelRemoteDebounce();
  if (options?.immediate) {
    void flushAddCustomerDraftRemote();
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAddCustomerDraftRemote();
  }, REMOTE_DEBOUNCE_MS);
}

async function flushAddCustomerDraftRemote(): Promise<void> {
  if (isTestEnv() || remoteUnavailable || !cloudDraftSyncEnabled()) {
    pendingRemote = null;
    return;
  }
  cancelRemoteDebounce();
  const job = pendingRemote;
  pendingRemote = null;
  if (!job) return;
  try {
    const api = await draftsApi();
    const { error } = await api.upsert(job);
    if (isMissingTableError(error)) {
      remoteUnavailable = true;
    }
  } catch {
    /* offline / not signed in — keep local cache */
  }
}

/**
 * Local cache plus the signed-in admin's cloud row. Newer savedAt wins.
 * A cloud "cleared" marker beats a stale cache on another phone after Start new / create.
 */
export async function loadAddCustomerDraftMerged(): Promise<AddCustomerDraft | null> {
  const local = loadAddCustomerDraft();
  const localHas = draftHasData(local);
  if (isTestEnv() || remoteUnavailable || !cloudDraftSyncEnabled()) {
    return local;
  }

  let remoteRaw: unknown = null;
  let remoteUpdatedAt: string | undefined;
  let remoteFetchOk = false;
  try {
    const api = await draftsApi();
    const { data, error } = await api.load();
    if (isMissingTableError(error)) {
      remoteUnavailable = true;
      return local;
    }
    if (!error) {
      remoteFetchOk = true;
      remoteRaw = data?.payload ?? null;
      remoteUpdatedAt = typeof data?.updated_at === 'string' ? data.updated_at : undefined;
    }
  } catch {
    /* use local */
  }

  if (!remoteFetchOk) return local;

  if (isTombstone(remoteRaw)) {
    const tombTs = savedAtMs(remoteRaw);
    const localTs = savedAtMs(local);
    if (localHas && local && localTs > tombTs) {
      const cached = local.savedAt ? local : stamp(local);
      saveAddCustomerDraft(cached);
      pendingRemote = cached;
      void flushAddCustomerDraftRemote();
      return cached;
    }
    clearLocalCache();
    return null;
  }

  const remote = asDraft(remoteRaw);
  const remoteHas = draftHasData(remote);

  if (!remoteHas) {
    // No cloud row yet — first sync of a phone-only draft.
    if (localHas && local) {
      const cached = local.savedAt ? local : stamp(local);
      saveAddCustomerDraft(cached);
      pendingRemote = cached;
      void flushAddCustomerDraftRemote();
      return cached;
    }
    return local;
  }

  const localTs = savedAtMs(local);
  const remoteTs = savedAtMs(remote, remoteUpdatedAt);
  const winner = localHas && localTs > remoteTs ? local : remote;
  if (!winner) return null;
  const cached = winner.savedAt ? winner : stamp(winner);
  saveAddCustomerDraft(cached);
  if (winner === local && localHas && localTs > remoteTs) {
    pendingRemote = cached;
    void flushAddCustomerDraftRemote();
  }
  return cached;
}

/**
 * Whether a saved draft holds enough typed info to be worth resuming.
 * Default RO-only (no name/phone/address) is not worth a resume prompt.
 */
export function draftHasData(draft: AddCustomerDraft | null | undefined): boolean {
  const f = draft?.addFormData;
  if (!f) return false;
  const text = (v: unknown) => String(v || '').trim();
  if (
    text(f.full_name) ||
    text(f.phone) ||
    text(f.alternate_phone) ||
    text(f.email) ||
    text(f.address) ||
    text(f.visible_address) ||
    text(f.notes) ||
    text(f.google_location)
  ) {
    return true;
  }
  const types = Array.isArray(f.service_types) ? f.service_types.filter(Boolean) : [];
  if (types.length === 0) return false;
  if (types.length === 1 && types[0] === 'RO') {
    const ro = f.equipment?.RO;
    const hasRoGear = Boolean(text(ro?.brand) || text(ro?.model));
    const hasRoPhotos = Array.isArray(f.photos?.RO) && f.photos.RO.length > 0;
    return hasRoGear || hasRoPhotos;
  }
  return true;
}

export { ADD_CUSTOMER_DRAFT_KEY };
