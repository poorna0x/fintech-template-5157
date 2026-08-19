/**
 * Server-side draft storage for the generator pages
 * (Quotation, Tax Invoice, Bill, AMC, Letterhead).
 *
 * Drafts live in the `document_drafts` Supabase table (one row per draft) so a
 * saved draft follows the admin across devices/browsers instead of being trapped
 * in a single device's localStorage.
 *
 * Design:
 *   - Each generator passes a plain-JSON `snapshot`, stored as-is in a `jsonb`
 *     column and round-tripped back on load.
 *   - `kind` namespaces drafts so a Quotation draft never loads into the Tax
 *     Invoice screen.
 *   - All functions are async (network round-trip). They resolve to safe empty
 *     values on error so the UI never throws.
 */

import { db } from '@/lib/supabase';

export type DraftKind = 'quotation' | 'tax_invoice' | 'bill' | 'amc' | 'letterhead';

export interface DraftIndexEntry {
  id: string;
  /** Human-readable label shown in the dropdown (e.g. "Q-2026-0001 — Acme Pvt Ltd"). */
  label: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

/** List saved drafts of a kind, newest-first. Metadata only (no snapshot payload). */
export async function listDrafts(kind: DraftKind): Promise<DraftIndexEntry[]> {
  try {
    const { data, error } = await db.documentDrafts.list(kind);
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: row.id as string,
      label: (row.label as string) || 'Untitled',
      updatedAt: (row.updated_at as string) || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Load the full snapshot for a single draft, or null if missing. */
export async function loadDraft<T = unknown>(kind: DraftKind, id: string): Promise<T | null> {
  try {
    const { data, error } = await db.documentDrafts.load(kind, id);
    if (error || !data) return null;
    return ((data as any).snapshot ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Persist a draft. `id` is optional — pass it to overwrite the same draft on
 * repeated saves, omit it to create a new one. Returns the id used, or null on failure.
 */
export async function saveDraft<T extends object>(
  kind: DraftKind,
  snapshot: T,
  options?: { id?: string; label?: string }
): Promise<string | null> {
  try {
    const label = (options?.label || 'Untitled').slice(0, 200);
    const { data, error } = await db.documentDrafts.save(kind, snapshot, {
      id: options?.id,
      label,
    });
    const row = data as { id?: string } | null;
    if (error || !row?.id) return null;
    return row.id;
  } catch {
    return null;
  }
}

export async function deleteDraft(kind: DraftKind, id: string): Promise<void> {
  try {
    await db.documentDrafts.remove(kind, id);
  } catch {
    /* ignore */
  }
}

type AddressPatch = Record<string, string | undefined> | null | undefined;

function asAddressRecord(value: unknown): Record<string, string | undefined> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string | undefined>;
  }
  return {};
}

/** Deep-merge editable customer fields saved in a draft snapshot. */
export function mergeEditableCustomer<
  T extends { address?: AddressPatch },
>(prev: T, patch: Partial<T> | undefined): T {
  if (!patch || typeof patch !== 'object') return prev;
  const { address: patchAddress, ...rest } = patch as Partial<T> & { address?: AddressPatch };
  const prevAddr = asAddressRecord(prev.address);
  const nextAddr =
    patchAddress && typeof patchAddress === 'object' && !Array.isArray(patchAddress)
      ? { ...prevAddr, ...asAddressRecord(patchAddress) }
      : prevAddr;
  return {
    ...prev,
    ...rest,
    address: nextAddr,
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
