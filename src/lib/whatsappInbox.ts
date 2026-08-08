/** WhatsApp inbox helpers — slim selects, 24h window, send via Cloud API function. */

export const WHATSAPP_INBOX_COLUMNS =
  'id, wa_message_id, direction, phone_e164, customer_id, msg_type, body, media_url, media_mime, filename, status, template_name, error_message, created_at' as const;

export type WhatsAppMessageRow = {
  id: string;
  wa_message_id: string | null;
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

export function markWhatsAppThreadRead(phoneE164: string, lastAt: string): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || !lastAt) return;
  try {
    const map = loadWhatsAppReadMap();
    map[phone] = lastAt;
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function isWhatsAppThreadUnread(
  thread: Pick<WhatsAppThread, 'phone_e164' | 'last_at' | 'last_direction'>,
  readMap: Record<string, string>
): boolean {
  if (thread.last_direction !== 'inbound') return false;
  const phone = String(thread.phone_e164 || '').replace(/\D/g, '');
  const readAt = readMap[phone];
  if (!readAt) return true;
  return new Date(thread.last_at).getTime() > new Date(readAt).getTime();
}

export function countUnreadWhatsAppThreads(
  threads: WhatsAppThread[],
  readMap: Record<string, string>
): number {
  return threads.reduce((n, t) => n + (isWhatsAppThreadUnread(t, readMap) ? 1 : 0), 0);
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
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return null;

  const now = Date.now();
  const mem = windowCacheMem.get(phone);
  if (mem && now - mem.checkedAt < WINDOW_CACHE_TTL_MS) {
    return mem.at;
  }
  const store = readWindowCacheStore();
  const stored = store[phone];
  if (stored && now - stored.checkedAt < WINDOW_CACHE_TTL_MS) {
    windowCacheMem.set(phone, stored);
    return stored.at;
  }

  const { data } = await supabaseClient
    .from('whatsapp_messages')
    .select('created_at')
    .eq('phone_e164', phone)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const at = (data?.created_at as string | undefined) ?? null;
  const entry = { at, checkedAt: now };
  windowCacheMem.set(phone, entry);
  store[phone] = entry;
  writeWindowCacheStore(store);
  return at;
}

/** Call after a successful outbound/inbound so the next window check is fresh. */
export function invalidateInboundWindowCache(phoneE164?: string | null): void {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (phone) {
    windowCacheMem.delete(phone);
    const store = readWindowCacheStore();
    delete store[phone];
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

/** People list via RPC — not full message dump. */
export const WHATSAPP_INBOX_LIST_LIMIT = 120;
/** Active chat: enough recent history without over-fetching. */
export const WHATSAPP_THREAD_LIMIT = 80;

export function isR2MediaRef(mediaUrl: string | null | undefined): boolean {
  const raw = String(mediaUrl || '').trim();
  return raw.startsWith('r2:') || raw.startsWith('whatsapp/inbound/') || raw.startsWith('whatsapp/outbound/');
}

export async function fetchWhatsAppInboxThreads(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { rpc: (fn: string, args?: Record<string, unknown>) => any; from: (t: string) => any },
  limit = WHATSAPP_INBOX_LIST_LIMIT
): Promise<{ threads: WhatsAppThread[]; error?: string }> {
  const { data, error } = await supabaseClient.rpc('whatsapp_inbox_threads', {
    p_limit: limit,
  });
  if (error) {
    return { threads: [], error: error.message };
  }

  const rows = (data || []) as Array<{
    phone_e164: string;
    customer_id: string | null;
    last_at: string;
    last_direction: string;
    last_msg_type: string;
    last_status: string | null;
    last_error: string | null;
    last_body: string | null;
    inbound_at: string | null;
    has_failed: boolean;
  }>;

  const nameByCustomerId = new Map<string, string>();
  const customerIdByPhone = new Map<string, string>();

  const customerIds = [
    ...new Set(rows.map((r) => r.customer_id).filter(Boolean) as string[]),
  ].slice(0, 120);

  const phonesMissing = [
    ...new Set(
      rows
        .filter((r) => !r.customer_id)
        .map((r) => String(r.phone_e164 || '').replace(/\D/g, ''))
        .filter((p) => p.length >= 10)
    ),
  ].slice(0, 60);

  const ingestCustomer = (c: {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    alternate_phone?: string | null;
  }) => {
    if (!c?.id) return;
    const label = String(c.full_name || '').trim() || 'Customer';
    nameByCustomerId.set(c.id, label);
    for (const raw of [c.phone, c.alternate_phone]) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (digits.length < 10) continue;
      customerIdByPhone.set(digits, c.id);
      customerIdByPhone.set(digits.slice(-10), c.id);
    }
  };

  // Parallel CRM lookups (by id + by phone) — minimizes time-to-names
  const lookups: Promise<void>[] = [];

  if (customerIds.length) {
    lookups.push(
      (async () => {
        const { data: customers } = await supabaseClient
          .from('customers')
          .select('id, full_name, phone, alternate_phone')
          .in('id', customerIds);
        for (const c of customers || []) ingestCustomer(c);
      })()
    );
  }

  if (phonesMissing.length) {
    const last10s = [...new Set(phonesMissing.map((p) => p.slice(-10)))];
    const orParts: string[] = [];
    for (const d of last10s) {
      orParts.push(
        `phone.eq.${d}`,
        `phone.eq.91${d}`,
        `alternate_phone.eq.${d}`,
        `alternate_phone.eq.91${d}`
      );
    }
    for (let i = 0; i < orParts.length; i += 40) {
      const chunk = orParts.slice(i, i + 40);
      lookups.push(
        (async () => {
          const { data: byPhone } = await supabaseClient
            .from('customers')
            .select('id, full_name, phone, alternate_phone')
            .or(chunk.join(','))
            .limit(80);
          for (const c of byPhone || []) ingestCustomer(c);
        })()
      );
    }
  }

  if (lookups.length) {
    await Promise.all(lookups);
  }

  const threads: WhatsAppThread[] = rows.map((r) => {
    const phone = String(r.phone_e164 || '').replace(/\D/g, '');
    let customerId = r.customer_id || null;
    if (!customerId && phone) {
      customerId =
        customerIdByPhone.get(phone) || customerIdByPhone.get(phone.slice(-10)) || null;
    }
    return {
      phone_e164: phone,
      customer_id: customerId,
      customer_name: customerId ? nameByCustomerId.get(customerId) || null : null,
      last_body: formatAdminWhatsAppBody(r.last_body, { compact: true }) || r.last_body,
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
  });

  return { threads };
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

  // Prefer filename for media so thread list shows the PDF/photo name
  if (row.media_url && file && (isDoc || isImage)) {
    if (isImage) return `📷 ${file}`;
    return `📄 ${file}`;
  }

  if (row.body?.trim()) return formatAdminWhatsAppBody(row.body, { compact: true });
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
    if (name) lines.push(`Name: ${name}`);
    if (service) lines.push(`Service: ${service}`);
    if (dateLabel) lines.push(`Date: ${dateLabel}`);
    if (timeLabel) lines.push(`Time: ${timeLabel}`);
    if (loc) lines.push(`Location: ${loc}`);
    if (hasPhoto) lines.push('Photo: Received');
    else if (model) lines.push(`Model: ${model}`);
    if (state.editing) lines.push('Editing: yes');
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

  // Collapse leftover blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/** True when the row is an internal booking-bot state dump (not a customer-facing text). */
export function isBookingBotStateMessage(body: string | null | undefined): boolean {
  return String(body || '').startsWith(BOOKING_BOT_STATE_PREFIX);
}

/** Free-form text/PDF allowed if last inbound was within 24 hours. */
export function isWithinCustomerServiceWindow(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < MS_24H;
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
