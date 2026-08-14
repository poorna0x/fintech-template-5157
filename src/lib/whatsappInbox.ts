/** WhatsApp inbox helpers — slim selects, 24h window, send via Cloud API function. */

import { clearNativeWhatsAppTrayNotification } from '@/lib/devicePrefs';
import { supabase } from '@/lib/supabaseClient';
import { escapeForLike, normalizePhoneForSearch } from '@/lib/utils';
import { waPlainLabelValue } from '@/lib/whatsappMessageFormat';
import { whatsappPhoneLookupKeys } from '@/lib/whatsappPhoneTarget';

export const WHATSAPP_INBOX_COLUMNS =
  'id, wa_message_id, direction, phone_e164, customer_id, msg_type, body, media_url, media_mime, filename, status, template_name, error_message, created_at' as const;

/** Slimmer columns for open-chat fetch (drops unused wa_message_id). */
export const WHATSAPP_THREAD_COLUMNS =
  'id, direction, phone_e164, customer_id, msg_type, body, media_url, media_mime, filename, status, template_name, error_message, created_at' as const;

export type WhatsAppMessageRow = {
  id: string;
  wa_message_id?: string | null;
  direction: 'inbound' | 'outbound';
  phone_e164: string;
  customer_id: string | null;
  msg_type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  filename: string | null;
  status: string | null;
  template_name: string | null;
  error_message: string | null;
  created_at: string;
};

export type WhatsAppThread = {
  phone_e164: string;
  customer_id: string | null;
  customer_name: string | null;
  last_body: string | null;
  last_at: string;
  last_direction: 'inbound' | 'outbound';
  last_msg_type: string;
  last_status: string | null;
  last_error: string | null;
  inbound_at: string | null;
  has_failed: boolean;
};

const MS_24H = 24 * 60 * 60 * 1000;

const READ_STORAGE_KEY = 'wa_inbox_read_at_v1';

export function isFailedDeliveryStatus(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'failed' || s === 'undelivered' || s === 'error';
}

export function loadWhatsAppReadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const WA_INBOX_READ_SYNC_EVENT = 'wa-inbox-read-sync';
export const WA_INBOX_MESSAGE_DELETED_EVENT = 'wa-inbox-message-deleted';

const DELETED_MSG_IDS_KEY = 'wa_deleted_msg_ids_v1';
const DELETED_MSG_IDS_MAX = 400;
let deletedMessageIdsMem: Set<string> | null = null;

function loadDeletedMessageIds(): Set<string> {
  if (deletedMessageIdsMem) return deletedMessageIdsMem;
  try {
    const raw = sessionStorage.getItem(DELETED_MSG_IDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    deletedMessageIdsMem = new Set(
      Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : []
    );
  } catch {
    deletedMessageIdsMem = new Set();
  }
  return deletedMessageIdsMem;
}

function persistDeletedMessageIds(ids: Set<string>): void {
  const list = [...ids].slice(-DELETED_MSG_IDS_MAX);
  deletedMessageIdsMem = new Set(list);
  try {
    sessionStorage.setItem(DELETED_MSG_IDS_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function isWhatsAppMessageDeletedLocally(id: string | null | undefined): boolean {
  const key = String(id || '').trim();
  return Boolean(key) && loadDeletedMessageIds().has(key);
}

function rememberWhatsAppDeletedMessageId(id: string): void {
  const key = String(id || '').trim();
  if (!key) return;
  const ids = loadDeletedMessageIds();
  ids.add(key);
  persistDeletedMessageIds(ids);
}

function emitWhatsAppMessageDeleted(id: string, phoneE164?: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(WA_INBOX_MESSAGE_DELETED_EVENT, {
      detail: { id, phoneE164: String(phoneE164 || '') },
    })
  );
}

/** FCM / Android tray tag — must match admin-whatsapp-inbound-push + ForegroundPushNotifier. */
export function whatsAppInboundNotificationTag(phoneE164: string): string {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  return phone ? `wa_inbound_${phone}` : 'whatsapp_inbound';
}

function emitWhatsAppReadSync(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WA_INBOX_READ_SYNC_EVENT));
}

/** True when team read watermark covers the latest customer inbound (safe to clear tray). */
export function shouldDismissWhatsAppTrayForRead(phoneE164: string, readAt: string): boolean {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || !readAt) return false;
  const cached = peekWhatsAppInboxThreadsCache({ rangeKey: 'today' });
  const thread = cached?.threads?.find((t) => {
    const p = String(t.phone_e164 || '').replace(/\D/g, '');
    return p === phone || (p.length >= 10 && phone.length >= 10 && p.slice(-10) === phone.slice(-10));
  });
  if (!thread) return true;
  const inbound = threadLastInboundAt(thread);
  if (!inbound) return true;
  const readMs = new Date(readAt).getTime();
  const inboundMs = new Date(inbound).getTime();
  if (!Number.isFinite(readMs) || !Number.isFinite(inboundMs)) return true;
  // 2s skew: mark-read vs Realtime patch ordering can differ by a few ms.
  return readMs + 2000 >= inboundMs;
}

/** Cancel native tray for this phone (always — used on explicit Realtime read events). */
export function dismissWhatsAppTrayForPhone(phoneE164: string): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone) return;
  void clearNativeWhatsAppTrayNotification(phone);
  // Also try the alternate India form so tag always matches FCM.
  if (phone.length === 10) {
    void clearNativeWhatsAppTrayNotification(`91${phone}`);
  } else if (phone.length >= 12 && phone.startsWith('91')) {
    void clearNativeWhatsAppTrayNotification(phone.slice(-10));
  }
}

/** Cancel native tray alerts for phones the team has read (mobile catch-up / Realtime). */
export function dismissWhatsAppTraysFromReadMap(readMap: Record<string, string>): void {
  for (const [rawPhone, readAt] of Object.entries(readMap)) {
    const phone = String(rawPhone || '').replace(/\D/g, '');
    if (!phone || !readAt) continue;
    if (!shouldDismissWhatsAppTrayForRead(phone, readAt)) continue;
    dismissWhatsAppTrayForPhone(phone);
  }
}

function laterIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

export function saveWhatsAppReadMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function mergeWhatsAppReadMap(incoming: Record<string, string>): Record<string, string> {
  const map = loadWhatsAppReadMap();
  let changed = false;
  for (const [rawPhone, at] of Object.entries(incoming)) {
    const phone = String(rawPhone || '').replace(/\D/g, '');
    if (!phone || !at) continue;
    const next = laterIso(map[phone], at);
    if (next && next !== map[phone]) {
      map[phone] = next;
      changed = true;
    }
  }
  if (changed) {
    saveWhatsAppReadMap(map);
    emitWhatsAppReadSync();
  }
  return map;
}

/**
 * Team read sync: merge watermark + always clear that customer's tray on this device.
 * Call on Realtime read, open chat, and resume catch-up (tray must vanish even if map unchanged).
 */
export function applyWhatsAppTeamRead(
  phoneE164: string,
  readAt: string
): Record<string, string> {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || !readAt) return loadWhatsAppReadMap();
  const map = mergeWhatsAppReadMap({ [phone]: readAt });
  dismissWhatsAppTrayForPhone(phone);
  return map;
}

export function markWhatsAppThreadRead(phoneE164: string, lastAt: string): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || !lastAt) return;
  mergeWhatsAppReadMap({ [phone]: lastAt });
}

const lastPersistedRead = new Map<string, string>();

async function pushWhatsAppTrayClearToAdminApks(phone: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch('/.netlify/functions/whatsapp-tray-clear-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone }),
    });
  } catch {
    /* tray clear is best-effort */
  }
}

/** In-memory throttle — avoid re-downloading the same slim map on soft reload / resume. */
let readMapFetchCache: { at: number; map: Record<string, string> } | null = null;
const READ_MAP_FETCH_TTL_MS = 45_000;

/** Slim fetch of team-shared read watermarks (phone + timestamp only). */
export async function fetchWhatsAppInboxReadMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { from: (table: string) => any },
  opts?: { force?: boolean; sinceHours?: number }
): Promise<Record<string, string>> {
  const now = Date.now();
  if (
    !opts?.force &&
    !opts?.sinceHours &&
    readMapFetchCache &&
    now - readMapFetchCache.at < READ_MAP_FETCH_TTL_MS
  ) {
    return readMapFetchCache.map;
  }
  let query = supabaseClient
    .from('whatsapp_inbox_read')
    .select('phone_e164, read_at')
    .order('updated_at', { ascending: false })
    .limit(opts?.sinceHours ? 80 : 200);
  if (opts?.sinceHours && opts.sinceHours > 0) {
    const since = new Date(now - opts.sinceHours * 60 * 60 * 1000).toISOString();
    query = query.gte('updated_at', since);
  }
  const { data, error } = await query;
  if (error) return readMapFetchCache?.map ?? {};
  const out: Record<string, string> = {};
  for (const row of data || []) {
    const phone = String(row.phone_e164 || '').replace(/\D/g, '');
    const at = String(row.read_at || '');
    if (phone && at) out[phone] = at;
  }
  if (!opts?.sinceHours) {
    readMapFetchCache = { at: now, map: out };
  } else if (Object.keys(out).length) {
    readMapFetchCache = {
      at: now,
      map: { ...(readMapFetchCache?.map || {}), ...out },
    };
  }
  return out;
}

export function clearWhatsAppUnreadCountForPhone(phoneE164: string): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone) return;
  const prev = loadWhatsAppUnreadCounts();
  if (!prev[phone]) return;
  const next = { ...prev };
  delete next[phone];
  saveWhatsAppUnreadCounts(next);
}

/**
 * Persist that this chat was opened (inside the thread). Team-shared — no user id.
 * Soft-fail: local unread still updates if the RPC is missing.
 */
export async function persistWhatsAppThreadRead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ error: { message?: string } | null }>;
  },
  phoneE164: string,
  readAt: string
): Promise<void> {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || !readAt) return;
  dismissWhatsAppTrayForPhone(phone);
  markWhatsAppThreadRead(phone, readAt);
  clearWhatsAppUnreadCountForPhone(phone);
  if (lastPersistedRead.get(phone) === readAt) return;
  lastPersistedRead.set(phone, readAt);
  try {
    const { error } = await supabaseClient.rpc('whatsapp_inbox_mark_read', {
      p_phone: phone,
      p_read_at: readAt,
    });
    if (error) {
      lastPersistedRead.delete(phone);
    } else {
      void pushWhatsAppTrayClearToAdminApks(phone);
    }
  } catch {
    lastPersistedRead.delete(phone);
  }
}

/** Last customer inbound time — unread must ignore booking-bot / CRM outbound replies. */
export function threadLastInboundAt(
  thread: Pick<WhatsAppThread, 'last_at' | 'last_direction' | 'inbound_at'>
): string | null {
  if (thread.inbound_at) return thread.inbound_at;
  if (thread.last_direction === 'inbound') return thread.last_at || null;
  return null;
}

/** Newest inbound timestamp from an open chat message list (fallback when thread row missing). */
export function latestInboundAtFromMessages(
  messages: Pick<WhatsAppMessageRow, 'direction' | 'created_at'>[]
): string | null {
  let latest: string | null = null;
  let latestMs = 0;
  for (const m of messages) {
    if (m.direction !== 'inbound') continue;
    const ms = new Date(m.created_at).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms >= latestMs) {
      latestMs = ms;
      latest = m.created_at;
    }
  }
  return latest;
}

export function isWhatsAppThreadUnread(
  thread: Pick<WhatsAppThread, 'phone_e164' | 'last_at' | 'last_direction' | 'inbound_at'>,
  readMap: Record<string, string>
): boolean {
  const inboundAt = threadLastInboundAt(thread);
  if (!inboundAt) return false;
  const phone = String(thread.phone_e164 || '').replace(/\D/g, '');
  const readAt = readMap[phone];
  if (!readAt) return true;
  return new Date(inboundAt).getTime() > new Date(readAt).getTime();
}

export function countUnreadWhatsAppThreads(
  threads: WhatsAppThread[],
  readMap: Record<string, string>
): number {
  return threads.reduce((n, t) => n + (isWhatsAppThreadUnread(t, readMap) ? 1 : 0), 0);
}

const UNREAD_COUNTS_STORAGE_KEY = 'wa_inbox_unread_counts_v1';

export function loadWhatsAppUnreadCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(UNREAD_COUNTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [phone, n] of Object.entries(parsed)) {
      const p = String(phone || '').replace(/\D/g, '');
      const count = Math.floor(Number(n));
      if (p && count > 0) out[p] = Math.min(count, 999);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveWhatsAppUnreadCounts(counts: Record<string, number>): void {
  try {
    const trimmed = Object.fromEntries(
      Object.entries(counts)
        .filter(([, n]) => Number(n) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 200)
    );
    localStorage.setItem(UNREAD_COUNTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

/** Inbound messages after the thread's read watermark (or all listed if never read). */
export function countInboundUnreadInMessages(
  messages: Pick<WhatsAppMessageRow, 'direction' | 'created_at'>[],
  readAt: string | null | undefined
): number {
  const readMs = readAt ? new Date(readAt).getTime() : 0;
  let n = 0;
  for (const m of messages) {
    if (m.direction !== 'inbound') continue;
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (readMs && t <= readMs) continue;
    n += 1;
  }
  return n;
}

export function unreadMessageCountForThread(
  thread: Pick<WhatsAppThread, 'phone_e164' | 'last_at' | 'last_direction' | 'inbound_at'>,
  readMap: Record<string, string>,
  counts: Record<string, number>
): number {
  if (!isWhatsAppThreadUnread(thread, readMap)) return 0;
  const phone = String(thread.phone_e164 || '').replace(/\D/g, '');
  const n = counts[phone];
  return n && n > 0 ? n : 1;
}

/** Sum of per-chat unread message counts (fallback 1 per unread chat). */
export function countUnreadWhatsAppMessages(
  threads: WhatsAppThread[],
  readMap: Record<string, string>,
  counts: Record<string, number>
): number {
  return threads.reduce(
    (sum, t) => sum + unreadMessageCountForThread(t, readMap, counts),
    0
  );
}

/**
 * Header / Tools badge total — team-wide per-phone maps (hydrated from DB).
 * Falls back to the cached thread list only when maps are empty.
 */
export function resolveWhatsAppHeaderUnreadCount(
  threads?: WhatsAppThread[] | null,
  readMap?: Record<string, string>
): number {
  const counts = loadWhatsAppUnreadCounts();
  let sum = 0;
  for (const n of Object.values(counts)) {
    if (n > 0) sum += n;
  }
  if (sum > 0) return Math.min(sum, 999);

  const map = readMap ?? loadWhatsAppReadMap();
  const list =
    threads && threads.length
      ? threads
      : peekWhatsAppInboxThreadsCache({ rangeKey: 'today' })?.threads ?? [];
  if (list.length) {
    return countUnreadWhatsAppMessages(list, map, counts);
  }
  return 0;
}

/** Distinct chats with unread inbound — Tools badge. */
export function resolveWhatsAppUnreadChatCount(
  extraCounts?: Record<string, number> | null
): number {
  const counts = extraCounts || loadWhatsAppUnreadCounts();
  let n = 0;
  for (const v of Object.values(counts)) {
    if (v > 0) n += 1;
  }
  return Math.min(n, 9999);
}

/** Bump local per-phone unread message count (Tools badge) on new inbound. */
export function bumpWhatsAppUnreadCountForPhone(phoneE164: string, by = 1): number {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || by <= 0) return 0;
  const prev = loadWhatsAppUnreadCounts();
  const next = { ...prev, [phone]: Math.min(999, (prev[phone] || 0) + by) };
  saveWhatsAppUnreadCounts(next);
  return next[phone];
}

export type WhatsAppUnreadSummary = {
  total: number;
  /** Distinct phones with unread inbound. Omitted if RPC is older than chats field. */
  chats?: number;
  perPhone: Record<string, number>;
};

function parseUnreadSummary(raw: unknown): WhatsAppUnreadSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const perRaw = o.per_phone && typeof o.per_phone === 'object' ? o.per_phone : {};
  const perPhone: Record<string, number> = {};
  for (const [phoneRaw, nRaw] of Object.entries(perRaw as Record<string, unknown>)) {
    const phone = String(phoneRaw || '').replace(/\D/g, '');
    const n = Math.floor(Number(nRaw));
    if (phone && n > 0) perPhone[phone] = Math.min(n, 999);
  }
  const totalRaw = Math.floor(Number(o.total));
  const summed = Object.values(perPhone).reduce((s, n) => s + n, 0);
  const total =
    Number.isFinite(totalRaw) && totalRaw >= 0
      ? Math.min(totalRaw, 999)
      : Math.min(summed, 999);
  let chats: number | undefined;
  if (o.chats !== undefined && o.chats !== null) {
    const chatsRaw = Math.floor(Number(o.chats));
    if (Number.isFinite(chatsRaw) && chatsRaw >= 0) chats = Math.min(chatsRaw, 9999);
  }
  if (chats === undefined) {
    chats = Object.keys(perPhone).length;
  }
  return { total, chats, perPhone };
}

/** Team unread from DB — same number on every admin device. Soft-fail if RPC missing. */
export async function fetchWhatsAppInboxUnreadSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { rpc: (fn: string) => any } = supabase
): Promise<WhatsAppUnreadSummary | null> {
  try {
    const { data, error } = await supabaseClient.rpc('whatsapp_inbox_unread_summary');
    if (error) {
      if (/whatsapp_inbox_unread_summary|could not find|does not exist/i.test(error.message || '')) {
        return null;
      }
      console.warn('[whatsapp] unread summary failed', error.message);
      return null;
    }
    return parseUnreadSummary(data);
  } catch (err) {
    console.warn('[whatsapp] unread summary failed', (err as Error)?.message || err);
    return null;
  }
}

/** Overwrite local per-phone maps from the team summary (cache only). */
export function applyWhatsAppUnreadSummary(summary: WhatsAppUnreadSummary): number {
  saveWhatsAppUnreadCounts(summary.perPhone);
  return summary.total;
}

/**
 * One slim query: inbound rows for currently-unread chats, then count per phone
 * after each chat's read watermark. Soft-fail → {}.
 */
export async function fetchWhatsAppUnreadMessageCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { from: (table: string) => any },
  threads: WhatsAppThread[],
  readMap: Record<string, string>
): Promise<Record<string, number>> {
  const targets = threads.filter((t) => isWhatsAppThreadUnread(t, readMap)).slice(0, 80);
  if (!targets.length) return {};

  const phones = targets.map((t) => String(t.phone_e164 || '').replace(/\D/g, '')).filter(Boolean);
  let sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const t of targets) {
    const phone = String(t.phone_e164 || '').replace(/\D/g, '');
    const readAt = readMap[phone];
    if (readAt) {
      const tMs = new Date(readAt).getTime();
      if (Number.isFinite(tMs)) sinceMs = Math.min(sinceMs, tMs);
    }
  }

  const { data, error } = await supabaseClient
    .from('whatsapp_messages')
    .select('phone_e164, created_at')
    .in('phone_e164', phones)
    .eq('direction', 'inbound')
    .gt('created_at', new Date(sinceMs).toISOString())
    .order('created_at', { ascending: false })
    .limit(800);

  if (error) return {};

  const counts: Record<string, number> = {};
  for (const phone of phones) counts[phone] = 0;

  for (const row of data || []) {
    const phone = String(row.phone_e164 || '').replace(/\D/g, '');
    if (!phone || !(phone in counts)) continue;
    const readAt = readMap[phone];
    const createdMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdMs)) continue;
    if (readAt) {
      const readMs = new Date(readAt).getTime();
      if (Number.isFinite(readMs) && createdMs <= readMs) continue;
    }
    counts[phone] += 1;
  }

  for (const phone of phones) {
    if (!counts[phone]) counts[phone] = 1;
  }
  return counts;
}

/** In-memory + sessionStorage cache for 24h-window checks (cuts repeat egress). */
const WINDOW_CACHE_TTL_MS = 60_000;
const WINDOW_CACHE_KEY = 'wa_inbound_at_cache_v1';
const windowCacheMem = new Map<string, { at: string | null; checkedAt: number }>();

function readWindowCacheStore(): Record<string, { at: string | null; checkedAt: number }> {
  try {
    const raw = sessionStorage.getItem(WINDOW_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { at: string | null; checkedAt: number }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWindowCacheStore(
  store: Record<string, { at: string | null; checkedAt: number }>
): void {
  try {
    // Keep cache small — last 40 phones
    const entries = Object.entries(store)
      .sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0))
      .slice(0, 40);
    sessionStorage.setItem(WINDOW_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

/**
 * Last inbound timestamp for a phone (admin RLS). Cached ~60s to avoid duplicate
 * selects when opening Email/WhatsApp send dialogs for the same customer.
 */
export async function fetchLastInboundAt(
  phoneE164: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { from: (table: string) => any }
): Promise<string | null> {
  const keys = whatsappPhoneLookupKeys(phoneE164);
  if (keys.length === 0) return null;
  const cacheKey = keys[keys.length - 1] || keys[0];

  const now = Date.now();
  const mem = windowCacheMem.get(cacheKey);
  if (mem && now - mem.checkedAt < WINDOW_CACHE_TTL_MS) {
    return mem.at;
  }
  const store = readWindowCacheStore();
  const stored = store[cacheKey];
  if (stored && now - stored.checkedAt < WINDOW_CACHE_TTL_MS) {
    windowCacheMem.set(cacheKey, stored);
    return stored.at;
  }

  const { data } = await supabaseClient
    .from('whatsapp_messages')
    .select('created_at')
    .in('phone_e164', keys)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const at = (data?.created_at as string | undefined) ?? null;
  const entry = { at, checkedAt: now };
  windowCacheMem.set(cacheKey, entry);
  store[cacheKey] = entry;
  writeWindowCacheStore(store);
  return at;
}

/** Call after a successful outbound/inbound so the next window check is fresh. */
export function invalidateInboundWindowCache(phoneE164?: string | null): void {
  const keys = phoneE164 ? whatsappPhoneLookupKeys(phoneE164) : [];
  if (keys.length) {
    const store = readWindowCacheStore();
    for (const key of keys) {
      windowCacheMem.delete(key);
      delete store[key];
    }
    writeWindowCacheStore(store);
    return;
  }
  windowCacheMem.clear();
  try {
    sessionStorage.removeItem(WINDOW_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* —— Inbox list + open-chat message cache (session + localStorage + memory) —— */

const INBOX_LIST_CACHE_KEY = 'wa_inbox_threads_cache_v2';
const THREAD_MSGS_CACHE_KEY = 'wa_thread_msgs_cache_v1';
/** Soft refresh / pull can still update; open-from-cache never expires by time. */
export const WHATSAPP_INBOX_LIST_CACHE_TTL_MS = 45_000;
/** @deprecated Kept for callers; local chat cache no longer expires by age. */
export const WHATSAPP_THREAD_CACHE_TTL_MS = Number.POSITIVE_INFINITY;
/** @deprecated Local cache paints forever until cleared/exported-overwritten. */
export const WHATSAPP_INBOX_PERSIST_PAINT_TTL_MS = Number.POSITIVE_INFINITY;
/** Max distinct chats kept in on-device message cache. */
const THREAD_CACHE_MAX_PHONES = 200;

/** How far back the inbox thread list loads (sidebar). */
export type WhatsAppInboxListRange = 'today' | '7d' | '30d' | 'all' | { custom: string };

const INBOX_LIST_RANGE_STORAGE_KEY = 'wa_inbox_list_range_v1';

export function inboxListRangeKey(range: WhatsAppInboxListRange): string {
  if (typeof range === 'object') return `custom:${range.custom}`;
  return range;
}

export function loadWhatsAppInboxListRange(): WhatsAppInboxListRange {
  try {
    const raw = localStorage.getItem(INBOX_LIST_RANGE_STORAGE_KEY);
    if (!raw || raw === 'today') return 'today';
    if (raw === '7d' || raw === '30d' || raw === 'all') return raw;
    if (raw.startsWith('custom:')) {
      const date = raw.slice(7);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return { custom: date };
    }
  } catch {
    /* ignore */
  }
  return 'today';
}

export function saveWhatsAppInboxListRange(range: WhatsAppInboxListRange): void {
  try {
    localStorage.setItem(INBOX_LIST_RANGE_STORAGE_KEY, inboxListRangeKey(range));
  } catch {
    /* ignore */
  }
}

export function inboxListRangeLabel(range: WhatsAppInboxListRange): string {
  if (range === 'today') return "Today's chats";
  if (range === '7d') return 'Last 7 days';
  if (range === '30d') return 'Last 30 days';
  if (range === 'all') return 'All chats';
  const d = new Date(`${range.custom}T12:00:00`);
  if (!Number.isNaN(d.getTime())) {
    return `Since ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `Since ${range.custom}`;
}

export function sinceIsoForInboxListRange(range: WhatsAppInboxListRange): string | null {
  const now = new Date();
  if (range === 'all') return null;
  if (range === 'today') return startOfLocalDayIso(now);
  if (range === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return startOfLocalDayIso(d);
  }
  if (range === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return startOfLocalDayIso(d);
  }
  const [y, m, day] = range.custom.split('-').map(Number);
  if (!y || !m || !day) return startOfLocalDayIso(now);
  return new Date(y, m - 1, day, 0, 0, 0, 0).toISOString();
}

export function fetchOptsForInboxListRange(
  range: WhatsAppInboxListRange
): { since: string | null; todayOnly: boolean } {
  if (range === 'today') {
    return { since: startOfLocalDayIso(), todayOnly: true };
  }
  if (range === 'all') {
    return { since: null, todayOnly: false };
  }
  return { since: sinceIsoForInboxListRange(range), todayOnly: false };
}

export type ThreadMsgsCacheEntry = {
  messages: WhatsAppMessageRow[];
  hasMoreOlder: boolean;
  fetchedAt: number;
};

type InboxListCacheEntry = {
  rangeKey: string;
  threads: WhatsAppThread[];
  fetchedAt: number;
};

let inboxListCacheMem: InboxListCacheEntry | null = null;
const threadMsgsCacheMem = new Map<string, ThreadMsgsCacheEntry>();

function readJsonSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readJsonLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Memory-session first; fall back to localStorage (survives Admin APK process kill). */
function readJsonCached<T>(key: string): T | null {
  return readJsonSession<T>(key) ?? readJsonLocal<T>(key);
}

function writeJsonSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function writeJsonLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function writeJsonCached(key: string, value: unknown): void {
  writeJsonSession(key, value);
  writeJsonLocal(key, value);
}

function removeJsonCached(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function peekWhatsAppInboxThreadsCache(opts?: {
  rangeKey?: string;
  /** @deprecated use rangeKey */
  todayOnly?: boolean;
}): InboxListCacheEntry | null {
  const rangeKey =
    opts?.rangeKey ?? (opts?.todayOnly === false ? 'all' : 'today');
  if (inboxListCacheMem && inboxListCacheMem.rangeKey === rangeKey) {
    return inboxListCacheMem;
  }
  const stored = readJsonCached<InboxListCacheEntry & { todayOnly?: boolean }>(
    INBOX_LIST_CACHE_KEY
  );
  if (stored && Array.isArray(stored.threads)) {
    const storedKey =
      stored.rangeKey ?? (stored.todayOnly === false ? 'all' : 'today');
    if (storedKey === rangeKey) {
      inboxListCacheMem = { ...stored, rangeKey: storedKey };
      // Promote localStorage hit into session for this WebView session.
      writeJsonSession(INBOX_LIST_CACHE_KEY, inboxListCacheMem);
      return inboxListCacheMem;
    }
  }
  return null;
}

export function isWhatsAppInboxListCacheFresh(
  entry: InboxListCacheEntry | null | undefined,
  _ttlMs = WHATSAPP_INBOX_LIST_CACHE_TTL_MS
): boolean {
  // Forever until cleared — any cached list skips network on normal open.
  return Boolean(entry?.threads?.length);
}

/** True when on-device list cache can paint (survives APK kill until cleared). */
export function isWhatsAppInboxListCachePaintable(
  entry: InboxListCacheEntry | null | undefined
): boolean {
  return Boolean(entry?.threads?.length);
}

export function writeWhatsAppInboxThreadsCache(
  threads: WhatsAppThread[],
  opts?: { rangeKey?: string; todayOnly?: boolean }
): void {
  const rangeKey =
    opts?.rangeKey ?? (opts?.todayOnly === false ? 'all' : 'today');
  const entry: InboxListCacheEntry = {
    rangeKey,
    threads,
    fetchedAt: Date.now(),
  };
  inboxListCacheMem = entry;
  writeJsonCached(INBOX_LIST_CACHE_KEY, entry);
}

export function invalidateWhatsAppInboxThreadsCache(): void {
  inboxListCacheMem = null;
  removeJsonCached(INBOX_LIST_CACHE_KEY);
}

export function peekWhatsAppThreadMessagesCache(
  phoneE164: string
): ThreadMsgsCacheEntry | null {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone) return null;
  const mem = threadMsgsCacheMem.get(phone);
  if (mem?.messages) {
    const messages = mem.messages.filter((m) => !isWhatsAppMessageDeletedLocally(m.id));
    if (messages.length !== mem.messages.length) {
      const cleaned = { ...mem, messages };
      threadMsgsCacheMem.set(phone, cleaned);
      return cleaned;
    }
    return mem;
  }
  const store = readJsonCached<Record<string, ThreadMsgsCacheEntry>>(THREAD_MSGS_CACHE_KEY) || {};
  const stored = store[phone];
  if (stored && Array.isArray(stored.messages)) {
    const messages = stored.messages.filter((m) => !isWhatsAppMessageDeletedLocally(m.id));
    const entry = { ...stored, messages };
    threadMsgsCacheMem.set(phone, entry);
    writeJsonSession(THREAD_MSGS_CACHE_KEY, store);
    return entry;
  }
  return null;
}

export function isWhatsAppThreadCacheFresh(
  entry: ThreadMsgsCacheEntry | null | undefined,
  _ttlMs = WHATSAPP_THREAD_CACHE_TTL_MS
): boolean {
  // Forever until cleared — any cached messages count as fresh for skip-network.
  return Boolean(entry?.messages?.length);
}

export function isWhatsAppThreadCachePaintable(
  entry: ThreadMsgsCacheEntry | null | undefined
): boolean {
  return Boolean(entry?.messages?.length);
}

export function writeWhatsAppThreadMessagesCache(
  phoneE164: string,
  messages: WhatsAppMessageRow[],
  hasMoreOlder: boolean
): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone) return;
  const kept = messages.filter((m) => !isWhatsAppMessageDeletedLocally(m.id));
  const entry: ThreadMsgsCacheEntry = {
    messages: kept,
    hasMoreOlder,
    fetchedAt: Date.now(),
  };
  threadMsgsCacheMem.set(phone, entry);
  const store = readJsonCached<Record<string, ThreadMsgsCacheEntry>>(THREAD_MSGS_CACHE_KEY) || {};
  store[phone] = entry;
  const trimmed = Object.fromEntries(
    Object.entries(store)
      .sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0))
      .slice(0, THREAD_CACHE_MAX_PHONES)
  );
  writeJsonCached(THREAD_MSGS_CACHE_KEY, trimmed);
}

/** Patch one message into thread cache (realtime / send) without full reload. */
export function upsertWhatsAppThreadMessageCache(
  phoneE164: string,
  row: WhatsAppMessageRow
): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || !row?.id) return;
  if (isWhatsAppMessageDeletedLocally(row.id)) return;
  const prev = peekWhatsAppThreadMessagesCache(phone);
  if (!prev) return;
  const without = prev.messages.filter((m) => m.id !== row.id);
  const messages = [...without, row].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const capped =
    messages.length > WHATSAPP_THREAD_LIMIT
      ? messages.slice(messages.length - WHATSAPP_THREAD_LIMIT)
      : messages;
  writeWhatsAppThreadMessagesCache(phone, capped, prev.hasMoreOlder);
}

function peekAnyInboxListCache(): InboxListCacheEntry | null {
  if (inboxListCacheMem?.threads) return inboxListCacheMem;
  const stored = readJsonCached<InboxListCacheEntry>(INBOX_LIST_CACHE_KEY);
  return stored?.threads ? stored : null;
}

function patchInboxListPreviewFromRemaining(
  phone: string,
  remaining: WhatsAppMessageRow[],
  removed: WhatsAppMessageRow | undefined
): void {
  const list = peekAnyInboxListCache();
  if (!list?.threads?.length || !removed) return;
  const idx = list.threads.findIndex((t) => t.phone_e164 === phone);
  if (idx < 0) return;
  const existing = list.threads[idx];
  if (existing.last_at && existing.last_at !== removed.created_at) return;
  const last = remaining[remaining.length - 1];
  if (!last) return;
  writeWhatsAppInboxThreadsCache(patchThreadFromMessage(list.threads, last), {
    rangeKey: list.rangeKey,
  });
}

/**
 * Drop one message from on-device chat cache after a real DB delete.
 * Also refreshes the sidebar preview when that row was the last message.
 */
export function removeWhatsAppThreadMessageCache(
  messageId: string,
  phoneE164?: string | null
): { phone: string; remaining: WhatsAppMessageRow[] } | null {
  const id = String(messageId || '').trim();
  if (!id) return null;
  rememberWhatsAppDeletedMessageId(id);
  emitWhatsAppMessageDeleted(id, phoneE164);
  const hinted = String(phoneE164 || '').replace(/\D/g, '');
  const phones: string[] = [];
  if (hinted) {
    phones.push(hinted);
  } else {
    const store =
      readJsonCached<Record<string, ThreadMsgsCacheEntry>>(THREAD_MSGS_CACHE_KEY) || {};
    for (const phone of new Set([...threadMsgsCacheMem.keys(), ...Object.keys(store)])) {
      if (phone) phones.push(phone);
    }
  }
  for (const phone of phones) {
    const prev = peekWhatsAppThreadMessagesCache(phone);
    if (!prev?.messages?.some((m) => m.id === id)) continue;
    const removed = prev.messages.find((m) => m.id === id);
    const remaining = prev.messages.filter((m) => m.id !== id);
    writeWhatsAppThreadMessagesCache(phone, remaining, prev.hasMoreOlder);
    patchInboxListPreviewFromRemaining(phone, remaining, removed);
    return { phone, remaining };
  }
  return null;
}

/**
 * After any CRM Cloud API send (pending payment, PDF, template, etc.):
 * update list preview + invalidate that chat’s message cache so the next open
 * loads the full thread including this outbound (forever-cache safe).
 */
export function noteWhatsAppOutboundInLocalCaches(opts: {
  phoneE164: string;
  body?: string | null;
  msgType?: string | null;
  filename?: string | null;
  mediaMime?: string | null;
  mediaUrl?: string | null;
  messageId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  templateName?: string | null;
}): void {
  const phone = String(opts.phoneE164 || '').replace(/\D/g, '');
  if (!phone) return;

  const now = new Date().toISOString();
  const mime = opts.mediaMime || null;
  const filename = opts.filename || null;
  let msgType = String(opts.msgType || 'text').trim() || 'text';
  if (!opts.msgType && mime) {
    if (mime.startsWith('image/')) msgType = 'image';
    else if (mime.includes('pdf') || /\.pdf$/i.test(filename || '')) msgType = 'document';
  }
  if (opts.templateName && !opts.body && msgType === 'text') msgType = 'template';

  const body =
    String(opts.body || '').trim() ||
    (opts.templateName ? String(opts.templateName) : '') ||
    (filename ? filename : '') ||
    (msgType === 'image' ? 'Photo' : msgType === 'document' ? 'Document' : 'Message');

  const row: WhatsAppMessageRow = {
    id: opts.messageId || `local-${Date.now()}`,
    wa_message_id: null,
    direction: 'outbound',
    phone_e164: phone,
    customer_id: opts.customerId || null,
    msg_type: msgType,
    body,
    media_url: opts.mediaUrl || null,
    media_mime: mime,
    filename,
    status: 'sent',
    template_name: opts.templateName || null,
    error_message: null,
    created_at: now,
  };

  const prevThread = peekWhatsAppThreadMessagesCache(phone);
  if (prevThread?.messages?.length) {
    upsertWhatsAppThreadMessageCache(phone, row);
  } else {
    // No local history yet — don't seed a 1-message cache (would hide older history
    // under forever skip-network). Force a network load next open.
    invalidateWhatsAppThreadMessagesCache(phone);
  }

  const list = peekWhatsAppInboxThreadsCache();
  if (!list?.threads?.length) {
    invalidateWhatsAppInboxThreadsCache();
    return;
  }
  const preview = previewMessageBody(row);
  const existing = list.threads.find((t) => String(t.phone_e164).replace(/\D/g, '') === phone);
  const nextThread: WhatsAppThread = {
    phone_e164: phone,
    customer_id: opts.customerId || existing?.customer_id || null,
    customer_name: opts.customerName || existing?.customer_name || null,
    last_at: now,
    last_direction: 'outbound',
    last_body: preview,
    last_status: 'sent',
    last_error: null,
    last_msg_type: msgType,
    inbound_at: existing?.inbound_at || null,
    has_failed: false,
  };
  const others = list.threads.filter((t) => String(t.phone_e164).replace(/\D/g, '') !== phone);
  writeWhatsAppInboxThreadsCache([nextThread, ...others], { rangeKey: list.rangeKey });
}

export function invalidateWhatsAppThreadMessagesCache(phoneE164?: string | null): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (phone) {
    threadMsgsCacheMem.delete(phone);
    const store = readJsonCached<Record<string, ThreadMsgsCacheEntry>>(THREAD_MSGS_CACHE_KEY) || {};
    delete store[phone];
    writeJsonCached(THREAD_MSGS_CACHE_KEY, store);
    return;
  }
  threadMsgsCacheMem.clear();
  removeJsonCached(THREAD_MSGS_CACHE_KEY);
}

/** Snapshot of all on-device thread message caches (for local backup). */
export function dumpWhatsAppThreadMessagesCache(): Record<string, ThreadMsgsCacheEntry> {
  const store = readJsonCached<Record<string, ThreadMsgsCacheEntry>>(THREAD_MSGS_CACHE_KEY) || {};
  for (const [phone, entry] of threadMsgsCacheMem.entries()) {
    store[phone] = entry;
  }
  return store;
}

export function restoreWhatsAppThreadMessagesCache(
  store: Record<string, ThreadMsgsCacheEntry> | null | undefined
): number {
  threadMsgsCacheMem.clear();
  if (!store || typeof store !== 'object') {
    removeJsonCached(THREAD_MSGS_CACHE_KEY);
    return 0;
  }
  let n = 0;
  const next: Record<string, ThreadMsgsCacheEntry> = {};
  for (const [phone, entry] of Object.entries(store)) {
    if (!entry || !Array.isArray(entry.messages)) continue;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) continue;
    next[digits] = {
      messages: entry.messages,
      hasMoreOlder: Boolean(entry.hasMoreOlder),
      fetchedAt: Number(entry.fetchedAt) || Date.now(),
    };
    threadMsgsCacheMem.set(digits, next[digits]);
    n += 1;
  }
  writeJsonCached(THREAD_MSGS_CACHE_KEY, next);
  return n;
}

export function clearAllWhatsAppLocalTextCache(): void {
  invalidateWhatsAppInboxThreadsCache();
  invalidateWhatsAppThreadMessagesCache();
}

/** People list via RPC — not full message dump. */
export const WHATSAPP_INBOX_LIST_LIMIT = 120;
/** First paint for open chat (newest N, then “load older”). */
export const WHATSAPP_THREAD_PAGE_SIZE = 40;
/**
 * Max messages held in an open chat (after scroll-up history).
 * Must be high enough that “load older” is not immediately discarded —
 * trimming newest-only when over this while paging up.
 */
export const WHATSAPP_THREAD_LIMIT = 400;
/** Max threads returned by on-demand inbox search. */
export const WHATSAPP_INBOX_SEARCH_LIMIT = 40;

export function isR2MediaRef(mediaUrl: string | null | undefined): boolean {
  const raw = String(mediaUrl || '').trim();
  return (
    raw.startsWith('r2:') ||
    raw.startsWith('whatsapp-media:') ||
    raw.startsWith('whatsapp/inbound/') ||
    raw.startsWith('whatsapp/outbound/')
  );
}

/** Local midnight as ISO — for “chatted today” inbox filter. */
export function startOfLocalDayIso(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
}

export function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** India-friendly WhatsApp phone digits (no +). */
export function toWhatsAppPhoneDigits(value: string | null | undefined): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length > 12 && digits.startsWith('91')) digits = digits.slice(0, 12);
  return digits;
}

type InboxThreadRow = {
  phone_e164: string;
  customer_id: string | null;
  customer_name?: string | null;
  last_at: string;
  last_direction: string;
  last_msg_type: string;
  last_status: string | null;
  last_error: string | null;
  last_body: string | null;
  inbound_at: string | null;
  has_failed: boolean;
};

type SupabaseInboxClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

function inboxRowToThread(
  r: InboxThreadRow,
  nameByCustomerId: Map<string, string>,
  nameByPhone: Map<string, string>,
  idByPhone?: Map<string, string>
): WhatsAppThread {
  const phone = String(r.phone_e164 || '').replace(/\D/g, '');
  const customerId =
    r.customer_id ||
    idByPhone?.get(phone) ||
    idByPhone?.get(phone.slice(-10)) ||
    null;
  const customerName =
    String(r.customer_name || '').trim() ||
    (customerId ? nameByCustomerId.get(customerId) : null) ||
    nameByPhone.get(phone) ||
    nameByPhone.get(phone.slice(-10)) ||
    null;
  return {
    phone_e164: phone,
    customer_id: customerId,
    customer_name: customerName,
    last_body: previewMessageBody({
      body: r.last_body,
      msg_type: r.last_msg_type,
      filename: null,
      media_url: null,
      media_mime: null,
    }),
    last_at: r.last_at,
    last_direction: (r.last_direction === 'inbound' ? 'inbound' : 'outbound') as
      | 'inbound'
      | 'outbound',
    last_msg_type: r.last_msg_type || 'text',
    last_status: r.last_status,
    last_error: r.last_error,
    inbound_at: r.inbound_at,
    has_failed: Boolean(r.has_failed),
  };
}

/** Resolve display names + customer UUID when the latest WA row has no customer_id. */
async function resolveMissingInboxThreadNames(
  supabaseClient: SupabaseInboxClient,
  rows: InboxThreadRow[],
  nameHints?: Map<string, string>
): Promise<{
  nameByCustomerId: Map<string, string>;
  nameByPhone: Map<string, string>;
  idByPhone: Map<string, string>;
}> {
  const nameByCustomerId = new Map<string, string>(nameHints || []);
  const nameByPhone = new Map<string, string>();
  const idByPhone = new Map<string, string>();

  for (const r of rows) {
    const id = r.customer_id;
    const fromRpc = String(r.customer_name || '').trim();
    if (id && fromRpc) nameByCustomerId.set(id, fromRpc);
  }

  const allLinkedAndNamed = rows.every(
    (r) => Boolean(r.customer_id) && Boolean(String(r.customer_name || '').trim())
  );
  if (allLinkedAndNamed) {
    return { nameByCustomerId, nameByPhone, idByPhone };
  }

  const needIds = [
    ...new Set(
      rows
        .filter((r) => r.customer_id && !nameByCustomerId.has(r.customer_id))
        .map((r) => r.customer_id as string)
    ),
  ].slice(0, 120);

  const needPhones = [
    ...new Set(
      rows
        .filter((r) => {
          const phone = String(r.phone_e164 || '').replace(/\D/g, '');
          if (!phone || phone.length < 10) return false;
          return !r.customer_id;
        })
        .map((r) => String(r.phone_e164 || '').replace(/\D/g, ''))
    ),
  ].slice(0, 40);

  const lookups: Promise<void>[] = [];

  if (needIds.length) {
    lookups.push(
      (async () => {
        const { data } = await supabaseClient
          .from('customers')
          .select('id, full_name')
          .in('id', needIds);
        for (const c of data || []) {
          const label = String(c.full_name || '').trim();
          if (c.id && label) nameByCustomerId.set(c.id, label);
        }
      })()
    );
  }

  if (needPhones.length) {
    const last10s = [...new Set(needPhones.map((p) => p.slice(-10)))];
    const orParts: string[] = [];
    for (const d of last10s) {
      orParts.push(`phone.like.%${d}%`, `alternate_phone.like.%${d}%`);
    }
    lookups.push(
      (async () => {
        const { data } = await supabaseClient
          .from('customers')
          .select('id, full_name, phone, alternate_phone')
          .or(orParts.slice(0, 40).join(','))
          .limit(40);
        for (const c of data || []) {
          if (!c.id) continue;
          const label = String(c.full_name || '').trim();
          if (label) nameByCustomerId.set(c.id, label);
          for (const raw of [c.phone, c.alternate_phone]) {
            const digits = String(raw || '').replace(/\D/g, '');
            if (digits.length < 10) continue;
            const last10 = digits.slice(-10);
            idByPhone.set(digits, c.id);
            idByPhone.set(last10, c.id);
            if (label) {
              nameByPhone.set(digits, label);
              nameByPhone.set(last10, label);
            }
          }
        }
      })()
    );
  }

  if (lookups.length) await Promise.all(lookups);
  return { nameByCustomerId, nameByPhone, idByPhone };
}

async function mapInboxRowsToThreads(
  supabaseClient: SupabaseInboxClient,
  rows: InboxThreadRow[],
  nameHints?: Map<string, string>
): Promise<WhatsAppThread[]> {
  if (!rows.length) return [];
  const { nameByCustomerId, nameByPhone, idByPhone } = await resolveMissingInboxThreadNames(
    supabaseClient,
    rows,
    nameHints
  );
  return rows.map((r) => inboxRowToThread(r, nameByCustomerId, nameByPhone, idByPhone));
}

async function fetchInboxLatestByPhonesRpc(
  supabaseClient: SupabaseInboxClient,
  phones: string[]
): Promise<{ rows: InboxThreadRow[] | null; unsupported: boolean }> {
  if (!phones.length) return { rows: [], unsupported: false };
  const res = await supabaseClient.rpc('whatsapp_inbox_latest_by_phones', {
    p_phones: phones,
  });
  if (res.error) {
    const msg = String(res.error.message || '');
    if (
      /whatsapp_inbox_latest_by_phones|could not find the function|No function matches|does not exist/i.test(
        msg
      )
    ) {
      return { rows: null, unsupported: true };
    }
    throw new Error(msg || 'Search failed');
  }
  return { rows: (res.data || []) as InboxThreadRow[], unsupported: false };
}

/** People list only — one slim row per phone via RPC; full messages load when a chat opens. */
export async function fetchWhatsAppInboxThreads(
  supabaseClient: SupabaseInboxClient,
  opts?: {
    limit?: number;
    since?: string | null;
    todayOnly?: boolean;
    range?: WhatsAppInboxListRange;
  }
): Promise<{ threads: WhatsAppThread[]; error?: string }> {
  const limit = opts?.limit ?? WHATSAPP_INBOX_LIST_LIMIT;
  let since = opts?.since;
  let todayOnly = Boolean(opts?.todayOnly);

  if (opts?.range) {
    const derived = fetchOptsForInboxListRange(opts.range);
    since = derived.since;
    todayOnly = derived.todayOnly;
  } else if (since === undefined) {
    since = todayOnly ? startOfLocalDayIso() : null;
  } else if (todayOnly && since === null) {
    since = startOfLocalDayIso();
  }

  let data: InboxThreadRow[] | null = null;
  let error: { message?: string } | null = null;

  if (since) {
    const res = await supabaseClient.rpc('whatsapp_inbox_threads', {
      p_limit: limit,
      p_since: since,
    });
    data = res.data;
    error = res.error;
    // Older DB without p_since — fall back then filter client-side
    if (
      error &&
      /p_since|could not find the function|function public\.whatsapp_inbox_threads|No function matches|does not exist/i.test(
        String(error.message || '')
      )
    ) {
      const retry = await supabaseClient.rpc('whatsapp_inbox_threads', {
        p_limit: limit,
      });
      data = retry.data;
      error = retry.error;
      if (!error && data) {
        const sinceMs = new Date(since).getTime();
        data = data.filter((r: InboxThreadRow) => {
          const t = new Date(r.last_at).getTime();
          return Number.isFinite(t) && t >= sinceMs;
        });
        if (todayOnly) {
          data = data.filter((r: InboxThreadRow) => isSameLocalDay(r.last_at));
        }
      }
    }
  } else {
    const res = await supabaseClient.rpc('whatsapp_inbox_threads', {
      p_limit: limit,
    });
    data = res.data;
    error = res.error;
  }

  if (error) {
    return { threads: [], error: error.message || 'Failed to load inbox' };
  }

  let rows = (data || []) as InboxThreadRow[];
  if (todayOnly) {
    rows = rows.filter((r) => isSameLocalDay(r.last_at));
  }

  const threads =
    rows.length > 0 &&
    rows.every((r) => Boolean(r.customer_id) && Boolean(String(r.customer_name || '').trim()))
      ? rows.map((r) => inboxRowToThread(r, new Map(), new Map()))
      : await mapInboxRowsToThreads(supabaseClient, rows);
  return { threads };
}

/**
 * On-demand search only (not while typing). Matches CRM customer id / name / phone / email,
 * plus WhatsApp numbers, then loads those threads.
 */
export async function searchWhatsAppInboxThreads(
  supabaseClient: SupabaseInboxClient,
  query: string,
  limit = WHATSAPP_INBOX_SEARCH_LIMIT
): Promise<{ threads: WhatsAppThread[]; error?: string }> {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) {
    return { threads: [], error: 'Type at least 2 characters' };
  }

  const escaped = escapeForLike(trimmed);
  const phoneNorm = normalizePhoneForSearch(trimmed);
  const orParts: string[] = [
    `customer_id.ilike.%${escaped}%`,
    `full_name.ilike.%${escaped}%`,
    `phone.ilike.%${escaped}%`,
    `alternate_phone.ilike.%${escaped}%`,
    `email.ilike.%${escaped}%`,
  ];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    orParts.push(`id.eq.${trimmed}`);
  }
  if (phoneNorm.length >= 10) {
    orParts.push(
      `phone.ilike.%${phoneNorm}%`,
      `alternate_phone.ilike.%${phoneNorm}%`
    );
    if (phoneNorm.length === 10) {
      const first4 = phoneNorm.slice(0, 4);
      const last6 = phoneNorm.slice(4);
      orParts.push(
        `phone.ilike.%${first4}%${last6}%`,
        `alternate_phone.ilike.%${first4}%${last6}%`
      );
    }
  }

  const { data: customers, error: cErr } = await supabaseClient
    .from('customers')
    .select('id, full_name, phone, alternate_phone')
    .or(orParts.join(','))
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (cErr) {
    return { threads: [], error: cErr.message };
  }

  const nameHints = new Map<string, string>();
  const phoneToCustomer = new Map<string, { id: string; name: string }>();
  const phones = new Set<string>();

  for (const c of customers || []) {
    const name = String(c.full_name || '').trim() || 'Customer';
    if (c.id) nameHints.set(c.id, name);
    for (const raw of [c.phone, c.alternate_phone]) {
      const wa = toWhatsAppPhoneDigits(raw);
      if (!wa || wa.length < 12) continue;
      phones.add(wa);
      phoneToCustomer.set(wa, { id: c.id, name });
      phoneToCustomer.set(wa.slice(-10), { id: c.id, name });
    }
  }

  // Direct phone / WA number search (even if not in CRM)
  if (phoneNorm.length >= 7) {
    const last = phoneNorm.slice(-10);
    phones.add(toWhatsAppPhoneDigits(last));
    const { data: waHits } = await supabaseClient
      .from('whatsapp_messages')
      .select('phone_e164')
      .ilike('phone_e164', `%${last}%`)
      .order('created_at', { ascending: false })
      .limit(60);
    for (const row of waHits || []) {
      const p = toWhatsAppPhoneDigits(row.phone_e164);
      if (p) phones.add(p);
    }
  }

  // Name-only / id hits may have no phone — skip those without a WhatsApp number
  const phoneList = [...phones].filter(Boolean).slice(0, limit);
  if (!phoneList.length) {
    return { threads: [] };
  }

  let latestByPhone = new Map<string, InboxThreadRow>();
  let usedLatestRpc = false;

  try {
    const rpc = await fetchInboxLatestByPhonesRpc(supabaseClient, phoneList);
    if (rpc.rows) {
      usedLatestRpc = true;
      for (const row of rpc.rows) {
        const phone = toWhatsAppPhoneDigits(row.phone_e164);
        if (!phone) continue;
        latestByPhone.set(phone, {
          ...row,
          phone_e164: phone,
          customer_id: row.customer_id || phoneToCustomer.get(phone)?.id || null,
        });
      }
    }
  } catch (err) {
    return { threads: [], error: err instanceof Error ? err.message : 'Search failed' };
  }

  if (!usedLatestRpc) {
    const { data: msgs, error: mErr } = await supabaseClient
      .from('whatsapp_messages')
      .select(
        'phone_e164, customer_id, direction, msg_type, body, filename, status, error_message, created_at'
      )
      .in('phone_e164', phoneList)
      .order('created_at', { ascending: false })
      .limit(Math.min(phoneList.length * 3, 120));

    if (mErr) {
      return { threads: [], error: mErr.message };
    }

    const inboundByPhone = new Map<string, string>();
    for (const row of msgs || []) {
      const phone = toWhatsAppPhoneDigits(row.phone_e164);
      if (!phone) continue;
      if (row.direction === 'inbound' && !inboundByPhone.has(phone)) {
        inboundByPhone.set(phone, row.created_at);
      }
      if (latestByPhone.has(phone)) continue;
      const failed =
        row.direction === 'outbound' &&
        (isFailedDeliveryStatus(row.status) || Boolean(String(row.error_message || '').trim()));
      latestByPhone.set(phone, {
        phone_e164: phone,
        customer_id: row.customer_id || phoneToCustomer.get(phone)?.id || null,
        last_at: row.created_at,
        last_direction: row.direction || 'outbound',
        last_msg_type: row.msg_type || 'text',
        last_status: row.status,
        last_error: row.error_message,
        last_body:
          row.body?.trim() ||
          row.filename?.trim() ||
          row.msg_type ||
          'message',
        inbound_at: null,
        has_failed: failed,
      });
    }
    for (const [phone, row] of latestByPhone) {
      row.inbound_at = inboundByPhone.get(phone) || row.inbound_at;
    }
  }

  // Customers matched but never WhatsApp'd — still list so admin can open/start chat
  for (const phone of phoneList) {
    if (latestByPhone.has(phone)) continue;
    const hint = phoneToCustomer.get(phone) || phoneToCustomer.get(phone.slice(-10));
    if (!hint) continue;
    latestByPhone.set(phone, {
      phone_e164: phone,
      customer_id: hint.id,
      last_at: '',
      last_direction: 'outbound',
      last_msg_type: 'text',
      last_status: null,
      last_error: null,
      last_body: 'No WhatsApp messages yet',
      inbound_at: null,
      has_failed: false,
    });
  }

  const rows = [...latestByPhone.values()].sort((a, b) => {
    const tb = new Date(b.last_at).getTime();
    const ta = new Date(a.last_at).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const threads = await mapInboxRowsToThreads(supabaseClient, rows, nameHints);
  // Ensure CRM names from search win
  for (const t of threads) {
    const hint =
      (t.customer_id && nameHints.get(t.customer_id)) ||
      phoneToCustomer.get(t.phone_e164)?.name ||
      phoneToCustomer.get(t.phone_e164.slice(-10))?.name;
    if (hint) t.customer_name = hint;
  }

  return { threads: threads.slice(0, limit) };
}

export function patchThreadFromMessage(
  threads: WhatsAppThread[],
  row: WhatsAppMessageRow,
  nameByCustomerId?: Map<string, string>
): WhatsAppThread[] {
  const phone = String(row.phone_e164 || '').replace(/\D/g, '');
  if (!phone) return threads;
  const preview = previewMessageBody(row);
  const isInbound = row.direction === 'inbound';
  const failed =
    !isInbound &&
    (isFailedDeliveryStatus(row.status) || Boolean(row.error_message?.trim()));

  const idx = threads.findIndex((t) => t.phone_e164 === phone);
  const next: WhatsAppThread = {
    phone_e164: phone,
    customer_id: row.customer_id || (idx >= 0 ? threads[idx].customer_id : null),
    customer_name:
      (row.customer_id && nameByCustomerId?.get(row.customer_id)) ||
      (idx >= 0 ? threads[idx].customer_name : null),
    last_body: preview,
    last_at: row.created_at,
    last_direction: row.direction,
    last_msg_type: row.msg_type,
    last_status: row.status,
    last_error: row.error_message,
    inbound_at: isInbound
      ? row.created_at
      : idx >= 0
        ? threads[idx].inbound_at
        : null,
    has_failed: failed || (idx >= 0 ? threads[idx].has_failed : false),
  };

  if (idx < 0) return [next, ...threads].slice(0, WHATSAPP_INBOX_LIST_LIMIT);
  const copy = [...threads];
  copy.splice(idx, 1);
  return [next, ...copy];
}

function looksLikeWhatsAppLocationPreview(body: string, msgType?: string | null): boolean {
  if (String(msgType || '').toLowerCase() === 'location') return true;
  const raw = String(body || '').trim();
  if (!raw) return false;
  if (
    /maps\.app\.goo\.gl|goo\.gl\/maps|share\.google\/|\/\/g\.co\/|google\.[^\s]+\/maps|maps\.google\./i.test(
      raw
    )
  ) {
    return true;
  }
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return false;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  const rest = raw.replace(m[0], '').replace(/https?:\/\/\S+/gi, '').trim();
  const precise = /\.\d{3,}/.test(m[1]) || /\.\d{3,}/.test(m[2]);
  return precise || rest.length === 0;
}

export function previewMessageBody(
  row: Pick<WhatsAppMessageRow, 'body' | 'msg_type' | 'filename' | 'media_url' | 'media_mime'>
): string {
  const file = (row.filename || '').trim();
  const isDoc =
    row.msg_type === 'document' ||
    row.msg_type === 'pdf' ||
    Boolean(row.media_mime?.includes('pdf')) ||
    /\.pdf$/i.test(file);
  const isImage =
    row.msg_type === 'image' || Boolean(row.media_mime?.startsWith('image/'));
  const bodyRaw = String(row.body || '');
  const isLocation = looksLikeWhatsAppLocationPreview(bodyRaw, row.msg_type);

  if (isLocation) {
    const formatted = formatAdminWhatsAppBody(row.body, { compact: true });
    const withoutCoords = formatted
      .replace(/📍/g, '')
      .replace(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g, '')
      .replace(/https?:\/\/\S+/gi, '')
      .trim();
    if (!withoutCoords || /^location$/i.test(withoutCoords)) return '📍 Location';
    return `📍 ${withoutCoords}`;
  }

  if (row.body?.trim()) {
    const formatted = formatAdminWhatsAppBody(row.body, { compact: true });
    if (row.media_url && (isDoc || isImage) && !String(row.media_url).startsWith('local:')) {
      const snippet =
        formatted.length > 72 ? `${formatted.slice(0, 69).trim()}…` : formatted;
      return isDoc ? `📄 ${snippet}` : `📷 ${snippet}`;
    }
    if (row.media_url && (isDoc || isImage) && file) {
      return isDoc ? `📄 ${file}` : `📷 ${file}`;
    }
    return formatted;
  }

  // Prefer filename for media without caption so thread list shows the PDF/photo name
  if (row.media_url && file && (isDoc || isImage)) {
    if (isImage) return `📷 ${file}`;
    return `📄 ${file}`;
  }

  if (file) return isDoc ? `📄 ${file}` : isImage ? `📷 ${file}` : file;
  switch (row.msg_type) {
    case 'image':
      return '📷 Photo';
    case 'document':
    case 'pdf':
      return '📄 Document';
    case 'audio':
    case 'voice':
      return '🎧 Audio';
    case 'video':
      return '🎬 Video';
    case 'sticker':
      return 'Sticker';
    case 'location':
      return '📍 Location';
    case 'template':
      return 'Template';
    default:
      return row.msg_type || 'Message';
  }
}

const BOOKING_BOT_STATE_PREFIX = '[Booking bot state]';
const AWAITING_MEDIA_MARKER = '[Awaiting customer media]';
const POST_BOOKING_REDIRECT_MARKER = '[Post-booking human redirect]';
export const NEEDS_HUMAN_MARKER = '[Needs human reply]';

/** Thread preview / last_body indicates admin should reply on this chat. */
export function threadNeedsHumanReply(body: string | null | undefined): boolean {
  const raw = String(body || '');
  if (!raw.trim()) return false;
  if (raw.includes(NEEDS_HUMAN_MARKER)) return true;
  return /needs human reply/i.test(raw);
}

const BOOKING_STEP_LABELS: Record<string, string> = {
  idle: 'Idle',
  await_service_type: 'Choose service',
  await_custom_note: 'Custom request note',
  await_name: 'Ask name',
  await_location: 'Ask location',
  await_loc_confirm: 'Confirm location',
  await_date: 'Pick date',
  await_period: 'Pick time of day',
  await_time: 'Pick time slot',
  await_custom_time: 'Custom time',
  await_model_or_photo: 'Purifier photo / model',
  await_confirm: 'Confirm booking',
  await_edit_menu: 'Edit details',
  booking_complete: 'Booking complete',
};

function formatBookingDateIso(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatBookingBotState(
  rawJson: string,
  opts?: { compact?: boolean }
): string {
  try {
    const state = JSON.parse(rawJson) as Record<string, unknown>;
    const step = String(state.step || '').trim();
    const stepLabel = BOOKING_STEP_LABELS[step] || step || 'In progress';
    const name = String(state.name || '').trim();
    const service =
      String(state.serviceLabel || state.serviceSubType || '').trim();
    const dateLabel = formatBookingDateIso(
      typeof state.dateIso === 'string' ? state.dateIso : undefined
    );
    const timeLabel = String(
      state.customTimeLabel || state.slotKey || state.periodKey || ''
    ).trim();
    const loc =
      state.loc && typeof state.loc === 'object'
        ? String(
            (state.loc as { name?: string; address?: string }).name ||
              (state.loc as { address?: string }).address ||
              ''
          ).trim()
        : '';
    const hasPhoto = Boolean(state.photoUrl);
    const model = String(state.model || '').trim();

    if (opts?.compact) {
      const bits = [`Booking · ${stepLabel}`];
      if (name) bits.push(name);
      if (service) bits.push(service);
      if (dateLabel) bits.push(dateLabel);
      if (timeLabel) bits.push(timeLabel);
      return bits.join(' · ');
    }

    const lines = [`Booking bot · ${stepLabel}`];
    if (name) lines.push(waPlainLabelValue('Name', name));
    if (service) lines.push(waPlainLabelValue('Service', service));
    if (dateLabel) lines.push(waPlainLabelValue('Date', dateLabel));
    if (timeLabel) lines.push(waPlainLabelValue('Time', timeLabel));
    if (loc) lines.push(waPlainLabelValue('Location', loc));
    if (hasPhoto) lines.push(waPlainLabelValue('Photo', 'Received'));
    else if (model) lines.push(waPlainLabelValue('Model', model));
    if (state.editing) lines.push(waPlainLabelValue('Editing', 'yes'));
    return lines.join('\n');
  } catch {
    return opts?.compact ? 'Booking bot (state)' : 'Booking bot state (could not parse)';
  }
}

/**
 * Make CRM inbox text human-readable (booking-bot JSON, button footers, *bold*).
 */
export function formatAdminWhatsAppBody(
  body: string | null | undefined,
  opts?: { compact?: boolean }
): string {
  let text = String(body || '');
  if (!text.trim()) return '';

  if (text.startsWith(BOOKING_BOT_STATE_PREFIX)) {
    return formatBookingBotState(text.slice(BOOKING_BOT_STATE_PREFIX.length), opts);
  }

  // Strip internal markers used by bots (keep the rest of the message)
  text = text
    .replace(AWAITING_MEDIA_MARKER, '')
    .replace(POST_BOOKING_REDIRECT_MARKER, '')
    .replace(NEEDS_HUMAN_MARKER, 'Needs human reply —')
    .trim();

  // WhatsApp interactive button footer: [Yes | No | …]
  text = text.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = String(inner)
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length <= 1) return parts[0] ? `(${parts[0]})` : '';
    return opts?.compact
      ? `Buttons: ${parts.join(' · ')}`
      : `Buttons:\n${parts.map((p) => `• ${p}`).join('\n')}`;
  });

  // WhatsApp bold *like this*
  text = text.replace(/\*([^*]+)\*/g, '$1');

  // Meta template / bot slug stored as body (e.g. svc_wfs_ask_name_ero_v2)
  if (/^svc_[a-z0-9_]+$/i.test(text.trim())) {
    text = humanizeWhatsAppTemplateSlug(text.trim());
  } else {
    // Template slug + params: "svc_balance_due_letter_hro_v6: Poorna · 1500 · …"
    const tplWithParams = text.trim().match(/^(svc_[a-z0-9_]+)\s*:\s*(.+)$/i);
    if (tplWithParams) {
      const label = humanizeWhatsAppTemplateSlug(tplWithParams[1]);
      text = `${label}\n${tplWithParams[2].trim()}`;
    }
  }

  // Collapse leftover blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/** svc_wfs_ask_name_ero_v2 → Ask name */
function humanizeWhatsAppTemplateSlug(slug: string): string {
  let s = slug.replace(/^svc_/i, '').replace(/_(ero|hro)_v\d+$/i, '').replace(/_v\d+$/i, '');
  s = s.replace(/_img$/i, '').replace(/_letter$/i, '_letter');
  if (/balance_due/i.test(slug) || /balance_due/i.test(s)) {
    return /_img/i.test(slug) ? 'Pending payment (UPI QR)' : 'Pending payment';
  }
  if (/job_done|job_completion/i.test(slug)) return 'Job completed';
  const stepHints: Record<string, string> = {
    ask_name: 'Ask name',
    await_name: 'Ask name',
    wfs_ask_name: 'Ask name',
    ask_location: 'Ask location',
    await_location: 'Ask location',
    pick_date: 'Pick date',
    await_date: 'Pick date',
    pick_time: 'Pick time',
    await_time: 'Pick time slot',
  };
  if (stepHints[s]) return stepHints[s];
  for (const [k, label] of Object.entries(stepHints)) {
    if (s.endsWith(k) || s.includes(`_${k}`)) return label;
  }
  return s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** True when the row is an internal booking-bot state dump (not a customer-facing text). */
export function isBookingBotStateMessage(body: string | null | undefined): boolean {
  return String(body || '').startsWith(BOOKING_BOT_STATE_PREFIX);
}

/** Inbound marker from webhook — booking CTA / mid-flow (no admin push/toast). */
export const BOOKING_FLOW_ALERT_MARKER = 'crm_bot_flow';

export function isBotFlowAdminAlertSkip(
  row: Pick<WhatsAppMessageRow, 'msg_type' | 'template_name'>
): boolean {
  const type = String(row.msg_type || '').toLowerCase();
  if (type === 'interactive' || type === 'button') return true;
  return String(row.template_name || '') === BOOKING_FLOW_ALERT_MARKER;
}

/** Free-form text/PDF allowed if last inbound was within 24 hours. */
export function isWithinCustomerServiceWindow(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < MS_24H;
}

/**
 * True only when we *know* the 24h window is closed (inbound exists and is older than 24h).
 * Missing inbound → try free-form first; Meta will reject if the window is actually closed.
 */
export function isCustomerServiceWindowClosed(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return !isWithinCustomerServiceWindow(lastInboundAt);
}

export function hoursLeftInWindow(lastInboundAt: string | null | undefined): number | null {
  if (!lastInboundAt) return null;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return null;
  const left = MS_24H - (Date.now() - t);
  if (left <= 0) return 0;
  return Math.round((left / (60 * 60 * 1000)) * 10) / 10;
}

export function buildThreadsFromMessages(
  rows: WhatsAppMessageRow[],
  nameByCustomerId: Map<string, string>
): WhatsAppThread[] {
  const byPhone = new Map<string, WhatsAppThread>();

  for (const row of rows) {
    const phone = row.phone_e164;
    if (!phone) continue;
    const existing = byPhone.get(phone);
    const isInbound = row.direction === 'inbound';

    if (!existing) {
      byPhone.set(phone, {
        phone_e164: phone,
        customer_id: row.customer_id,
        customer_name: row.customer_id ? nameByCustomerId.get(row.customer_id) || null : null,
        last_body: previewMessageBody(row),
        last_at: row.created_at,
        last_direction: row.direction,
        last_msg_type: row.msg_type,
        last_status: row.status,
        last_error: row.error_message,
        inbound_at: isInbound ? row.created_at : null,
        has_failed:
          !isInbound &&
          (isFailedDeliveryStatus(row.status) || Boolean(row.error_message?.trim())),
      });
      continue;
    }

    // rows are newest-first; first time we see a phone is the latest message
    if (isInbound && !existing.inbound_at) {
      existing.inbound_at = row.created_at;
    }
    if (row.customer_id && !existing.customer_id) {
      existing.customer_id = row.customer_id;
      existing.customer_name = nameByCustomerId.get(row.customer_id) || null;
    }
    // Keep scanning for newer inbound_at — if this inbound is newer than stored
    if (isInbound) {
      const prev = existing.inbound_at ? new Date(existing.inbound_at).getTime() : 0;
      const cur = new Date(row.created_at).getTime();
      if (cur >= prev) existing.inbound_at = row.created_at;
    }
  }

  // Fix inbound_at: we need the MOST RECENT inbound, but we iterate newest-first
  // so first inbound we see per phone is the latest. Reset and recompute properly:
  const inboundLatest = new Map<string, string>();
  for (const row of rows) {
    if (row.direction !== 'inbound') continue;
    if (!inboundLatest.has(row.phone_e164)) {
      inboundLatest.set(row.phone_e164, row.created_at);
    }
  }
  for (const [phone, thread] of byPhone) {
    thread.inbound_at = inboundLatest.get(phone) || null;
  }

  // Flag any failed outbound in the retention window (not only the latest message)
  const failedPhones = new Set<string>();
  for (const row of rows) {
    if (row.direction !== 'outbound') continue;
    if (isFailedDeliveryStatus(row.status) || row.error_message?.trim()) {
      failedPhones.add(row.phone_e164);
    }
  }
  for (const [phone, thread] of byPhone) {
    if (failedPhones.has(phone)) thread.has_failed = true;
  }

  return Array.from(byPhone.values()).sort(
    (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
  );
}

export function formatThreadTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function formatBubbleTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function displayPhone(phoneE164: string): string {
  const d = String(phoneE164 || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return d;
  return phoneE164 ? `+${d}` : '';
}

export type WhatsAppCustomerDocument = {
  id: string;
  phone_e164: string | null;
  filename: string | null;
  media_url: string;
  media_mime: string | null;
  created_at: string;
  direction: 'inbound' | 'outbound';
  msg_type: string;
};

export function isWhatsAppDocumentMessage(row: {
  msg_type?: string | null;
  media_mime?: string | null;
  filename?: string | null;
  media_url?: string | null;
}): boolean {
  if (!row.media_url) return false;
  const type = String(row.msg_type || '').toLowerCase();
  const mime = String(row.media_mime || '').toLowerCase();
  const file = String(row.filename || '').toLowerCase();
  if (type === 'image' || mime.startsWith('image/')) return false;
  return (
    type === 'document' ||
    type === 'pdf' ||
    mime.includes('pdf') ||
    mime.includes('application/') ||
    file.endsWith('.pdf')
  );
}

export function isWhatsAppOutboundImageMessage(row: {
  msg_type?: string | null;
  media_mime?: string | null;
  media_url?: string | null;
}): boolean {
  if (!row.media_url) return false;
  return (
    String(row.msg_type || '').toLowerCase() === 'image' ||
    String(row.media_mime || '').toLowerCase().startsWith('image/')
  );
}

/** Outbound WhatsApp PDFs + photos sent to the customer (slim columns). */
export async function listCustomerWhatsAppDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { from: (table: string) => any },
  opts: {
    customerId?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    limit?: number;
  }
): Promise<{ rows: WhatsAppCustomerDocument[]; error?: string }> {
  const phones = [
    ...new Set(
      [toWhatsAppPhoneDigits(opts.phone), toWhatsAppPhoneDigits(opts.alternatePhone)].filter(
        Boolean
      )
    ),
  ];
  const customerId = String(opts.customerId || '').trim();
  const uuid = customerId.includes('-') ? customerId : '';
  if (!uuid && phones.length === 0) return { rows: [] };

  const orParts: string[] = [];
  if (uuid) orParts.push(`customer_id.eq.${uuid}`);
  for (const p of phones) orParts.push(`phone_e164.eq.${p}`);

  const { data, error } = await supabaseClient
    .from('whatsapp_messages')
    .select('id, phone_e164, direction, msg_type, filename, media_url, media_mime, created_at')
    .eq('direction', 'outbound')
    .not('media_url', 'is', null)
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 80);

  if (error) return { rows: [], error: error.message };

  // One gallery entry per stored media link (same WhatsApp row / R2 URL — no duplicate copies).
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const rows: WhatsAppCustomerDocument[] = [];
  for (const row of data || []) {
    if (
      (!isWhatsAppDocumentMessage(row) && !isWhatsAppOutboundImageMessage(row)) ||
      seenIds.has(row.id)
    )
      continue;
    const mediaUrl = String(row.media_url || '').trim();
    if (!mediaUrl || seenUrls.has(mediaUrl)) continue;
    seenIds.add(row.id);
    seenUrls.add(mediaUrl);
    rows.push({
      id: row.id,
      phone_e164: row.phone_e164 ? String(row.phone_e164).replace(/\D/g, '') : null,
      filename: row.filename || null,
      media_url: mediaUrl,
      media_mime: row.media_mime || null,
      created_at: row.created_at,
      direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
      msg_type: row.msg_type || 'document',
    });
  }
  return { rows };
}
