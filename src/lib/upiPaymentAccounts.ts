/** Named UPI payees for pending-payment WhatsApp (UPI ID + payment phone). Synced via Supabase. */

import { supabase } from '@/lib/supabaseClient';

export type UpiPaymentAccount = {
  id: string;
  /** Display label in the picker, e.g. "Hydrogen RO HDFC" */
  label: string;
  /** VPA / UPI ID, e.g. merchant@oksbi */
  upiId: string;
  /** Payee name shown in UPI apps (`pn`). Defaults to label. */
  payeeName: string;
  /** Phone number customers can pay to (UPI to mobile / call). */
  phone: string;
};

const CACHE_KEY = 'hro_upi_payment_accounts_v2';
const LEGACY_CACHE_KEY = 'hro_upi_payment_accounts_v1';
const LAST_SELECTED_KEY = 'hro_upi_payment_accounts_last_id';
const MIGRATED_FLAG = 'hro_upi_payment_accounts_migrated_v1';

/** Once true, skip remote until reload (table missing / RLS). */
let remoteUnavailable = false;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `upi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUpiId(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Digits only, keep leading + if present for display normalize to 10-digit local when possible. */
export function normalizePaymentPhone(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  const digits = t.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits || t;
}

/** Loose VPA check: local@handle */
export function isValidUpiId(raw: string): boolean {
  const id = normalizeUpiId(raw);
  return /^[a-z0-9.\-_]{2,256}@[a-z0-9.\-]{2,64}$/i.test(id);
}

export function isValidPaymentPhone(raw: string): boolean {
  const p = normalizePaymentPhone(raw);
  if (!p) return true; // optional
  return /^[6-9]\d{9}$/.test(p);
}

function rowFromDb(r: Record<string, unknown>): UpiPaymentAccount | null {
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  const upiId = normalizeUpiId(
    typeof r.upi_id === 'string' ? r.upi_id : typeof r.upiId === 'string' ? r.upiId : ''
  );
  const payeeNameRaw =
    typeof r.payee_name === 'string'
      ? r.payee_name
      : typeof r.payeeName === 'string'
        ? r.payeeName
        : '';
  const payeeName = payeeNameRaw.trim() || label;
  const phone = normalizePaymentPhone(
    typeof r.phone === 'string' ? r.phone : ''
  );
  if (!id || !label || !upiId) return null;
  return { id, label, upiId, payeeName, phone };
}

function parseCachedList(raw: string | null): UpiPaymentAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: unknown) => {
        if (!row || typeof row !== 'object') return null;
        return rowFromDb(row as Record<string, unknown>);
      })
      .filter(Boolean) as UpiPaymentAccount[];
  } catch {
    return [];
  }
}

function readLocalCache(): UpiPaymentAccount[] {
  if (typeof window === 'undefined') return [];
  const v2 = parseCachedList(localStorage.getItem(CACHE_KEY));
  if (v2.length) return v2;
  // Migrate shape from v1 (no phone)
  const v1 = parseCachedList(localStorage.getItem(LEGACY_CACHE_KEY)).map((a) => ({
    ...a,
    phone: a.phone || '',
  }));
  return v1;
}

function writeLocalCache(accounts: UpiPaymentAccount[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(accounts));
  window.dispatchEvent(new Event('upiPaymentAccountsUpdated'));
}

/** Sync read of last-known accounts (cache). Prefer fetchUpiPaymentAccounts for fresh data. */
export function loadUpiPaymentAccounts(): UpiPaymentAccount[] {
  return readLocalCache();
}

export function saveUpiPaymentAccountsLocal(accounts: UpiPaymentAccount[]): void {
  writeLocalCache(accounts);
}

function isMissingTableError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('upi_payment_accounts')
  );
}

async function migrateLocalToRemoteIfNeeded(): Promise<void> {
  if (typeof window === 'undefined' || remoteUnavailable) return;
  if (localStorage.getItem(MIGRATED_FLAG) === '1') return;
  const local = readLocalCache();
  if (!local.length) {
    localStorage.setItem(MIGRATED_FLAG, '1');
    return;
  }
  const { data: existing, error } = await supabase
    .from('upi_payment_accounts' as any)
    .select('id')
    .limit(1);
  if (error) {
    if (isMissingTableError(error)) remoteUnavailable = true;
    return;
  }
  if ((existing || []).length > 0) {
    localStorage.setItem(MIGRATED_FLAG, '1');
    return;
  }
  for (const a of local) {
    const { error: insErr } = await supabase.from('upi_payment_accounts' as any).insert({
      id: a.id,
      label: a.label,
      upi_id: a.upiId,
      payee_name: a.payeeName || a.label,
      phone: a.phone || '',
    });
    if (insErr && isMissingTableError(insErr)) {
      remoteUnavailable = true;
      return;
    }
  }
  localStorage.setItem(MIGRATED_FLAG, '1');
}

/** Load from Supabase (admin), cache locally. Falls back to local cache if table not deployed. */
export async function fetchUpiPaymentAccounts(): Promise<{
  accounts: UpiPaymentAccount[];
  fromRemote: boolean;
}> {
  if (remoteUnavailable) {
    return { accounts: readLocalCache(), fromRemote: false };
  }
  try {
    await migrateLocalToRemoteIfNeeded();
    const { data, error } = await supabase
      .from('upi_payment_accounts' as any)
      .select('id, label, upi_id, payee_name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (isMissingTableError(error)) remoteUnavailable = true;
      return { accounts: readLocalCache(), fromRemote: false };
    }
    const accounts = ((data || []) as Record<string, unknown>[])
      .map(rowFromDb)
      .filter(Boolean) as UpiPaymentAccount[];
    writeLocalCache(accounts);
    return { accounts, fromRemote: true };
  } catch {
    return { accounts: readLocalCache(), fromRemote: false };
  }
}

export async function upsertUpiPaymentAccount(input: {
  id?: string;
  label: string;
  upiId: string;
  payeeName?: string;
  phone?: string;
}): Promise<{ account: UpiPaymentAccount | null; error: string | null; fromRemote: boolean }> {
  const label = String(input.label || '').trim();
  const upiId = normalizeUpiId(input.upiId);
  const payeeName = String(input.payeeName || label).trim() || label;
  const phone = normalizePaymentPhone(input.phone || '');
  if (!label) return { account: null, error: 'Enter a label (e.g. Hydrogen RO HDFC).', fromRemote: false };
  if (!isValidUpiId(upiId)) {
    return { account: null, error: 'Enter a valid UPI ID (e.g. business@oksbi).', fromRemote: false };
  }
  if (phone && !isValidPaymentPhone(phone)) {
    return {
      account: null,
      error: 'Enter a valid 10-digit Indian mobile for payment phone.',
      fromRemote: false,
    };
  }

  const id = input.id?.trim() || newId();
  const account: UpiPaymentAccount = { id, label, upiId, payeeName, phone };

  if (!remoteUnavailable) {
    const payload = {
      id,
      label,
      upi_id: upiId,
      payee_name: payeeName,
      phone,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('upi_payment_accounts' as any).upsert(payload, {
      onConflict: 'id',
    });
    if (!error) {
      const list = readLocalCache();
      const idx = list.findIndex((a) => a.id === id);
      if (idx >= 0) list[idx] = account;
      else list.unshift(account);
      writeLocalCache(list);
      return { account, error: null, fromRemote: true };
    }
    if (isMissingTableError(error)) remoteUnavailable = true;
    else return { account: null, error: error.message || 'Failed to save', fromRemote: false };
  }

  // Local-only fallback
  const list = readLocalCache();
  const idx = list.findIndex((a) => a.id === id);
  if (idx >= 0) list[idx] = account;
  else list.unshift(account);
  writeLocalCache(list);
  return { account, error: null, fromRemote: false };
}

export async function deleteUpiPaymentAccount(
  id: string
): Promise<{ error: string | null; fromRemote: boolean }> {
  if (!remoteUnavailable) {
    const { error } = await supabase.from('upi_payment_accounts' as any).delete().eq('id', id);
    if (!error) {
      const next = readLocalCache().filter((a) => a.id !== id);
      writeLocalCache(next);
      if (getLastSelectedUpiAccountId() === id) {
        setLastSelectedUpiAccountId(next[0]?.id ?? null);
      }
      return { error: null, fromRemote: true };
    }
    if (isMissingTableError(error)) remoteUnavailable = true;
    else return { error: error.message || 'Failed to delete', fromRemote: false };
  }

  const next = readLocalCache().filter((a) => a.id !== id);
  writeLocalCache(next);
  if (getLastSelectedUpiAccountId() === id) {
    setLastSelectedUpiAccountId(next[0]?.id ?? null);
  }
  return { error: null, fromRemote: false };
}

export function getLastSelectedUpiAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(LAST_SELECTED_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setLastSelectedUpiAccountId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!id) localStorage.removeItem(LAST_SELECTED_KEY);
    else localStorage.setItem(LAST_SELECTED_KEY, id);
  } catch {
    /* ignore */
  }
}

export function resolvePreferredUpiAccount(
  accounts: UpiPaymentAccount[] = loadUpiPaymentAccounts()
): UpiPaymentAccount | null {
  if (!accounts.length) return null;
  const last = getLastSelectedUpiAccountId();
  if (last) {
    const found = accounts.find((a) => a.id === last);
    if (found) return found;
  }
  return accounts[0];
}

/**
 * Build a standard UPI intent deep link (Android).
 * `pa` is left unencoded (NPCI / app convention); other fields are URI-encoded.
 */
export function buildUpiPayDeepLink(input: {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
}): string | null {
  const pa = normalizeUpiId(input.upiId);
  if (!isValidUpiId(pa)) return null;
  const parts = [`pa=${pa}`, 'cu=INR'];
  const pn = String(input.payeeName || '').trim().slice(0, 100);
  if (pn) parts.push(`pn=${encodeURIComponent(pn)}`);
  const am = Number(input.amount);
  if (Number.isFinite(am) && am > 0) {
    parts.push(`am=${am.toFixed(2)}`);
  }
  const tn = String(input.note || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (tn) parts.push(`tn=${encodeURIComponent(tn)}`);
  return `upi://pay?${parts.join('&')}`;
}

/**
 * HTTPS wrapper for WhatsApp — `upi://` is not auto-linked there.
 * Opens /pay-upi which redirects Android into the UPI intent.
 */
export function buildUpiPayHttpsLink(
  origin: string,
  input: {
    upiId: string;
    payeeName?: string;
    amount?: number;
    note?: string;
  }
): string | null {
  const pa = normalizeUpiId(input.upiId);
  if (!isValidUpiId(pa)) return null;
  const base = String(origin || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) return null;
  const q = new URLSearchParams();
  q.set('pa', pa);
  q.set('cu', 'INR');
  const pn = String(input.payeeName || '').trim().slice(0, 100);
  if (pn) q.set('pn', pn);
  const am = Number(input.amount);
  if (Number.isFinite(am) && am > 0) q.set('am', am.toFixed(2));
  const tn = String(input.note || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (tn) q.set('tn', tn);
  return `${base}/pay-upi?${q.toString()}`;
}

export type PendingPaymentUpiShare = {
  account: UpiPaymentAccount;
  /** Raw upi:// intent (for /pay-upi page). */
  deepLink: string | null;
  /** HTTPS link for WhatsApp (clickable). */
  httpsLink: string | null;
};

export function buildPendingPaymentUpiShare(
  account: UpiPaymentAccount,
  amountPending: number,
  jobRef?: string | null,
  origin?: string | null
): PendingPaymentUpiShare | null {
  if (!isValidUpiId(account.upiId)) return null;
  const noteParts = ['Pending payment'];
  if (jobRef && String(jobRef).trim()) noteParts.push(String(jobRef).trim());
  const payInput = {
    upiId: account.upiId,
    payeeName: account.payeeName || account.label,
    amount: amountPending,
    note: noteParts.join(' '),
  };
  const deepLink = buildUpiPayDeepLink(payInput);
  const siteOrigin =
    (origin && String(origin).trim()) ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const httpsLink = buildUpiPayHttpsLink(siteOrigin, payInput);
  return { account, deepLink, httpsLink };
}

export function isUpiRemoteUnavailable(): boolean {
  return remoteUnavailable;
}
