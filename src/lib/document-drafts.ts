/**
 * Lightweight client-side draft storage for the generator pages
 * (Quotation, Tax Invoice, Bill, AMC).
 *
 * Why a generic util instead of a per-generator hook:
 *   - Each generator has 20–30 individual `useState` hooks, so reaching into
 *     them for serialization is impractical. Instead, each generator passes
 *     us a `snapshot` object (plain JSON), and we round-trip it as-is.
 *   - One namespace per `kind` keeps drafts cleanly isolated and prevents
 *     accidental cross-loading (e.g. a Quotation draft into the Tax Invoice
 *     screen).
 *   - localStorage is bounded; we cap each kind to 30 drafts and drop the
 *     oldest entry when adding a 31st.
 *
 * Drafts are stored as two records in localStorage:
 *   - `crm_doc_drafts_index_v1::<kind>`  — small array of metadata (id, label, updatedAt)
 *   - `crm_doc_draft_v1::<kind>::<id>`   — full snapshot JSON
 */

export type DraftKind = 'quotation' | 'tax_invoice' | 'bill' | 'amc' | 'letterhead';

export interface DraftIndexEntry {
  id: string;
  /** Human-readable label shown in the dropdown (e.g. "Q-2026-0001 — Acme Pvt Ltd"). */
  label: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

const INDEX_PREFIX = 'crm_doc_drafts_index_v1::';
const DRAFT_PREFIX = 'crm_doc_draft_v1::';
const MAX_DRAFTS_PER_KIND = 30;
/** Drafts older than this are removed automatically when listing. */
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function indexKey(kind: DraftKind): string {
  return `${INDEX_PREFIX}${kind}`;
}

function draftKey(kind: DraftKind, id: string): string {
  return `${DRAFT_PREFIX}${kind}::${id}`;
}

/** True when window.localStorage is callable. SSR/safari-private return false. */
function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const probeKey = `${INDEX_PREFIX}__probe__`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function isValidIndexEntry(e: unknown): e is DraftIndexEntry {
  return (
    !!e &&
    typeof e === 'object' &&
    typeof (e as DraftIndexEntry).id === 'string' &&
    typeof (e as DraftIndexEntry).label === 'string' &&
    typeof (e as DraftIndexEntry).updatedAt === 'string'
  );
}

/** Drop index entries whose payload is missing (manual storage edits, partial writes). */
function pruneOrphanIndexEntries(kind: DraftKind, entries: DraftIndexEntry[]): DraftIndexEntry[] {
  if (!isStorageAvailable()) return entries;
  const kept: DraftIndexEntry[] = [];
  for (const entry of entries) {
    try {
      if (window.localStorage.getItem(draftKey(kind, entry.id))) {
        kept.push(entry);
      }
    } catch {
      kept.push(entry);
    }
  }
  if (kept.length !== entries.length) writeIndex(kind, kept);
  return kept;
}

function pruneExpiredDrafts(kind: DraftKind, entries: DraftIndexEntry[]): DraftIndexEntry[] {
  if (!isStorageAvailable()) return entries;
  const now = Date.now();
  const kept: DraftIndexEntry[] = [];
  for (const entry of entries) {
    const age = now - new Date(entry.updatedAt).getTime();
    if (Number.isNaN(age) || age > DRAFT_MAX_AGE_MS) {
      try {
        window.localStorage.removeItem(draftKey(kind, entry.id));
      } catch {
        /* ignore */
      }
      continue;
    }
    kept.push(entry);
  }
  if (kept.length !== entries.length) writeIndex(kind, kept);
  return kept;
}

export function listDrafts(kind: DraftKind): DraftIndexEntry[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(indexKey(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isValidIndexEntry);
    const fresh = pruneExpiredDrafts(kind, valid);
    const linked = pruneOrphanIndexEntries(kind, fresh);
    return linked.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

function writeIndex(kind: DraftKind, list: DraftIndexEntry[]): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(indexKey(kind), JSON.stringify(list));
  } catch {
    /* quota or disabled — ignore */
  }
}

export function loadDraft<T = unknown>(kind: DraftKind, id: string): T | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(draftKey(kind, id));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Persist a draft. `id` is optional — pass it to overwrite the same draft on
 * repeated saves, omit it to create a new one. Returns the id used.
 */
export function saveDraft<T extends object>(
  kind: DraftKind,
  snapshot: T,
  options?: { id?: string; label?: string }
): string | null {
  if (!isStorageAvailable()) return null;
  const id = options?.id || makeId(kind);
  const label = (options?.label || 'Untitled').slice(0, 120);
  const updatedAt = new Date().toISOString();

  const persistBody = (): boolean => {
    try {
      window.localStorage.setItem(draftKey(kind, id), JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  };

  if (!persistBody()) {
    // Storage full: drop oldest draft for this kind and retry once.
    const existing = listDrafts(kind);
    if (existing.length > 0) {
      deleteDraft(kind, existing[existing.length - 1].id);
    }
    if (!persistBody()) return null;
  }

  const next: DraftIndexEntry[] = [
    { id, label, updatedAt },
    ...listDrafts(kind).filter((d) => d.id !== id),
  ].slice(0, MAX_DRAFTS_PER_KIND);

  writeIndex(kind, next);
  return id;
}

export function deleteDraft(kind: DraftKind, id: string): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(draftKey(kind, id));
  } catch {
    /* ignore */
  }
  writeIndex(
    kind,
    listDrafts(kind).filter((d) => d.id !== id)
  );
}

export function clearAllDrafts(kind: DraftKind): void {
  if (!isStorageAvailable()) return;
  const all = listDrafts(kind);
  for (const d of all) {
    try {
      window.localStorage.removeItem(draftKey(kind, d.id));
    } catch {
      /* ignore */
    }
  }
  try {
    window.localStorage.removeItem(indexKey(kind));
  } catch {
    /* ignore */
  }
}

function makeId(kind: DraftKind): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}_${Date.now().toString(36)}_${rand}`;
}

/** Deep-merge editable customer fields saved in a draft snapshot. */
export function mergeEditableCustomer<
  T extends { address?: Record<string, string | undefined> },
>(prev: T, patch: Partial<T> | undefined): T {
  if (!patch || typeof patch !== 'object') return prev;
  return {
    ...prev,
    ...patch,
    ...(patch.address
      ? { address: { ...prev.address, ...patch.address } }
      : {}),
  };
}

/** Format the updatedAt timestamp for inline display in the dropdown. */
export function formatDraftTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}
