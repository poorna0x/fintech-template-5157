/**
 * In-session (24h) WhatsApp booking bot — reply buttons + lists + location.
 *
 * Hi → Book service | Call back | Talk to team
 * Book → Repair/Service | Installation | Custom → (name if new) → location →
 *   date list → time list → purifier photo → confirm → customer + PENDING job
 *
 * Customer messages stay simple (no lead source / CRM jargon).
 * Internal job still stores lead_source Direct call for admin.
 */
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
} = require('./whatsapp-helper');
const {
  ELEVEN_SUPPORT_DISPLAY,
  sendElevenSupportButtons,
  handleElevenSupportButton,
} = require('./whatsapp-eleven-support');
const { enrichWhatsAppLocation } = require('./whatsapp-location-enrich');

const SUPPORT_PHONE_DISPLAY = ELEVEN_SUPPORT_DISPLAY;
const LEAD_SOURCE = 'Direct call';
const BRAND_LABEL = 'Eleven RO';
const STATE_PREFIX = '[Booking bot state]';
/** Must match whatsapp-unsolicited-media.js so photo step is allowed. */
const AWAITING_CUSTOMER_MEDIA_MARKER = '[Awaiting customer media]';
const POST_BOOKING_REDIRECT_MARKER = '[Post-booking human redirect]';

/** Steps where the customer is still mid-flow (not “after booking”). */
const ACTIVE_BOOKING_STEPS = new Set([
  'await_name',
  'await_location',
  'await_loc_confirm',
  'await_date',
  'await_period',
  'await_time',
  'await_custom_time',
  'await_model_or_photo',
  'await_service_type',
  'await_custom_note',
  'await_confirm',
  'await_edit_menu',
]);

const GREETING_RE =
  /^(hi+|hii+|hello|hey|hola|namaste|book|booking|service|start|menu)\b/i;
const EDIT_RE = /^(edit|change|update|modify)\b/i;

const TIME_SLOTS = {
  '9-AM': { slot: 'MORNING', label: '9:00 AM', period: 'morning' },
  '10-AM': { slot: 'MORNING', label: '10:00 AM', period: 'morning' },
  '11-AM': { slot: 'MORNING', label: '11:00 AM', period: 'morning' },
  '12-PM': { slot: 'AFTERNOON', label: '12:00 PM', period: 'afternoon' },
  '1-PM': { slot: 'AFTERNOON', label: '1:00 PM', period: 'afternoon' },
  '2-PM': { slot: 'AFTERNOON', label: '2:00 PM', period: 'afternoon' },
  '3-PM': { slot: 'EVENING', label: '3:00 PM', period: 'evening' },
  '4-PM': { slot: 'EVENING', label: '4:00 PM', period: 'evening' },
  '5-PM': { slot: 'EVENING', label: '5:00 PM', period: 'evening' },
};

/** First step after date: period with frame, or custom. */
const TIME_PERIODS = {
  period_morning: {
    key: 'morning',
    label: 'Morning',
    frame: '9:00 AM – 12:00 PM',
    slot: 'MORNING',
  },
  period_afternoon: {
    key: 'afternoon',
    label: 'Afternoon',
    frame: '12:00 PM – 3:00 PM',
    slot: 'AFTERNOON',
  },
  period_evening: {
    key: 'evening',
    label: 'Evening',
    frame: '3:00 PM – 5:00 PM',
    slot: 'EVENING',
  },
};

const SERVICE_CHOICES = {
  svc_repair: { label: 'Repair / Service', subType: 'Repair' },
  svc_install: { label: 'Installation', subType: 'Installation' },
  svc_custom: { label: 'Custom', subType: 'Service' },
};

function timeLabelFromState(state) {
  if (state?.customTimeLabel) return state.customTimeLabel;
  if (state?.slotKey && TIME_SLOTS[state.slotKey]) return TIME_SLOTS[state.slotKey].label;
  return state?.slotKey ? String(state.slotKey).replace(/-/g, ' ') : '';
}

/** Current calendar date + minutes-from-midnight in Asia/Kolkata. */
function getIstNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour === '24' ? 0 : parts.hour);
  return {
    dateIso: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

/** Slot key like 10-AM / 2-PM → minutes from midnight IST. */
function slotStartMinutes(slotKey) {
  const m = String(slotKey || '').match(/^(\d{1,2})-(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[2].toUpperCase();
  if (ap === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return h * 60;
}

/** True if this fixed slot is still bookable for dateIso (future days always OK). */
function isSlotAvailableOnDate(dateIso, slotKey) {
  if (!dateIso || !slotKey || slotKey === 'CUSTOM') return true;
  const now = getIstNow();
  if (dateIso > now.dateIso) return true;
  if (dateIso < now.dateIso) return false;
  const start = slotStartMinutes(slotKey);
  if (start == null) return true;
  return start > now.minutes;
}

function periodHasAvailableSlots(dateIso, periodKey) {
  return Object.entries(TIME_SLOTS).some(
    ([key, meta]) => meta.period === periodKey && isSlotAvailableOnDate(dateIso, key)
  );
}

/** After 5 PM IST today there are no remaining fixed slots. */
function dateHasAnyAvailableSlot(dateIso) {
  return Object.keys(TIME_SLOTS).some((key) => isSlotAvailableOnDate(dateIso, key));
}

function isCustomTimeStillAllowed(dateIso) {
  const now = getIstNow();
  if (!dateIso || dateIso > now.dateIso) return true;
  if (dateIso < now.dateIso) return false;
  // Allow custom only while before end of window (5:00 PM).
  return now.minutes < slotStartMinutes('5-PM');
}

/** Parse "10:30 AM" / "14:00" → minutes; null if unparseable. */
function parseCustomTimeToMinutes(text) {
  const t = String(text || '').trim();
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const ap = m[3].toUpperCase();
    if (ap === 'AM') {
      if (h === 12) h = 0;
    } else if (h !== 12) {
      h += 12;
    }
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  return null;
}

function isCustomTimeAvailableOnDate(dateIso, text) {
  const mins = parseCustomTimeToMinutes(text);
  if (mins == null) return { ok: false, reason: 'format' };
  const windowStart = slotStartMinutes('9-AM');
  const windowEnd = slotStartMinutes('5-PM');
  if (mins < windowStart || mins > windowEnd) {
    return { ok: false, reason: 'window' };
  }
  const now = getIstNow();
  if (dateIso < now.dateIso) return { ok: false, reason: 'past' };
  if (dateIso === now.dateIso && mins <= now.minutes) {
    return { ok: false, reason: 'past' };
  }
  return { ok: true, minutes: mins };
}

function phone10FromE164(e164) {
  return String(e164 || '')
    .replace(/\D/g, '')
    .slice(-10);
}

function istDateLabel(offsetDays) {
  const d = new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  const weekday = ist.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
  const day = ist.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return `${weekday} ${day}`;
}

function dateId(offsetDays) {
  const d = new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `date_${y}-${m}-${day}`;
}

function parseDateId(id) {
  const m = String(id || '').match(/^date_(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

function formatDateIsoLabel(dateIso) {
  try {
    const d = new Date(`${dateIso}T12:00:00+05:30`);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return String(dateIso || '');
  }
}

function serviceLabelFromState(state) {
  if (state?.serviceLabel) return state.serviceLabel;
  if (state?.customNote) return `Custom: ${String(state.customNote).slice(0, 40)}`;
  if (state?.serviceSubType === 'Repair') return 'Repair / Service';
  if (state?.serviceSubType === 'Installation') return 'Installation';
  return state?.serviceSubType || 'Service';
}

function generateJobNumber(serviceType = 'RO') {
  const prefix = String(serviceType || 'RO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'RO';
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${year}-${timestamp}`;
}

function formatAddressLine(customer) {
  if (!customer) return '';
  if (customer.visible_address) return String(customer.visible_address).trim().slice(0, 160);
  const loc = customer.location && typeof customer.location === 'object' ? customer.location : {};
  if (loc.formattedAddress) return String(loc.formattedAddress).trim().slice(0, 160);
  const a = customer.address && typeof customer.address === 'object' ? customer.address : {};
  const line = [a.street, a.area, a.landmark, a.city, a.pincode].filter(Boolean).join(', ');
  return line.slice(0, 160);
}

/** Customer-facing location — prefer shared pin address over stale CRM defaults. */
function formatServiceLocationLine(state, customer, locOverride) {
  const pin =
    state?.loc ||
    (locOverride && (locOverride.lat != null || locOverride.address || locOverride.name)
      ? {
          lat: locOverride.lat,
          lng: locOverride.lng,
          name: locOverride.name,
          address: locOverride.address,
          shortLocation: locOverride.shortLocation,
          formattedAddress: locOverride.formattedAddress,
        }
      : null);

  if (pin) {
    const short = String(pin.shortLocation || '').trim();
    const address = String(pin.address || pin.formattedAddress || '').trim();
    const name = String(pin.name || '').trim();
    if (short && address && !address.toLowerCase().includes(short.toLowerCase())) {
      return `${short} — ${address}`.slice(0, 180);
    }
    if (short && name && name.toLowerCase() !== short.toLowerCase()) {
      return `${short} — ${name}`.slice(0, 180);
    }
    if (short) return short.slice(0, 180);
    if (address && name && address.toLowerCase() !== name.toLowerCase()) {
      return `${name}, ${address}`.slice(0, 180);
    }
    if (address) return address.slice(0, 180);
    if (name) return name.slice(0, 180);
    if (pin.lat != null && pin.lng != null) {
      return 'Location shared via WhatsApp pin';
    }
  }

  const fromCustomer = formatAddressLine(customer);
  if (fromCustomer) return fromCustomer;
  return '';
}

function buildServiceAddress(customer, locOverride) {
  if (locOverride?.address || locOverride?.name || locOverride?.shortLocation) {
    return {
      street: locOverride.address || locOverride.formattedAddress || locOverride.name || '',
      area: locOverride.shortLocation || '',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '',
      landmark: locOverride.name || locOverride.shortLocation || '',
    };
  }
  const a = customer?.address && typeof customer.address === 'object' ? customer.address : {};
  return {
    street: a.street || customer?.visible_address || '',
    area: a.area || customer?.visible_address || '',
    city: a.city || 'Bangalore',
    state: a.state || 'Karnataka',
    pincode: a.pincode || '',
    landmark: a.landmark || '',
  };
}

function buildServiceLocation(customer, locOverride) {
  if (locOverride?.lat != null && locOverride?.lng != null) {
    const lat = Number(locOverride.lat);
    const lng = Number(locOverride.lng);
    return {
      latitude: lat,
      longitude: lng,
      formattedAddress:
        locOverride.formattedAddress ||
        locOverride.address ||
        locOverride.name ||
        `${lat},${lng}`,
      googleLocation: `https://www.google.com/maps/place/${lat},${lng}`,
      shortLocation: locOverride.shortLocation || null,
    };
  }
  const loc = customer?.location && typeof customer.location === 'object' ? customer.location : {};
  if (loc.latitude != null && loc.longitude != null) {
    return {
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      formattedAddress: loc.formattedAddress || formatAddressLine(customer),
      googleLocation:
        loc.googleLocation ||
        `https://www.google.com/maps/place/${loc.latitude},${loc.longitude}`,
    };
  }
  return {
    latitude: 0,
    longitude: 0,
    formattedAddress: formatAddressLine(customer) || '',
    googleLocation: null,
  };
}

function extractInteractiveReply(msg) {
  if (String(msg?.type) === 'interactive') {
    const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
    if (reply) {
      return {
        id: String(reply.id || '').trim(),
        title: String(reply.title || reply.id || '').trim(),
      };
    }
  }
  if (String(msg?.type) === 'button') {
    return {
      id: String(msg.button?.payload || msg.button?.text || '').trim(),
      title: String(msg.button?.text || msg.button?.payload || '').trim(),
    };
  }
  return null;
}

async function persistOutbound(db, phone, waId, msgType, body, result) {
  await insertWhatsAppMessage(db, {
    wa_message_id: waId,
    direction: 'outbound',
    phone_e164: phone,
    msg_type: msgType,
    body,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.data?.error?.message || 'send failed',
    sent_by_user_id: null,
  });
}

async function sendButtons({ phoneNumberId, accessToken, db, to, bodyText, buttons, footer }) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken) return { ok: false };
  const rows = (buttons || []).slice(0, 3).map((b) => ({
    type: 'reply',
    reply: {
      id: String(b.id).slice(0, 256),
      title: String(b.title).slice(0, 20),
    },
  }));
  if (!rows.length) return { ok: false };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: String(bodyText || '').slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: { buttons: rows },
    },
  };

  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  const label = `${bodyText} [${rows.map((r) => r.reply.title).join(' | ')}]`;
  await persistOutbound(db, phone, waId, 'interactive', label, result);
  return { ok: result.ok, error: result.data?.error?.message };
}

/** Interactive list (up to 10 rows) — better date/time pickers. */
async function sendList({
  phoneNumberId,
  accessToken,
  db,
  to,
  bodyText,
  buttonText,
  sectionTitle,
  rows,
  footer,
}) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken) return { ok: false };
  const listRows = (rows || []).slice(0, 10).map((r) => ({
    id: String(r.id).slice(0, 200),
    title: String(r.title).slice(0, 24),
    ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
  }));
  if (!listRows.length) return { ok: false };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: String(bodyText || '').slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        button: String(buttonText || 'Select').slice(0, 20),
        sections: [
          {
            title: String(sectionTitle || 'Options').slice(0, 24),
            rows: listRows,
          },
        ],
      },
    },
  };

  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  const label = `${bodyText} [list: ${listRows.map((r) => r.title).join(' | ')}]`;
  await persistOutbound(db, phone, waId, 'interactive', label, result);
  return { ok: result.ok, error: result.data?.error?.message };
}

/** Ask customer to share GPS pin (24h window only). */
async function sendLocationRequest({ phoneNumberId, accessToken, db, to, bodyText }) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken) return { ok: false };
  const text =
    bodyText ||
    'Please share your location so our technician can find you easily.\n\nTap *Send location* below.';
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: { text: String(text).slice(0, 1024) },
      action: { name: 'send_location' },
    },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(
    db,
    phone,
    waId,
    'interactive',
    `[Location request] ${text}`,
    result
  );
  return { ok: result.ok, error: result.data?.error?.message };
}

/** CTA URL button (e.g. Book online) — in-session. */
async function sendCtaUrl({ phoneNumberId, accessToken, db, to, bodyText, displayText, url }) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken || !url) return { ok: false };
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: String(bodyText || '').slice(0, 1024) },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: String(displayText || 'Open').slice(0, 20),
          url: String(url),
        },
      },
    },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(
    db,
    phone,
    waId,
    'interactive',
    `[CTA ${displayText}] ${bodyText}`,
    result
  );
  return { ok: result.ok, error: result.data?.error?.message };
}

async function sendText({ phoneNumberId, accessToken, db, to, text }) {
  const phone = normalizePhoneE164(to);
  if (!phone || !text) return { ok: false };
  // Keep media-await marker in DB for unsolicited-media guard; strip from customer WA body.
  const raw = String(text);
  const forCustomer = raw
    .replace(AWAITING_CUSTOMER_MEDIA_MARKER, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { preview_url: true, body: forCustomer.slice(0, 4096) },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(db, phone, waId, 'text', raw, result);
  return { ok: result.ok };
}

async function isBookingBotEnabled(db) {
  if (!db) return true;
  try {
    const { data } = await db
      .from('whatsapp_crm_settings')
      .select('enabled, allow_booking_bot')
      .eq('id', 1)
      .maybeSingle();
    if (!data) return true;
    if (data.enabled === false) return false;
    if (data.allow_booking_bot === false) return false;
    return true;
  } catch {
    return true;
  }
}

async function lookupCustomerFull(db, phoneE164) {
  if (!db) return null;
  const phone = phone10FromE164(phoneE164);
  if (phone.length < 10) return null;

  try {
    const { data, error } = await db.rpc('get_customer_by_phone_for_booking', {
      p_phone: phone,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) return row;
    } else {
      console.warn('[whatsapp-booking-bot] customer rpc failed:', error.message);
    }
  } catch (err) {
    console.warn('[whatsapp-booking-bot] customer rpc threw:', err?.message || err);
  }

  const { data: customer } = await db
    .from('customers')
    .select(
      'id,full_name,phone,address,location,visible_address,brand,model,service_type'
    )
    .or(`phone.like.%${phone},alternate_phone.like.%${phone}`)
    .limit(1)
    .maybeSingle();
  return customer || null;
}

async function rememberSharedLocation(db, phone, loc) {
  await insertWhatsAppMessage(db, {
    direction: 'outbound',
    phone_e164: phone,
    msg_type: 'text',
    body: `[Booking bot loc]${JSON.stringify({
      lat: loc.latitude,
      lng: loc.longitude,
      name: loc.name || null,
      address: loc.address || null,
      shortLocation: loc.shortLocation || null,
      formattedAddress: loc.formattedAddress || loc.address || null,
    })}`,
    status: 'sent',
  });
}

async function getRememberedLocation(db, phone) {
  if (!db || !phone) return null;
  try {
    const { data } = await db
      .from('whatsapp_messages')
      .select('body, created_at')
      .eq('phone_e164', phone)
      .eq('direction', 'outbound')
      .like('body', '[Booking bot loc]%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = String(data?.body || '');
    const m = raw.match(/^\[Booking bot loc\](.+)$/s);
    if (!m) return null;
    const parsed = JSON.parse(m[1]);
    if (parsed?.lat == null || parsed?.lng == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setBookingState(db, phone, state) {
  if (!db || !phone || !state) return;
  await insertWhatsAppMessage(db, {
    direction: 'outbound',
    phone_e164: phone,
    msg_type: 'text',
    body: `${STATE_PREFIX}${JSON.stringify(state)}`,
    status: 'sent',
  });
}

async function getBookingState(db, phone) {
  if (!db || !phone) return null;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('whatsapp_messages')
      .select('body, created_at')
      .eq('phone_e164', phone)
      .eq('direction', 'outbound')
      .like('body', `${STATE_PREFIX}%`)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = String(data?.body || '');
    if (!raw.startsWith(STATE_PREFIX)) return null;
    return JSON.parse(raw.slice(STATE_PREFIX.length));
  } catch {
    return null;
  }
}

async function clearBookingState(db, phone) {
  await setBookingState(db, phone, { step: 'idle' });
}

function isValidPersonName(text) {
  const t = String(text || '').trim();
  if (t.length < 2 || t.length > 80) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return /[a-zA-Z\u0900-\u097F]/.test(t);
}

async function createCustomerFromDraft(db, phoneE164, draft) {
  const phone10 = phone10FromE164(phoneE164);
  const loc = draft.loc || {};
  const addressLine = String(loc.address || loc.formattedAddress || loc.name || '').trim();
  const shortLoc = String(loc.shortLocation || '').trim() || null;
  const address = {
    street: addressLine || '',
    area: shortLoc || '',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '',
    landmark: String(loc.name || shortLoc || '').trim() || '',
  };
  const location =
    loc.lat != null && loc.lng != null
      ? {
          latitude: Number(loc.lat),
          longitude: Number(loc.lng),
          formattedAddress: addressLine || `${loc.lat},${loc.lng}`,
          googleLocation: `https://www.google.com/maps/place/${loc.lat},${loc.lng}`,
          shortLocation: shortLoc,
        }
      : {};

  const photos = draft.photoUrl
    ? [{ url: draft.photoUrl, source: 'whatsapp_bot', kind: 'unit' }]
    : [];

  const { data, error } = await db.rpc('create_customer_for_booking', {
    p_row: {
      full_name: String(draft.name || 'Customer').trim() || 'Customer',
      phone: phone10,
      email: '',
      address,
      location,
      visible_address: shortLoc || addressLine || null,
      service_type: 'RO',
      brand: draft.brand || 'Not specified',
      model: draft.model || 'Not specified',
      status: 'ACTIVE',
      preferred_language: 'ENGLISH',
      photos,
    },
  });
  if (error) {
    // Already exists — look up and continue
    if (/already exists/i.test(error.message || '')) {
      const existing = await lookupCustomerFull(db, phoneE164);
      if (existing?.id) return { ok: true, customer: existing };
    }
    console.error('[whatsapp-booking-bot] create_customer_for_booking failed:', error.message);
    return { ok: false, error: error.message };
  }
  const customer = Array.isArray(data) ? data[0] : data;
  return { ok: true, customer };
}

async function createAutoBookingJob(db, {
  phoneE164,
  customer,
  dateIso,
  slotKey,
  locOverride,
  photoUrl,
  modelOverride,
  serviceSubType,
  customNote,
  customTimeLabel,
  periodSlot,
}) {
  const phone10 = phone10FromE164(phoneE164);
  const known = TIME_SLOTS[slotKey];
  const timeMeta = known
    ? { slot: known.slot, label: customTimeLabel || known.label }
    : {
        slot: periodSlot || 'CUSTOM',
        label: customTimeLabel || String(slotKey || '').replace(/-/g, ' ') || 'TBD',
      };
  const serviceType = customer.service_type || 'RO';
  const subType = String(serviceSubType || 'Service').trim() || 'Service';
  const jobNumber = generateJobNumber(serviceType);
  const service_address = buildServiceAddress(customer, locOverride);
  const service_location = buildServiceLocation(customer, locOverride);
  const before_photos = photoUrl ? [photoUrl] : [];
  const model =
    (modelOverride && String(modelOverride).trim()) ||
    customer.model ||
    'Not specified';
  const noteBit = customNote ? ` · ${String(customNote).slice(0, 120)}` : '';

  const row = {
    job_number: jobNumber,
    customer_id: customer.id,
    service_type: serviceType,
    service_sub_type: subType,
    brand: customer.brand || 'Not specified',
    model,
    scheduled_date: dateIso,
    scheduled_time_slot: timeMeta.slot,
    estimated_duration: 120,
    service_address,
    service_location,
    description: `WhatsApp booking · ${subType} · ${timeMeta.label}${noteBit}`,
    requirements: [
      {
        lead_source: LEAD_SOURCE,
        custom_time: timeMeta.label,
        booking_channel: 'whatsapp_bot',
        ...(customNote ? { custom_note: String(customNote).slice(0, 200) } : {}),
      },
    ],
    estimated_cost: 0,
    payment_status: 'PENDING',
    before_photos,
  };

  const { data, error } = await db.rpc('create_job_for_booking', {
    p_phone: phone10,
    p_row: row,
  });
  if (error) {
    console.error('[whatsapp-booking-bot] create_job_for_booking failed:', error.message);
    return { ok: false, error: error.message };
  }
  const job = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    job,
    jobNumber: job?.job_number || jobNumber,
    timeLabel: timeMeta.label,
  };
}

async function notifyOwnerBestEffort(customer, phoneE164, dateIso, timeLabel, jobNumber, serviceSubType) {
  try {
    const { sendBookingAdminNotification } = require('./booking-notify');
    await sendBookingAdminNotification({
      customerName: customer?.full_name || '',
      phone: phone10FromE164(phoneE164),
      brandSource: 'elevenro',
      bookingDomain: 'whatsapp',
      serviceType: customer?.service_type || 'RO',
      serviceSubType: serviceSubType || 'Service',
      scheduledDate: dateIso,
      scheduledTimeSlot: timeLabel,
      customTime: timeLabel,
      jobNumber,
    });
  } catch (err) {
    console.warn('[whatsapp-booking-bot] owner notify skipped:', err?.message || err);
  }
}

async function sendGreetingMenu(ctx, { isNew } = {}) {
  const body = isNew
    ? `Hi! Welcome to ${BRAND_LABEL} 💧\n\nHow can we help you today?`
    : `Hi! Welcome to ${BRAND_LABEL} 💧\n\nHow can we help you today?`;
  return sendButtons({
    ...ctx,
    bodyText: body,
    footer: BRAND_LABEL,
    buttons: [
      { id: 'book_service', title: 'Book service' },
      { id: 'call_back', title: 'Call back' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function askServiceType(ctx, state = {}) {
  // Phone already in CRM → confirm identity before collecting job details (unless already confirmed).
  if (!state.existingCustomerId && !state.editing) {
    const existing = await lookupCustomerFull(ctx.db, ctx.to);
    if (existing?.id) {
      await sendIdentityConfirm(ctx, existing);
      return;
    }
  }
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_service_type' });
  return sendButtons({
    ...ctx,
    bodyText: 'What do you need help with?',
    footer: 'Choose one',
    buttons: [
      { id: 'svc_repair', title: 'Repair / Service' },
      { id: 'svc_install', title: 'Installation' },
      { id: 'svc_custom', title: 'Custom' },
    ],
  });
}

async function startNewCustomerBooking(ctx, state = {}) {
  const existing = await lookupCustomerFull(ctx.db, ctx.to);
  if (existing?.id) {
    await sendIdentityConfirm(ctx, existing);
    return;
  }
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_name' });
  await sendText({
    ...ctx,
    text: `Please reply with your *full name*.`,
  });
}

async function continueAfterServiceType(ctx, state) {
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  if (state?.existingCustomerId || customer?.id) {
    if (state?.existingCustomerId && !state?.loc && state?.needNewLocation) {
      await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_location' });
      await sendLocationRequest({
        ...ctx,
        bodyText: 'Please share the correct location for this visit.',
      });
      return;
    }
    await sendDatePicker(ctx, state);
    return;
  }
  await startNewCustomerBooking(ctx, state);
}

async function askLocationForNew(ctx, state) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_location' });
  await sendLocationRequest({
    ...ctx,
    bodyText:
      'Thanks! Please share your *service location*.\n\nTap *Send location* below.',
  });
}

async function askLocConfirm(ctx, state, locSummary) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_loc_confirm' });
  const short = state?.loc?.shortLocation ? `*Area:* ${state.loc.shortLocation}\n` : '';
  const locLine = formatServiceLocationLine(state) || locSummary || 'Shared pin';
  await sendButtons({
    ...ctx,
    bodyText: `Location received:\n${short}*${locLine}*\n\nIs this correct?`,
    footer: 'Confirm location',
    buttons: [
      { id: 'loc_yes', title: 'Yes, correct' },
      { id: 'loc_no', title: 'No, resend' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function sendDatePicker(ctx, state) {
  if (state) await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_date' });
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const id = dateId(i);
    const iso = parseDateId(id);
    if (i === 0 && iso && !dateHasAnyAvailableSlot(iso) && !isCustomTimeStillAllowed(iso)) {
      continue; // Today fully past — skip
    }
    const label = istDateLabel(i);
    rows.push({
      id,
      title: (i === 0 ? `Today · ${label.split(' ').slice(1).join(' ')}` : label).slice(0, 24),
      description: i === 0 ? 'Earliest available' : i === 1 ? 'Tomorrow' : undefined,
    });
  }
  return sendList({
    ...ctx,
    bodyText: 'Pick a date for the visit:',
    buttonText: 'Choose date',
    sectionTitle: 'Next 7 days',
    footer: BRAND_LABEL,
    rows,
  });
}

async function sendPeriodPicker(ctx, dateIso, state) {
  if (state) {
    await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_period', dateIso });
  }

  const rows = [];
  for (const [periodId, meta] of Object.entries(TIME_PERIODS)) {
    if (!periodHasAvailableSlots(dateIso, meta.key)) continue;
    rows.push({
      id: `${periodId}__${dateIso}`,
      title: meta.label,
      description: meta.frame,
    });
  }
  if (isCustomTimeStillAllowed(dateIso)) {
    rows.push({
      id: `period_custom__${dateIso}`,
      title: 'Custom time',
      description: 'Type a time between 9 AM – 5 PM',
    });
  }

  if (!rows.length) {
    await sendText({
      ...ctx,
      text: `No time slots left for *${formatDateIsoLabel(dateIso)}*. Please pick another date.`,
    });
    await sendDatePicker(ctx, state || { dateIso });
    return { ok: false };
  }

  return sendList({
    ...ctx,
    bodyText: `Date: *${formatDateIsoLabel(dateIso)}*\n\nChoose a time of day:`,
    buttonText: 'Choose period',
    sectionTitle: 'Time of day',
    footer: 'Past times hidden',
    rows,
  });
}

async function sendTimePicker(ctx, dateIso, state, periodKey) {
  const period = periodKey || state?.periodKey || 'morning';
  const periodMeta =
    Object.values(TIME_PERIODS).find((p) => p.key === period) || TIME_PERIODS.period_morning;
  if (state) {
    await setBookingState(ctx.db, ctx.to, {
      ...state,
      step: 'await_time',
      dateIso,
      periodKey: period,
      periodSlot: periodMeta.slot,
    });
  }
  const rows = Object.entries(TIME_SLOTS)
    .filter(([, meta]) => meta.period === period)
    .filter(([key]) => isSlotAvailableOnDate(dateIso, key))
    .map(([key, meta]) => ({
      id: `time__${key}__${dateIso}`,
      title: meta.label,
      description: periodMeta.frame,
    }));
  if (isCustomTimeStillAllowed(dateIso)) {
    rows.push({
      id: `time__CUSTOM__${dateIso}`,
      title: 'Custom time',
      description: 'Type your preferred time',
    });
  }

  if (!rows.length) {
    await sendText({
      ...ctx,
      text: `No *${periodMeta.label}* slots left for *${formatDateIsoLabel(dateIso)}*. Please choose another time of day.`,
    });
    await sendPeriodPicker(ctx, dateIso, state || { dateIso });
    return { ok: false };
  }

  return sendList({
    ...ctx,
    bodyText: `Date: *${formatDateIsoLabel(dateIso)}*\n*${periodMeta.label}* (${periodMeta.frame})\n\nPick a time:`,
    buttonText: 'Choose time',
    sectionTitle: periodMeta.label,
    footer: 'Past times hidden',
    rows,
  });
}

async function askCustomTime(ctx, state) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_custom_time' });
  await sendText({
    ...ctx,
    text: 'Please reply with your preferred time between *9:00 AM and 5:00 PM* (e.g. 10:30 AM).',
  });
}

async function askPurifierPhoto(ctx, state) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_model_or_photo' });
  await sendText({
    ...ctx,
    text:
      'Please *send a photo of your purifier* to continue.\n\n(Photo is required.)\n\n' +
      AWAITING_CUSTOMER_MEDIA_MARKER,
  });
}

function buildBookingSummaryLines(state, customer) {
  const timeLabel = timeLabelFromState(state);
  const name = state.name || customer?.full_name || '';
  const loc = formatServiceLocationLine(state, customer);
  const existing = Boolean(state?.existingCustomerId || customer?.id);
  const lines = [
    existing
      ? 'Please confirm — we’ll add this *job* to your existing account:'
      : 'Please confirm your booking details:',
    '',
  ];
  if (name) lines.push(`*Name:* ${name}`);
  lines.push(`*Service:* ${serviceLabelFromState(state)}`);
  if (state.dateIso) lines.push(`*Date:* ${formatDateIsoLabel(state.dateIso)}`);
  if (timeLabel) lines.push(`*Time:* ${timeLabel}`);
  if (loc) lines.push(`*Location:* ${loc}`);
  else if (existing && formatAddressLine(customer)) {
    lines.push(`*Location:* ${formatAddressLine(customer)}`);
  }
  if (state.photoUrl) lines.push('*Photo:* Received');
  return lines.join('\n');
}

async function sendNewCustomerConfirm(ctx, state) {
  let customer = null;
  if (state?.existingCustomerId) {
    customer = await lookupCustomerFull(ctx.db, ctx.to);
  }
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_confirm', editing: false });
  return sendButtons({
    ...ctx,
    bodyText: buildBookingSummaryLines(state, customer),
    footer: state?.existingCustomerId ? 'Add job only' : 'Almost done',
    buttons: [
      { id: 'confirm_new', title: 'Yes, book now' },
      { id: 'edit_details', title: 'Edit details' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function sendIdentityConfirm(ctx, customer) {
  const name = String(customer.full_name || 'this customer').trim() || 'this customer';
  const loc = formatAddressLine(customer) || 'your saved address';
  return sendButtons({
    ...ctx,
    bodyText: [
      `We found this number in our records.`,
      '',
      `Is this booking for *${name}* at:`,
      `*Location:* ${loc}`,
      '',
      'Tap *Yes* to continue — we’ll only add a new *job* (no new customer).',
    ].join('\n'),
    footer: 'Confirm account',
    buttons: [
      { id: 'identity_yes', title: "Yes, that's me" },
      { id: 'identity_no', title: 'No / new address' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function sendConfirm(ctx, dateIso, slotKey, customer, state = {}) {
  const merged = { ...state, dateIso, slotKey, name: state.name || customer?.full_name };
  return sendButtons({
    ...ctx,
    bodyText: buildBookingSummaryLines(merged, customer),
    footer: 'Almost done',
    buttons: [
      { id: `confirm__${dateIso}__${slotKey}`.slice(0, 256), title: 'Yes, book now' },
      { id: 'edit_details', title: 'Edit details' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function afterLocationSharedLegacy(ctx, locSummary) {
  await sendText({
    ...ctx,
    text: `Location received${locSummary ? `:\n${locSummary}` : '.'}\n\nThank you.`,
  });
  await sendButtons({
    ...ctx,
    bodyText: 'Continue booking a visit?',
    footer: 'Next step',
    buttons: [
      { id: 'pick_date', title: 'Pick date & time' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

function customerBookedMessage({
  name,
  serviceLabel,
  dateIso,
  timeLabel,
  locationLine,
  hasPhoto,
  updated,
}) {
  const lines = [
    updated
      ? 'Your booking details have been updated.'
      : 'Thank you — your service visit is confirmed.',
    '',
  ];
  if (name) lines.push(`*Name:* ${name}`);
  if (serviceLabel) lines.push(`*Service:* ${serviceLabel}`);
  if (dateIso) lines.push(`*Date:* ${formatDateIsoLabel(dateIso)}`);
  if (timeLabel) lines.push(`*Time:* ${timeLabel}`);
  if (locationLine) lines.push(`*Location:* ${locationLine}`);
  if (hasPhoto) lines.push('*Photo:* Received');
  lines.push('');
  lines.push(
    updated
      ? 'Our team has been informed and will follow up on this chat if needed.'
      : 'Our team will assign a technician and keep you updated on this chat.'
  );
  return lines.join('\n');
}

async function sendBookedConfirmation(ctx, state, { updated } = {}) {
  const next = {
    ...state,
    step: 'await_post_book',
    editing: false,
    editReturn: 'post_book',
  };
  await setBookingState(ctx.db, ctx.to, next);
  const locationLine = formatServiceLocationLine(next);
  await sendText({
    ...ctx,
    text: customerBookedMessage({
      name: next.name,
      serviceLabel: serviceLabelFromState(next),
      dateIso: next.dateIso,
      timeLabel: timeLabelFromState(next) || next.timeLabel,
      locationLine,
      hasPhoto: Boolean(next.photoUrl),
      updated: Boolean(updated),
    }),
  });
  return sendButtons({
    ...ctx,
    bodyText: updated
      ? 'Please confirm your updated details:'
      : 'Please confirm — is everything correct?',
    footer: BRAND_LABEL,
    buttons: [
      { id: 'all_correct', title: 'All correct' },
      { id: 'edit_details', title: 'Edit details' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function sendEditMenu(ctx, state) {
  const editReturn =
    state?.step === 'await_post_book' || state?.jobNumber || state?.editReturn === 'post_book'
      ? 'post_book'
      : 'confirm';
  await setBookingState(ctx.db, ctx.to, {
    ...state,
    step: 'await_edit_menu',
    editing: true,
    editReturn,
  });
  return sendList({
    ...ctx,
    bodyText: 'What would you like to update?',
    buttonText: 'Choose',
    sectionTitle: 'Edit booking',
    footer: BRAND_LABEL,
    rows: [
      { id: 'edit_name', title: 'Name', description: 'Change customer name' },
      { id: 'edit_location', title: 'Location', description: 'Share a new location pin' },
      { id: 'edit_datetime', title: 'Date & time', description: 'Reschedule the visit' },
      { id: 'edit_photo', title: 'Purifier photo', description: 'Send a new photo' },
      { id: 'edit_service', title: 'Service type', description: 'Repair, installation, custom' },
    ],
  });
}

async function resumeAfterEdit(ctx, state) {
  const next = { ...state, editing: false };
  if (state?.editReturn === 'post_book' || state?.jobNumber) {
    const persisted = await persistBookingEditsToCrm(ctx.db, next);
    await insertWhatsAppMessage(ctx.db, {
      direction: 'outbound',
      phone_e164: ctx.to,
      msg_type: 'text',
      body: `[Booking bot] Customer edited booking${state.jobNumber ? ` ${state.jobNumber}` : ''}: ${serviceLabelFromState(next)} · ${next.dateIso || ''} ${timeLabelFromState(next)} · ${formatServiceLocationLine(next)}${next.photoUrl ? ' · photo updated' : ''}${persisted.ok ? '' : ` · CRM sync: ${persisted.error || 'failed'}`}`,
      status: 'sent',
      customer_id: next.customerId || null,
    });
    await sendBookedConfirmation(ctx, next, { updated: true });
    return;
  }
  await sendNewCustomerConfirm(ctx, next);
}

/**
 * Push post-book edits into jobs + customers so CRM/app shows the new photo etc.
 */
async function persistBookingEditsToCrm(db, state) {
  if (!db || (!state?.jobNumber && !state?.jobId && !state?.customerId)) {
    return { ok: false, error: 'missing job/customer' };
  }

  const errors = [];

  try {
    if (state.jobNumber || state.jobId) {
      const jobPatch = {};
      if (state.photoUrl) {
        jobPatch.before_photos = [state.photoUrl];
        jobPatch.images = [state.photoUrl];
      }
      if (state.dateIso) jobPatch.scheduled_date = state.dateIso;
      if (state.serviceSubType) jobPatch.service_sub_type = state.serviceSubType;

      const timeLabel = timeLabelFromState(state);
      const known = TIME_SLOTS[state.slotKey];
      if (known) {
        jobPatch.scheduled_time_slot = known.slot;
      } else if (state.periodSlot) {
        jobPatch.scheduled_time_slot = state.periodSlot;
      }

      if (state.loc?.lat != null && state.loc?.lng != null) {
        const locOverride = {
          lat: state.loc.lat,
          lng: state.loc.lng,
          name: state.loc.name,
          address: state.loc.address,
          shortLocation: state.loc.shortLocation,
          formattedAddress: state.loc.formattedAddress,
        };
        jobPatch.service_location = buildServiceLocation(null, locOverride);
        jobPatch.service_address = buildServiceAddress(null, locOverride);
      }

      if (timeLabel || state.customNote || state.serviceSubType) {
        jobPatch.description = `WhatsApp booking · ${state.serviceSubType || 'Service'} · ${timeLabel || ''}${
          state.customNote ? ` · ${String(state.customNote).slice(0, 120)}` : ''
        }`.trim();
      }

      if (Object.keys(jobPatch).length) {
        let q = db.from('jobs').update(jobPatch);
        if (state.jobId) q = q.eq('id', state.jobId);
        else q = q.eq('job_number', state.jobNumber);
        const { error } = await q;
        if (error) {
          console.error('[whatsapp-booking-bot] job photo/edit update failed:', error.message);
          errors.push(error.message);
        }
      }
    }

    if (state.customerId) {
      const custPatch = {};
      if (state.name) custPatch.full_name = String(state.name).trim();

      if (state.photoUrl) {
        try {
          const { data: cust } = await db
            .from('customers')
            .select('photos')
            .eq('id', state.customerId)
            .maybeSingle();
          const existing = Array.isArray(cust?.photos) ? cust.photos : [];
          const rest = existing.filter((p) => {
            const url = typeof p === 'string' ? p : p?.url;
            return url && url !== state.photoUrl;
          });
          custPatch.photos = [
            { url: state.photoUrl, source: 'whatsapp_bot', kind: 'unit' },
            ...rest,
          ].slice(0, 12);
        } catch (err) {
          custPatch.photos = [{ url: state.photoUrl, source: 'whatsapp_bot', kind: 'unit' }];
        }
      }

      if (state.loc?.lat != null && state.loc?.lng != null) {
        const addressLine = formatServiceLocationLine(state);
        const shortLoc = String(state.loc.shortLocation || '').trim() || null;
        custPatch.location = {
          latitude: Number(state.loc.lat),
          longitude: Number(state.loc.lng),
          formattedAddress:
            state.loc.formattedAddress ||
            state.loc.address ||
            addressLine ||
            `${state.loc.lat},${state.loc.lng}`,
          googleLocation: `https://www.google.com/maps/place/${state.loc.lat},${state.loc.lng}`,
          shortLocation: shortLoc,
        };
        custPatch.visible_address = shortLoc || addressLine || null;
        custPatch.address = {
          street: state.loc.address || state.loc.formattedAddress || addressLine || '',
          area: shortLoc || '',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '',
          landmark: state.loc.name || shortLoc || '',
        };
      }

      if (Object.keys(custPatch).length) {
        const { error } = await db.from('customers').update(custPatch).eq('id', state.customerId);
        if (error) {
          console.error('[whatsapp-booking-bot] customer photo/edit update failed:', error.message);
          errors.push(error.message);
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp-booking-bot] persistBookingEditsToCrm threw:', err?.message || err);
    return { ok: false, error: err?.message || 'persist failed' };
  }

  return { ok: errors.length === 0, error: errors[0] || null };
}

async function recentlyCompletedBotBooking(db, phoneE164) {
  if (!db || !phoneE164) return false;
  try {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('whatsapp_messages')
      .select('body')
      .eq('phone_e164', phoneE164)
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(25);
    for (const row of data || []) {
      const body = String(row.body || '');
      if (body.startsWith('[Booking bot] Job:')) return true;
      if (body.startsWith(STATE_PREFIX) && body.includes('"booking_complete"')) return true;
    }
  } catch (err) {
    console.warn('[whatsapp-booking-bot] recent booking check failed', err?.message || err);
  }
  return false;
}

function buildAdminHandoffPrefill({ customer, state, phoneE164 }) {
  const phone10 = phone10FromE164(phoneE164);
  const name = String(customer?.full_name || state?.name || '').trim();
  const loc =
    formatServiceLocationLine(state, customer) ||
    formatAddressLine(customer) ||
    '';
  const shortArea =
    String(state?.loc?.shortLocation || customer?.visible_address || '').trim() || '';
  const service = serviceLabelFromState(state || {}) || customer?.service_type || '';
  const lines = [
    'Hello Eleven RO team — customer needs help after WhatsApp booking.',
    '',
    `Phone: ${phone10}`,
  ];
  if (name) lines.push(`Name: ${name}`);
  if (state?.jobNumber) lines.push(`Job: ${state.jobNumber}`);
  if (service && service !== 'Service') lines.push(`Service: ${service}`);
  else if (state?.serviceSubType) lines.push(`Service: ${state.serviceSubType}`);
  if (state?.dateIso) {
    lines.push(
      `Visit: ${formatDateIsoLabel(state.dateIso)}${timeLabelFromState(state) ? ` · ${timeLabelFromState(state)}` : ''}`
    );
  }
  if (shortArea) lines.push(`Area: ${shortArea}`);
  if (loc && loc !== shortArea) lines.push(`Location: ${loc}`);
  else if (loc) lines.push(`Location: ${loc}`);
  lines.push('', 'Please assist.');
  return lines.join('\n').slice(0, 900);
}

async function sendPostBookingHumanRedirect(ctx, state = null) {
  const st = state || (await getBookingState(ctx.db, ctx.to)) || {};
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  const prefill = buildAdminHandoffPrefill({
    customer,
    state: st,
    phoneE164: ctx.to,
  });

  const bodyText = [
    'Thanks for your message.',
    '',
    'Your booking on this number is already in progress.',
    'Tap *Call us* to open the dialer, or *WhatsApp* to chat with our team (your details will be attached).',
  ].join('\n');

  await sendElevenSupportButtons({
    ...ctx,
    bodyText,
    footer: BRAND_LABEL,
  });
  // Keep prefill on state for WhatsApp button tap
  await setBookingState(ctx.db, ctx.to, {
    ...st,
    step: st.step || 'booking_complete',
    supportPrefill: prefill,
  });
  await insertWhatsAppMessage(ctx.db, {
    direction: 'outbound',
    phone_e164: ctx.to,
    msg_type: 'text',
    body: `${POST_BOOKING_REDIRECT_MARKER}\n${bodyText}`,
    status: 'sent',
    customer_id: customer?.id || st.customerId || null,
  });
  return { handled: true };
}

/**
 * Handle one inbound WhatsApp message for the booking bot.
 * @param {{ inboundMedia?: { media_url?: string|null } }} [extra]
 */
async function handleBookingBotInbound({
  db,
  accessToken,
  phoneNumberId,
  msg,
  inboundMedia = null,
}) {
  const enabled = await isBookingBotEnabled(db);
  if (!enabled) return { handled: false };

  const to = normalizePhoneE164(msg.from);
  if (!to) return { handled: false };

  const ctx = { db, accessToken, phoneNumberId, to };
  const interactive = extractInteractiveReply(msg);
  const text = String(msg.text?.body || '').trim();
  const state = await getBookingState(db, to);
  const msgType = String(msg.type || '');

  // After booking: free-form messages → human WhatsApp (buttons / edit / new Hi still work).
  const midActiveFlow =
    Boolean(state?.editing) || (state?.step && ACTIVE_BOOKING_STEPS.has(state.step));
  if (!interactive && !midActiveFlow) {
    const postBookConfirm = state?.step === 'await_post_book';
    const bookingDone = state?.step === 'booking_complete';
    const recentBook =
      !postBookConfirm &&
      !bookingDone &&
      (await recentlyCompletedBotBooking(db, to));

    if (postBookConfirm || bookingDone || recentBook) {
      // New conversation starter → allow fresh menu
      if (msgType === 'text' && text && GREETING_RE.test(text)) {
        await clearBookingState(db, to);
        const customer = await lookupCustomerFull(db, to);
        await sendGreetingMenu(ctx, { isNew: !customer?.id });
        return { handled: true };
      }
      // "edit" only while confirm buttons are still showing
      if (postBookConfirm && text && EDIT_RE.test(text)) {
        // fall through to edit handlers below
      } else {
        await sendPostBookingHumanRedirect(ctx, state);
        return { handled: true };
      }
    }
  }

  // —— Stateful text / photo steps ——
  if (state?.step === 'await_custom_note' && msgType === 'text' && text && !GREETING_RE.test(text)) {
    const next = {
      ...state,
      customNote: text.trim().slice(0, 200),
      serviceLabel: `Custom: ${text.trim().slice(0, 40)}`,
      serviceSubType: 'Service',
    };
    if (state.editing) {
      await resumeAfterEdit(ctx, next);
      return { handled: true };
    }
    await continueAfterServiceType(ctx, next);
    return { handled: true };
  }

  if (state?.step === 'await_custom_time' && msgType === 'text' && text && !GREETING_RE.test(text)) {
    const check = isCustomTimeAvailableOnDate(state.dateIso, text);
    if (!check.ok) {
      const msg =
        check.reason === 'past'
          ? 'That time has already passed today. Please choose a later time (before 5:00 PM).'
          : check.reason === 'window'
            ? 'Please choose a time between *9:00 AM and 5:00 PM*.'
            : 'Please reply like *10:30 AM* (between 9:00 AM and 5:00 PM).';
      await sendText({ ...ctx, text: msg });
      return { handled: true };
    }
    const label = text.trim().slice(0, 40);
    const next = {
      ...state,
      slotKey: 'CUSTOM',
      customTimeLabel: label,
      periodSlot: state.periodSlot || 'CUSTOM',
    };
    if (state.editing) {
      await resumeAfterEdit(ctx, next);
      return { handled: true };
    }
    await askPurifierPhoto(ctx, next);
    return { handled: true };
  }

  if (state?.step === 'await_name' && msgType === 'text' && text && !GREETING_RE.test(text) && !EDIT_RE.test(text)) {
    if (!isValidPersonName(text)) {
      await sendText({
        ...ctx,
        text: 'Please reply with a valid *full name* (at least 2 letters).',
      });
      return { handled: true };
    }
    const next = { ...state, step: 'await_location', name: text.trim() };
    if (state.editing) {
      await resumeAfterEdit(ctx, { ...next, step: state.step });
      return { handled: true };
    }
    await askLocationForNew(ctx, next);
    return { handled: true };
  }

  if (state?.step === 'await_model_or_photo') {
    if (msgType === 'image' || msgType === 'document') {
      const photoUrl = inboundMedia?.media_url || null;
      if (!photoUrl) {
        await sendText({
          ...ctx,
          text: 'We couldn’t save that photo. Please send the purifier photo again.',
        });
        return { handled: true };
      }
      const next = {
        ...state,
        step: 'await_confirm',
        photoUrl,
        model: state.model || 'See photo',
      };
      await sendText({
        ...ctx,
        text: 'Photo received — thank you.',
      });
      if (state.editing) {
        await resumeAfterEdit(ctx, next);
        return { handled: true };
      }
      await sendNewCustomerConfirm(ctx, next);
      return { handled: true };
    }
    if (msgType === 'text' && text && !GREETING_RE.test(text) && !EDIT_RE.test(text)) {
      await sendText({
        ...ctx,
        text: 'A *purifier photo is required* to continue. Please send a photo now.',
      });
      return { handled: true };
    }
  }

  // Customer shared a location pin
  if (msgType === 'location' && msg.location) {
    const { latitude, longitude, name, address } = msg.location;
    const enriched = await enrichWhatsAppLocation({
      latitude,
      longitude,
      name,
      address,
    });
    await rememberSharedLocation(db, to, {
      latitude: enriched.lat,
      longitude: enriched.lng,
      name: enriched.name,
      address: enriched.address,
      shortLocation: enriched.shortLocation,
      formattedAddress: enriched.formattedAddress,
    });

    if (state?.step === 'await_location' || state?.step === 'await_loc_confirm') {
      const next = {
        ...state,
        step: 'await_loc_confirm',
        loc: {
          lat: enriched.lat,
          lng: enriched.lng,
          name: enriched.name,
          address: enriched.address,
          shortLocation: enriched.shortLocation,
          formattedAddress: enriched.formattedAddress,
        },
      };
      await askLocConfirm(ctx, next, null);
      return { handled: true };
    }

    const locSummary = [
      enriched.shortLocation,
      enriched.name,
      enriched.address || enriched.formattedAddress,
      `https://maps.google.com/?q=${enriched.lat},${enriched.lng}`,
    ]
      .filter(Boolean)
      .join('\n');
    await afterLocationSharedLegacy(ctx, locSummary);
    return { handled: true };
  }

  if (interactive?.id) {
    const id = interactive.id;

    // Eleven RO Call / WhatsApp buttons (dialer contact + wa.me)
    if (id === 'support_call' || id === 'support_whatsapp') {
      const customer = await lookupCustomerFull(db, to);
      const st = state || {};
      const prefill =
        st.supportPrefill ||
        buildAdminHandoffPrefill({ customer, state: st, phoneE164: to });
      const handled = await handleElevenSupportButton({
        id,
        ...ctx,
        prefill,
      });
      if (handled.handled) return { handled: true };
    }

    if (id === 'book_service') {
      const customer = await lookupCustomerFull(db, to);
      if (customer?.id) {
        await clearBookingState(db, to);
        await sendIdentityConfirm(ctx, customer);
      } else {
        await askServiceType(ctx, {});
      }
      return { handled: true };
    }

    if (id === 'call_back') {
      await clearBookingState(db, to);
      await sendText({
        ...ctx,
        text: `Got it — we’ll call you back on this number shortly.`,
      });
      await insertWhatsAppMessage(db, {
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'text',
        body: '[Booking bot] Call-back requested',
        status: 'sent',
      });
      try {
        const customer = await lookupCustomerFull(db, to);
        const { sendBookingAdminNotification } = require('./booking-notify');
        await sendBookingAdminNotification({
          customerName: customer?.full_name || 'WhatsApp caller',
          phone: phone10FromE164(to),
          brandSource: 'elevenro',
          bookingDomain: 'whatsapp',
          serviceType: 'RO',
          serviceSubType: 'Callback',
          scheduledDate: '',
          scheduledTimeSlot: 'Callback',
          customTime: 'Call back ASAP',
          jobNumber: 'CALLBACK',
        });
      } catch (err) {
        console.warn('[whatsapp-booking-bot] callback notify skipped', err?.message || err);
      }
      const customer = await lookupCustomerFull(db, to);
      const prefill = buildAdminHandoffPrefill({ customer, state: {}, phoneE164: to });
      await setBookingState(db, to, { step: 'booking_complete', supportPrefill: prefill });
      await sendElevenSupportButtons({
        ...ctx,
        bodyText: `If urgent, reach Eleven RO now on ${SUPPORT_PHONE_DISPLAY}:`,
        footer: BRAND_LABEL,
      });
      return { handled: true };
    }

    if (id === 'svc_repair' || id === 'svc_install' || id === 'svc_custom') {
      const choice = SERVICE_CHOICES[id];
      const st = state || {};
      if (id === 'svc_custom') {
        await setBookingState(db, to, {
          ...st,
          step: 'await_custom_note',
          serviceSubType: choice.subType,
          serviceLabel: choice.label,
        });
        await sendText({
          ...ctx,
          text: 'Please briefly describe what you need (e.g. filter change, relocation, inspection).',
        });
        return { handled: true };
      }
      const next = {
        ...st,
        serviceSubType: choice.subType,
        serviceLabel: choice.label,
      };
      if (st.editing) {
        await resumeAfterEdit(ctx, next);
        return { handled: true };
      }
      await continueAfterServiceType(ctx, next);
      return { handled: true };
    }

    if (id === 'edit_details') {
      await sendEditMenu(ctx, state || {});
      return { handled: true };
    }

    if (id === 'all_correct') {
      const doneState = {
        step: 'booking_complete',
        jobNumber: state?.jobNumber || null,
        customerId: state?.customerId || null,
        name: state?.name || null,
        dateIso: state?.dateIso || null,
        slotKey: state?.slotKey || null,
        customTimeLabel: state?.customTimeLabel || state?.timeLabel || null,
        serviceSubType: state?.serviceSubType || null,
        serviceLabel: state?.serviceLabel || null,
        loc: state?.loc || null,
      };
      const customer = await lookupCustomerFull(db, to);
      const prefill = buildAdminHandoffPrefill({
        customer,
        state: { ...state, ...doneState },
        phoneE164: to,
      });
      await setBookingState(db, to, { ...doneState, supportPrefill: prefill });
      await sendElevenSupportButtons({
        ...ctx,
        bodyText: [
          'Perfect — thank you.',
          '',
          'Your booking is confirmed. We’ll update you here once a technician is assigned.',
          '',
          'Need anything else? Tap *Call us* (dialer) or *WhatsApp* (chat with your details attached).',
        ].join('\n'),
        footer: BRAND_LABEL,
      });
      return { handled: true };
    }

    if (id === 'edit_name') {
      await setBookingState(db, to, {
        ...(state || {}),
        step: 'await_name',
        editing: true,
        editReturn: state?.editReturn || (state?.jobNumber ? 'post_book' : 'confirm'),
      });
      await sendText({ ...ctx, text: 'Please reply with the updated *full name*.' });
      return { handled: true };
    }

    if (id === 'edit_location') {
      await setBookingState(db, to, {
        ...(state || {}),
        step: 'await_location',
        editing: true,
        editReturn: state?.editReturn || (state?.jobNumber ? 'post_book' : 'confirm'),
      });
      await sendLocationRequest({
        ...ctx,
        bodyText: 'Please share the updated *service location*.',
      });
      return { handled: true };
    }

    if (id === 'edit_datetime') {
      await sendDatePicker(ctx, {
        ...(state || {}),
        editing: true,
        editReturn: state?.editReturn || (state?.jobNumber ? 'post_book' : 'confirm'),
      });
      return { handled: true };
    }

    if (id === 'edit_photo') {
      await askPurifierPhoto(ctx, {
        ...(state || {}),
        editing: true,
        editReturn: state?.editReturn || (state?.jobNumber ? 'post_book' : 'confirm'),
      });
      return { handled: true };
    }

    if (id === 'edit_service') {
      await askServiceType(ctx, {
        ...(state || {}),
        editing: true,
        editReturn: state?.editReturn || (state?.jobNumber ? 'post_book' : 'confirm'),
      });
      return { handled: true };
    }

    if (id === 'loc_yes') {
      const st = state?.step === 'await_loc_confirm' ? state : await getBookingState(db, to);
      if (st?.editing) {
        await resumeAfterEdit(ctx, st);
        return { handled: true };
      }
      await sendDatePicker(ctx, { ...(st || {}), step: 'await_date' });
      return { handled: true };
    }

    if (id === 'loc_no') {
      const st = state || { step: 'await_location' };
      await askLocationForNew(ctx, { ...st, step: 'await_location', loc: undefined });
      return { handled: true };
    }

    if (id === 'skip_model') {
      await sendText({
        ...ctx,
        text: 'A *purifier photo is required*. Please send a photo to continue.',
      });
      return { handled: true };
    }

    if (id === 'confirm_new') {
      const st = (await getBookingState(db, to)) || state;
      const existingByPhone = await lookupCustomerFull(db, to);
      const isExisting = Boolean(st?.existingCustomerId || existingByPhone?.id);

      if ((!st?.name && !isExisting) || !st?.dateIso || !st?.slotKey) {
        await sendText({
          ...ctx,
          text: 'Something is missing. Please tap *Book service* to start again.',
        });
        await askServiceType(ctx, isExisting ? { existingCustomerId: existingByPhone?.id, name: existingByPhone?.full_name } : {});
        return { handled: true };
      }
      if (!st.photoUrl) {
        await sendText({
          ...ctx,
          text: 'A *purifier photo is required* before we can book.',
        });
        await askPurifierPhoto(ctx, {
          ...st,
          existingCustomerId: st.existingCustomerId || existingByPhone?.id || null,
          name: st.name || existingByPhone?.full_name || null,
        });
        return { handled: true };
      }

      let customer = null;

      // Phone already in CRM → confirm path already done; create *job only* (never a new customer).
      if (isExisting) {
        customer = existingByPhone || (await lookupCustomerFull(db, to));
        if (!customer?.id) {
          await sendText({
            ...ctx,
            text: 'We couldn’t load your account. Please tap *Book service* to try again.',
          });
          return { handled: true };
        }
        if (st.loc) {
          try {
            await db.rpc('update_customer_for_booking', {
              p_customer_id: customer.id,
              p_phone: phone10FromE164(to),
              p_updates: {
                location: {
                  latitude: Number(st.loc.lat),
                  longitude: Number(st.loc.lng),
                  formattedAddress:
                    st.loc.formattedAddress || st.loc.address || st.loc.name || '',
                  googleLocation: `https://www.google.com/maps/place/${st.loc.lat},${st.loc.lng}`,
                  shortLocation: st.loc.shortLocation || null,
                },
                visible_address: st.loc.shortLocation || st.loc.address || st.loc.name || null,
                address: {
                  street: st.loc.address || st.loc.formattedAddress || '',
                  area: st.loc.shortLocation || '',
                  city: 'Bangalore',
                  state: 'Karnataka',
                  pincode: '',
                  landmark: st.loc.name || st.loc.shortLocation || '',
                },
              },
            });
            customer = (await lookupCustomerFull(db, to)) || customer;
          } catch (err) {
            console.warn('[whatsapp-booking-bot] update location skipped', err?.message || err);
          }
        }
      } else {
        const createdCustomer = await createCustomerFromDraft(db, to, st);
        if (!createdCustomer.ok || !createdCustomer.customer?.id) {
          // Race: customer appeared — job-only fallback
          const raced = await lookupCustomerFull(db, to);
          if (raced?.id) {
            customer = raced;
          } else {
            await sendText({
              ...ctx,
              text: `We couldn’t complete booking right now. Our team will help you shortly.`,
            });
            await sendElevenSupportButtons({
              ...ctx,
              bodyText: `Reach Eleven RO on ${SUPPORT_PHONE_DISPLAY}:`,
              footer: BRAND_LABEL,
            });
            return { handled: true };
          }
        } else {
          customer = createdCustomer.customer;
        }
      }

      if (!customer?.id) {
        await sendText({
          ...ctx,
          text: `Please tap *Book service* to start again.`,
        });
        return { handled: true };
      }

      const locOverride = st.loc
        ? {
            lat: st.loc.lat,
            lng: st.loc.lng,
            name: st.loc.name,
            address: st.loc.address,
            shortLocation: st.loc.shortLocation,
            formattedAddress: st.loc.formattedAddress,
          }
        : await getRememberedLocation(db, to);

      const created = await createAutoBookingJob(db, {
        phoneE164: to,
        customer,
        dateIso: st.dateIso,
        slotKey: st.slotKey,
        locOverride,
        photoUrl: st.photoUrl || null,
        modelOverride: st.model || null,
        serviceSubType: st.serviceSubType || 'Service',
        customNote: st.customNote || null,
        customTimeLabel: st.customTimeLabel || null,
        periodSlot: st.periodSlot || null,
      });

      if (!created.ok) {
        await sendText({
          ...ctx,
          text: `Booking didn’t go through. Our team will finish it for you.`,
        });
        await sendElevenSupportButtons({
          ...ctx,
          bodyText: `Reach Eleven RO on ${SUPPORT_PHONE_DISPLAY}:`,
          footer: BRAND_LABEL,
        });
        await clearBookingState(db, to);
        return { handled: true };
      }

      const bookedState = {
        ...st,
        name: customer.full_name || st.name,
        existingCustomerId: customer.id,
        jobNumber: created.jobNumber,
        jobId: created.job?.id || null,
        customerId: customer.id,
        timeLabel: created.timeLabel,
        customTimeLabel: st.customTimeLabel || created.timeLabel,
        loc:
          st.loc ||
          (locOverride
            ? {
                lat: locOverride.lat,
                lng: locOverride.lng,
                name: locOverride.name,
                address: locOverride.address,
                shortLocation: locOverride.shortLocation,
                formattedAddress: locOverride.formattedAddress,
              }
            : null),
      };
      await sendBookedConfirmation(ctx, bookedState);
      await insertWhatsAppMessage(db, {
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'text',
        body: `[Booking bot] Job: ${created.jobNumber} · ${st.dateIso} ${created.timeLabel} · ${st.serviceSubType || 'Service'} · ${LEAD_SOURCE} · ${isExisting ? 'existing_customer' : 'new_customer'} · loc: ${formatServiceLocationLine(bookedState, customer, locOverride)}`,
        status: 'sent',
        customer_id: customer.id,
      });
      void notifyOwnerBestEffort(
        customer,
        to,
        st.dateIso,
        created.timeLabel,
        created.jobNumber,
        st.serviceSubType || 'Service'
      );
      return { handled: true };
    }

    if (id === 'identity_yes') {
      const customer = await lookupCustomerFull(db, to);
      await askServiceType(ctx, {
        name: customer?.full_name || 'Customer',
        existingCustomerId: customer?.id || null,
      });
      return { handled: true };
    }

    if (id === 'identity_no') {
      const customer = await lookupCustomerFull(db, to);
      await askServiceType(ctx, {
        name: customer?.full_name || 'Customer',
        existingCustomerId: customer?.id || null,
        needNewLocation: true,
      });
      return { handled: true };
    }

    if (id === 'share_location') {
      await sendLocationRequest({ ...ctx });
      return { handled: true };
    }

    if (id === 'pick_date') {
      await sendDatePicker(ctx, state || null);
      return { handled: true };
    }

    if (id === 'talk_team') {
      const customer = await lookupCustomerFull(db, to);
      const prefill = buildAdminHandoffPrefill({
        customer,
        state: state || {},
        phoneE164: to,
      });
      await setBookingState(db, to, {
        ...(state || {}),
        step: state?.jobNumber ? 'booking_complete' : state?.step || 'idle',
        supportPrefill: prefill,
      });
      await sendElevenSupportButtons({
        ...ctx,
        bodyText: [
          'Okay — reach our Eleven RO team directly:',
          '',
          `*Call us* opens your phone dialer.`,
          `*WhatsApp* opens chat with ${SUPPORT_PHONE_DISPLAY} (details attached when available).`,
        ].join('\n'),
        footer: BRAND_LABEL,
      });
      return { handled: true };
    }

    const dateIso = parseDateId(id);
    if (dateIso) {
      const st = state ? { ...state, dateIso } : { dateIso };
      await sendPeriodPicker(ctx, dateIso, st);
      return { handled: true };
    }

    if (id.startsWith('period_')) {
      const parts = id.split('__');
      const periodId = parts[0]; // period_morning | period_afternoon | period_evening | period_custom
      const date = parts[1] || state?.dateIso || '';
      const st = { ...(state || {}), dateIso: date };

      if (periodId === 'period_custom') {
        if (!isCustomTimeStillAllowed(date)) {
          await sendText({
            ...ctx,
            text: `No time slots left for *${formatDateIsoLabel(date)}*. Please pick another date.`,
          });
          await sendDatePicker(ctx, st);
          return { handled: true };
        }
        await askCustomTime(ctx, { ...st, periodSlot: 'CUSTOM' });
        return { handled: true };
      }

      const meta = TIME_PERIODS[periodId];
      if (!meta) {
        await sendPeriodPicker(ctx, date, st);
        return { handled: true };
      }
      if (!periodHasAvailableSlots(date, meta.key)) {
        await sendText({
          ...ctx,
          text: `*${meta.label}* is no longer available for *${formatDateIsoLabel(date)}*. Please choose another option.`,
        });
        await sendPeriodPicker(ctx, date, st);
        return { handled: true };
      }
      await sendTimePicker(ctx, date, st, meta.key);
      return { handled: true };
    }

    if (id.startsWith('time__')) {
      const parts = id.split('__');
      const slotKey = parts[1] || '10-AM';
      const date = parts[2] || state?.dateIso || 'soon';
      const next = { ...(state || {}), dateIso: date, slotKey };

      if (slotKey === 'CUSTOM') {
        if (!isCustomTimeStillAllowed(date)) {
          await sendText({
            ...ctx,
            text: `No time slots left for *${formatDateIsoLabel(date)}*. Please pick another date.`,
          });
          await sendDatePicker(ctx, next);
          return { handled: true };
        }
        await askCustomTime(ctx, next);
        return { handled: true };
      }

      if (!isSlotAvailableOnDate(date, slotKey)) {
        await sendText({
          ...ctx,
          text: `*${TIME_SLOTS[slotKey]?.label || slotKey}* has already passed. Please choose a later time.`,
        });
        const period = TIME_SLOTS[slotKey]?.period || state?.periodKey || 'morning';
        await sendTimePicker(ctx, date, next, period);
        return { handled: true };
      }

      const known = TIME_SLOTS[slotKey];
      if (known) {
        next.periodKey = known.period;
        next.periodSlot = known.slot;
        next.customTimeLabel = known.label;
      }
      if (state?.editing) {
        await resumeAfterEdit(ctx, next);
        return { handled: true };
      }
      await askPurifierPhoto(ctx, next);
      return { handled: true };
    }

    if (id.startsWith('confirm__')) {
      const parts = id.split('__');
      const date = parts[1] || '';
      const slotKey = parts[2] || '10-AM';
      const st = (await getBookingState(db, to)) || state || {};
      if (!st.photoUrl) {
        await sendText({
          ...ctx,
          text: 'A *purifier photo is required* before we can book.',
        });
        await askPurifierPhoto(ctx, { ...st, dateIso: date, slotKey });
        return { handled: true };
      }
      const customer = await lookupCustomerFull(db, to);
      const locOverride = st.loc
        ? {
            lat: st.loc.lat,
            lng: st.loc.lng,
            name: st.loc.name,
            address: st.loc.address,
            shortLocation: st.loc.shortLocation,
            formattedAddress: st.loc.formattedAddress,
          }
        : await getRememberedLocation(db, to);

      if (!customer?.id) {
        await sendText({
          ...ctx,
          text: `Please use *Book service* so we can collect your details first.`,
        });
        await askServiceType(ctx, {});
        return { handled: true };
      }

      const created = await createAutoBookingJob(db, {
        phoneE164: to,
        customer,
        dateIso: date,
        slotKey,
        locOverride,
        photoUrl: st.photoUrl || null,
        modelOverride: st.model || null,
        serviceSubType: st.serviceSubType || 'Service',
        customNote: st.customNote || null,
        customTimeLabel: st.customTimeLabel || null,
        periodSlot: st.periodSlot || null,
      });

      if (!created.ok) {
        await sendText({
          ...ctx,
          text: `We couldn’t complete booking right now. Our team will help shortly.`,
        });
        await sendElevenSupportButtons({
          ...ctx,
          bodyText: `Reach Eleven RO on ${SUPPORT_PHONE_DISPLAY}:`,
          footer: BRAND_LABEL,
        });
        await insertWhatsAppMessage(db, {
          direction: 'outbound',
          phone_e164: to,
          msg_type: 'text',
          body: `[Booking bot] Auto job FAILED: ${date} ${slotKey} — ${created.error}`,
          status: 'failed',
          error_message: created.error,
        });
        return { handled: true };
      }

      const bookedState = {
        ...st,
        dateIso: date,
        slotKey,
        name: customer.full_name || st.name,
        jobNumber: created.jobNumber,
        jobId: created.job?.id || null,
        customerId: customer.id,
        timeLabel: created.timeLabel,
        customTimeLabel: st.customTimeLabel || created.timeLabel,
        loc:
          st.loc ||
          (locOverride
            ? {
                lat: locOverride.lat,
                lng: locOverride.lng,
                name: locOverride.name,
                address: locOverride.address,
                shortLocation: locOverride.shortLocation,
                formattedAddress: locOverride.formattedAddress,
              }
            : null),
      };
      await sendBookedConfirmation(ctx, bookedState);
      await insertWhatsAppMessage(db, {
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'text',
        body: `[Booking bot] Job: ${created.jobNumber} · ${date} ${created.timeLabel} · ${st.serviceSubType || 'Service'} · ${LEAD_SOURCE} · loc: ${formatServiceLocationLine(bookedState, customer, locOverride)}`,
        status: 'sent',
        customer_id: customer.id,
      });
      void notifyOwnerBestEffort(
        customer,
        to,
        date,
        created.timeLabel,
        created.jobNumber,
        st.serviceSubType || 'Service'
      );
      return { handled: true };
    }
  }

  if (
    msgType === 'text' &&
    text &&
    EDIT_RE.test(text) &&
    (state?.step === 'await_post_book' ||
      state?.step === 'await_confirm' ||
      state?.jobNumber)
  ) {
    await sendEditMenu(ctx, state || {});
    return { handled: true };
  }

  if (msgType === 'text' && text && GREETING_RE.test(text)) {
    const customer = await lookupCustomerFull(db, to);
    await clearBookingState(db, to);
    await sendGreetingMenu(ctx, { isNew: !customer?.id });
    return { handled: true };
  }

  return { handled: false };
}

module.exports = {
  handleBookingBotInbound,
  extractInteractiveReply,
  isBookingBotEnabled,
  sendLocationRequest,
  sendCtaUrl,
  lookupCustomerFull,
  createAutoBookingJob,
};
