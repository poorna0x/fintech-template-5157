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

export function normalizeUpiId(raw: string): string {
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

export type UpiPayLinkInput = {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
  phone?: string;
  brand?: 'hydrogenro' | 'elevenro' | string | null;
};

/** Query string shared by upi:// and app-specific schemes (pa unencoded). */
export function buildUpiPayQuery(input: UpiPayLinkInput): string | null {
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
  return parts.join('&');
}

/**
 * Build a standard UPI intent deep link (Android system chooser).
 * `pa` is left unencoded (NPCI / app convention); other fields are URI-encoded.
 */
export function buildUpiPayDeepLink(input: UpiPayLinkInput): string | null {
  const q = buildUpiPayQuery(input);
  return q ? `upi://pay?${q}` : null;
}

export type PayPlatform = 'android' | 'ios' | 'other';

/** Best-effort UA detection for /pay-upi layout (WhatsApp in-app browsers included). */
export function detectPayPlatform(): PayPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  // Android first — covers Chrome, WhatsApp, Samsung Internet, etc.
  if (/android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ can report as Macintosh with touch
  if (
    typeof navigator.platform === 'string' &&
    navigator.platform === 'MacIntel' &&
    Number(navigator.maxTouchPoints || 0) > 1
  ) {
    return 'ios';
  }
  return 'other';
}

/**
 * App-specific UPI openers (needed on iOS — generic upi:// has no chooser there).
 * Android usually prefers buildUpiPayDeepLink() instead.
 */
export function buildUpiAppDeepLinks(input: UpiPayLinkInput): {
  id: string;
  name: string;
  href: string;
  color: string;
}[] {
  const q = buildUpiPayQuery(input);
  if (!q) return [];
  return [
    { id: 'gpay', name: 'GPay', href: `tez://upi/pay?${q}`, color: '#4285F4' },
    { id: 'phonepe', name: 'PhonePe', href: `phonepe://pay?${q}`, color: '#5F259F' },
    { id: 'paytm', name: 'Paytm', href: `paytmmp://upi/pay?${q}`, color: '#00BAF2' },
    { id: 'bhim', name: 'BHIM', href: `bhim://upi/pay?${q}`, color: '#007272' },
  ];
}

const PROD_UPI_ORIGINS: Record<'hydrogenro' | 'elevenro', string> = {
  hydrogenro: 'https://hydrogenro.com',
  elevenro: 'https://elevenro.com',
};

function isLocalOrPreviewOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1|netlify\.app|:5173|:4173|:3000|:8080/i.test(origin);
}

/**
 * Always use the live brand site for WhatsApp pay links
 * (hydrogenro.com / elevenro.com). Local CRM must not put localhost in messages.
 */
export function resolveUpiPaySiteOrigin(
  brand?: 'hydrogenro' | 'elevenro' | string | null,
  originOverride?: string | null
): string {
  const override = String(originOverride || '')
    .trim()
    .replace(/\/$/, '');
  // Ignore localhost/preview overrides — WhatsApp customers need the public site.
  if (override && !isLocalOrPreviewOrigin(override)) return override;
  const key = brand === 'elevenro' ? 'elevenro' : 'hydrogenro';
  return PROD_UPI_ORIGINS[key];
}

/**
 * HTTPS wrapper for WhatsApp — `upi://` is not auto-linked there.
 * Opens /pay-upi which shows QR + opens UPI apps.
 */
export function buildUpiPayHttpsLink(
  origin: string,
  input: UpiPayLinkInput
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
  const ph = normalizePaymentPhone(input.phone || '');
  if (ph) q.set('ph', ph);
  const brand = input.brand === 'elevenro' ? 'elevenro' : input.brand === 'hydrogenro' ? 'hydrogenro' : '';
  if (brand) q.set('brand', brand);
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
  options?: {
    origin?: string | null;
    brand?: 'hydrogenro' | 'elevenro' | string | null;
  } | null
): PendingPaymentUpiShare | null {
  if (!isValidUpiId(account.upiId)) return null;
  const brand = options?.brand === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const noteParts = ['Pending payment'];
  if (jobRef && String(jobRef).trim()) noteParts.push(String(jobRef).trim());
  const payInput: UpiPayLinkInput = {
    upiId: account.upiId,
    payeeName: account.payeeName || account.label,
    amount: amountPending,
    note: noteParts.join(' '),
    phone: account.phone || undefined,
    brand,
  };
  const deepLink = buildUpiPayDeepLink(payInput);
  const siteOrigin = resolveUpiPaySiteOrigin(brand, options?.origin);
  const httpsLink = buildUpiPayHttpsLink(siteOrigin, payInput);
  return { account, deepLink, httpsLink };
}

export function isUpiRemoteUnavailable(): boolean {
  return remoteUnavailable;
}
