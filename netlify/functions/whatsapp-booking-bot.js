/**
 * In-session (24h) WhatsApp booking bot — reply buttons + lists + location.
 *
 * Fresh inbound (first message / idle reopen):
 *   Known WA → AMC / recent-service (&lt;15d) context → Call us / Book / Chat
 *   Unknown WA → First time | Different number | Call us
 *     First time → Call us / Book step-by-step / Chat
 *     Different number → strict mobile lookup → confirm name+last service → facing issue /
 *       15-day problem path (explain + photo/video) → fast date/time book
 *
 * Legacy greeting buttons (Service/Repair | Reinstallation | Chat) still work mid-flow.
 * Chat with us / post-book free-form → Eleven RO main line 9880693311
 *
 * Customer messages stay simple (no lead source / CRM jargon).
 * Admin-started Water Filter Service can set lead_source; default remains Direct call.
 */
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  ensurePublicCrmPhotoUrl,
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
const WATER_FILTER_SERVICE_LABEL = 'Water Filter Service';

function waterFilterServiceLabelForBrand(brand) {
  const b = String(brand || '').toLowerCase();
  if (b === 'elevenro') return 'Eleven RO Water Filter Service';
  if (b === 'hydrogenro') return 'Hydrogen RO Water Filter Service';
  return WATER_FILTER_SERVICE_LABEL;
}

function brandShortLabelForWfs(brand) {
  const b = String(brand || '').toLowerCase();
  if (b === 'elevenro') return 'Eleven RO';
  if (b === 'hydrogenro') return 'Hydrogen RO';
  return '';
}

/** Body for native WhatsApp *Send location* button (24h interactive only). */
function buildAskLocationBodyText(customerName, fromLabel) {
  const name = String(customerName || 'there').trim() || 'there';
  const who = String(fromLabel || WATER_FILTER_SERVICE_LABEL).trim() || WATER_FILTER_SERVICE_LABEL;
  return [
    `Hi ${name}, 👋`,
    `This is ${who}.`,
    '',
    '📍 Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
    '',
    'Tap *Send location* below 👇',
  ].join('\n');
}

/**
 * Tools → Quick customer / WFS — optional lead/intro (no double Hi, no *bold*).
 * Empty whatsappLeadLine → from {brand} Water Filter Service.
 * With lead → from Direct call - Hydrogen RO Water Filter Service.
 */
function buildQuickCustomerLocationBodyText(customerName, whatsappLeadLine, brand) {
  const name = String(customerName || 'there').trim() || 'there';
  const intro = String(whatsappLeadLine || '').trim();
  const brandShort = brandShortLabelForWfs(brand);
  const lines = [`Hi ${name}, 👋`, ''];
  if (intro && brandShort) {
    lines.push(`from ${intro} - ${brandShort} Water Filter Service.`, '');
  } else if (intro) {
    lines.push(`from ${intro} - Water Filter Service.`, '');
  } else if (brandShort) {
    lines.push(`from ${brandShort} Water Filter Service.`, '');
  } else {
    lines.push('from Water Filter Service.', '');
  }
  lines.push(
    '📍 To serve you better we need your exact location. Please share your Google Maps location pin on this chat.',
    '',
    'Tap Send location below 👇'
  );
  return lines.join('\n');
}

function buildLocationRequestBodyText(state = {}) {
  const name = String(state.name || 'Customer').trim() || 'Customer';
  if (state.waterFilterService) {
    const mention =
      state.whatsappLeadLine != null
        ? String(state.whatsappLeadLine).trim()
        : String(state.leadSource || '').trim();
    return buildQuickCustomerLocationBodyText(name, mention, state.brand);
  }
  return buildAskLocationBodyText(name, waterFilterServiceLabelForBrand(state.brand));
}
const DEFAULT_LEAD_SOURCES = [
  'Website',
  'Direct call',
  'Google-Leads',
  'RO care india',
  'Home Triangle',
  'Home Triangle-Srujan',
  'Home Triangle-3',
  'Local Ramu',
  'Other',
];

function resolveLeadSource(raw) {
  const t = String(raw || '').trim();
  if (!t) return LEAD_SOURCE;
  return t.slice(0, 80);
}
const STATE_PREFIX = '[Booking bot state]';
/** Must match whatsapp-unsolicited-media.js so photo step is allowed. */
const AWAITING_CUSTOMER_MEDIA_MARKER = '[Awaiting customer media]';
const POST_BOOKING_REDIRECT_MARKER = '[Post-booking human redirect]';

/**
 * Session (24h) greeting — interactive reply buttons.
 * Cold templates cannot send this exact UI; after the customer replies we always
 * resume with these same buttons / booking steps (see admin_pending + cold open).
 */
const GREETING_MENU = {
  bodyNew: `Hi! Welcome to ${BRAND_LABEL} 💧\n\nHow can we help you today?`,
  bodyReturning: `Hi! Welcome to ${BRAND_LABEL} 💧\n\nHow can we help you today?`,
  footer: BRAND_LABEL,
  buttons: [
    { id: 'book_service', title: 'Service/Repair' },
    { id: 'book_reinstall', title: 'Reinstallation' },
    { id: 'talk_team', title: 'Chat with us' },
  ],
};

/** Map interactive / template quick-reply / typed text → greeting intent. */
function resolveGreetingIntent({ id, title, text } = {}) {
  const blob = `${id || ''} ${title || ''} ${text || ''}`.toLowerCase().trim();
  if (!blob) return null;
  if (
    /\bshare_location\b/.test(blob) ||
    /\bshare location\b/.test(blob) ||
    /^share location$/.test(String(title || '').trim().toLowerCase())
  ) {
    return 'request_location';
  }
  if (
    /\bbook_reinstall\b/.test(blob) ||
    /\breinstall/.test(blob) ||
    /^reinstallation$/.test(String(title || '').trim().toLowerCase())
  ) {
    return 'book_reinstall';
  }
  if (
    /\btalk_team\b/.test(blob) ||
    /\bchat with us\b/.test(blob) ||
    /\bchat_with_us\b/.test(blob)
  ) {
    return 'talk_team';
  }
  if (
    /\bbook_service\b/.test(blob) ||
    /\bbook_now\b/.test(blob) ||
    /\bbook now\b/.test(blob) ||
    /\bservice\s*\/\s*repair\b/.test(blob) ||
    /^service\/repair$/.test(String(title || '').trim().toLowerCase()) ||
    /^book now$/.test(String(title || '').trim().toLowerCase()) ||
    /^\s*book(ing)?\s*$/.test(String(text || '').trim().toLowerCase())
  ) {
    return 'book_service';
  }
  return null;
}

/** Steps where the customer is still mid-flow (not “after booking”). */
const ACTIVE_BOOKING_STEPS = new Set([
  'await_name',
  'await_alt_phone',
  'await_location',
  'await_loc_confirm',
  'await_building_flat',
  'await_date',
  'await_period',
  'await_time',
  'await_custom_time',
  'await_model_or_photo',
  'await_service_type',
  'await_custom_note',
  'await_confirm',
  'await_edit_menu',
  // Identity gate (first message / reopen)
  'await_identity_gate',
  'await_other_phone',
  'await_linked_identity_confirm',
  'await_facing_issue',
  'await_recent_problem',
  'await_issue_text',
  'await_issue_media',
  'await_first_time_menu',
  'await_known_menu',
  'await_amc_checkin',
]);

const OTHER_PHONE_LOOKUP_MAX = 3;
const RECENT_SERVICE_DAYS = 15;

const GREETING_RE =
  /^(hi+|hii+|hello|hey|hola|namaste|book|booking|service|start|menu|help)\b/i;
const EDIT_RE = /^(edit|change|update|modify)\b/i;

/** Clear booking intents in free-form first messages (no need to tap Hi). */
const REINSTALL_INTENT_RE =
  /\b(reinstall|re-install|re installation|relocation|shifting|shift(ing)?\s+(the\s+)?(ro|purifier))\b/i;
const REPAIR_INTENT_RE =
  /\b(repair|service|servicing|leak|leaking|not\s+working|no\s+water|filter|technician|tech|booking|book\b|amc|complaint|problem|issue|broken|ro\b|purifier|water\s*purifier)\b/i;
const CHAT_INTENT_RE =
  /\b(chat|talk|call\s*(me|back)?|speak|human|agent|support|help\s+me|customer\s*care)\b/i;

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
  svc_repair: { label: 'Service / Repair', subType: 'Repair' },
  svc_reinstall: { label: 'Reinstallation', subType: 'Reinstallation' },
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
  if (state?.serviceSubType === 'Repair') return 'Service / Repair';
  if (state?.serviceSubType === 'Reinstallation') return 'Reinstallation';
  if (state?.serviceSubType === 'Installation') return 'Installation';
  return state?.serviceSubType || 'Service';
}

function hasUsableAlternatePhone(customer) {
  const digits = String(customer?.alternate_phone || '').replace(/\D/g, '');
  return digits.length >= 10;
}

function normalizeAltPhoneInput(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

function buildAlternateLocationPayload(loc) {
  if (!loc || loc.lat == null || loc.lng == null) return null;
  return {
    latitude: Number(loc.lat),
    longitude: Number(loc.lng),
    formattedAddress: loc.formattedAddress || loc.address || loc.name || '',
    googleLocation: `https://www.google.com/maps/place/${loc.lat},${loc.lng}`,
    shortLocation: loc.shortLocation || null,
  };
}

function buildAlternateAddressPayload(loc) {
  if (!loc) return null;
  const flat = String(loc.buildingFlat || '').trim();
  const baseStreet = loc.address || loc.formattedAddress || '';
  return {
    street: [flat, baseStreet].filter(Boolean).join(', '),
    area: loc.shortLocation || '',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '',
    landmark: flat || loc.name || loc.shortLocation || '',
    ...(flat ? { building_flat: flat } : {}),
  };
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
    const flat = String(state?.buildingFlat || locOverride?.buildingFlat || '').trim();
    const short = String(pin.shortLocation || '').trim();
    const address = String(pin.address || pin.formattedAddress || '').trim();
    const name = String(pin.name || '').trim();
    let line = '';
    if (short && address && !address.toLowerCase().includes(short.toLowerCase())) {
      line = `${short} — ${address}`;
    } else if (short && name && name.toLowerCase() !== short.toLowerCase()) {
      line = `${short} — ${name}`;
    } else if (short) {
      line = short;
    } else if (address && name && address.toLowerCase() !== name.toLowerCase()) {
      line = `${name}, ${address}`;
    } else if (address) {
      line = address;
    } else if (name) {
      line = name;
    } else if (pin.lat != null && pin.lng != null) {
      line = 'Location shared via WhatsApp pin';
    }
    if (flat && line) return `${flat}, ${line}`.slice(0, 180);
    if (flat) return flat.slice(0, 180);
    if (line) return line.slice(0, 180);
  }

  const fromCustomer = formatAddressLine(customer);
  if (fromCustomer) return fromCustomer;
  return '';
}

function buildServiceAddress(customer, locOverride) {
  if (locOverride?.address || locOverride?.name || locOverride?.shortLocation || locOverride?.buildingFlat) {
    const flat = String(locOverride.buildingFlat || '').trim();
    const baseStreet =
      locOverride.address || locOverride.formattedAddress || locOverride.name || '';
    const street = [flat, baseStreet].filter(Boolean).join(', ');
    return {
      street,
      area: locOverride.shortLocation || '',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '',
      landmark: flat || locOverride.name || locOverride.shortLocation || '',
      ...(flat ? { building_flat: flat } : {}),
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
      'id,full_name,phone,alternate_phone,address,location,visible_address,alternate_address,alternate_location,alternate_visible_address,brand,model,service_type,last_service_date'
    )
    .or(`phone.like.%${phone},alternate_phone.like.%${phone}`)
    .limit(1)
    .maybeSingle();
  return customer || null;
}

const CUSTOMER_BOOKING_SELECT =
  'id,full_name,phone,alternate_phone,address,location,visible_address,alternate_address,alternate_location,alternate_visible_address,brand,model,service_type,last_service_date';

async function lookupCustomerById(db, customerId) {
  if (!db || !customerId) return null;
  const { data } = await db
    .from('customers')
    .select(CUSTOMER_BOOKING_SELECT)
    .eq('id', customerId)
    .maybeSingle();
  return data || null;
}

/** Prefer linked / existingCustomerId from bot state; else WA phone lookup. */
async function resolveCustomerForState(db, waPhoneE164, state = {}) {
  const linkedId = String(state?.linkedCustomerId || state?.existingCustomerId || '').trim();
  if (linkedId) {
    const byId = await lookupCustomerById(db, linkedId);
    if (byId?.id) return byId;
  }
  return lookupCustomerFull(db, waPhoneE164);
}

/**
 * Strict Indian mobile for other-number lookup.
 * Accepts 10-digit / 91… / +91…; must match /^[6-9]\d{9}$/.
 */
function parseStrictIndianMobile(text) {
  let digits = String(text || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

function daysSinceIso(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00+05:30');
  if (!Number.isFinite(d.getTime())) return null;
  const now = getIstNow();
  const today = new Date(`${now.dateIso}T12:00:00+05:30`);
  const diff = Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  return Number.isFinite(diff) ? diff : null;
}

function formatLastServiceLine(lastIso) {
  if (!lastIso) return 'Last service: not on file';
  const days = daysSinceIso(lastIso);
  const label = formatDateIsoLabel(String(lastIso).slice(0, 10));
  if (days == null) return `Last service: ${label}`;
  if (days === 0) return `Last service: ${label} (today)`;
  if (days === 1) return `Last service: ${label} (1 day ago)`;
  if (days < 0) return `Last service: ${label}`;
  return `Last service: ${label} (${days} days ago)`;
}

async function lookupActiveAmc(db, customerId) {
  if (!db || !customerId) return null;
  try {
    const { data } = await db
      .from('amc_contracts')
      .select('id, status, end_date')
      .eq('customer_id', customerId)
      .eq('status', 'ACTIVE')
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.id ? data : null;
  } catch (err) {
    console.warn('[whatsapp-booking-bot] AMC lookup skipped:', err?.message || err);
    return null;
  }
}

async function lookupLastServiceInfo(db, customerId, customerRow = null) {
  if (!db || !customerId) return { lastServiceDate: null, daysAgo: null };
  let last = customerRow?.last_service_date
    ? String(customerRow.last_service_date).slice(0, 10)
    : null;
  if (!last) {
    try {
      const { data } = await db
        .from('jobs')
        .select('completed_at, end_time, scheduled_date')
        .eq('customer_id', customerId)
        .eq('status', 'COMPLETED')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      last =
        (data?.completed_at && String(data.completed_at).slice(0, 10)) ||
        (data?.end_time && String(data.end_time).slice(0, 10)) ||
        (data?.scheduled_date && String(data.scheduled_date).slice(0, 10)) ||
        null;
    } catch (err) {
      console.warn('[whatsapp-booking-bot] last service job lookup skipped:', err?.message || err);
    }
  }
  return { lastServiceDate: last, daysAgo: daysSinceIso(last) };
}

async function sendCallUsHandoff(ctx, customer = null, state = {}) {
  const prefill = buildAdminHandoffPrefill({
    customer,
    state,
    phoneE164: ctx.to,
  });
  await setBookingState(ctx.db, ctx.to, {
    step: 'booking_complete',
    supportPrefill: prefill,
    ...(state.linkedCustomerId ? { linkedCustomerId: state.linkedCustomerId } : {}),
  });
  await sendElevenSupportButtons({
    ...ctx,
    bodyText: [
      `Call or chat with us on our main WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
      '',
      'Tap *Call 3311* to open the dialer, or *WhatsApp team* to message us.',
    ].join('\n'),
    footer: BRAND_LABEL,
  });
}

async function sendChatHandoff(ctx, customer = null, state = {}) {
  return sendCallUsHandoff(ctx, customer, state);
}

async function beginLinkedOrKnownBooking(ctx, state = {}) {
  const customer = await resolveCustomerForState(ctx.db, ctx.to, state);
  const existingId = String(
    state.linkedCustomerId || state.existingCustomerId || customer?.id || ''
  ).trim();
  if (!existingId || !customer?.id) {
    await beginServiceBooking(ctx, {
      serviceSubType: state.serviceSubType || 'Repair',
      serviceLabel: state.serviceLabel || 'Service / Repair',
    });
    return;
  }
  await beginExistingCustomerDateBooking(ctx, {
    serviceSubType: state.serviceSubType || 'Repair',
    serviceLabel: state.serviceLabel || 'Service / Repair',
    existingCustomerId: existingId,
    linkedCustomerId: state.linkedCustomerId || null,
    linkedFromOtherNumber: Boolean(state.linkedFromOtherNumber),
    name: state.name || customer.full_name,
    issueNote: state.issueNote || null,
    issueMediaUrl: state.issueMediaUrl || null,
    photoUrl: state.issueMediaUrl || state.photoUrl || null,
  });
}

async function askIssueExplain(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_issue_text' });
  await sendText({
    ...ctx,
    text: 'Please briefly explain what the issue is (reply in this chat).',
  });
}

async function askIssueMedia(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_issue_media' });
  await sendText({
    ...ctx,
    text:
      'Please send a *photo or short video* of the issue so we can help faster.\n\n' +
      AWAITING_CUSTOMER_MEDIA_MARKER,
  });
}

async function sendFacingIssuePrompt(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_facing_issue' });
  return sendButtons({
    ...ctx,
    bodyText: 'Are you facing any issue with your purifier right now?',
    footer: BRAND_LABEL,
    buttons: [
      { id: 'face_yes', title: 'Yes' },
      { id: 'face_no', title: 'No' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

async function sendRecentProblemPrompt(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_recent_problem' });
  const days = state.lastServiceDaysAgo;
  const when =
    days == null
      ? 'recently'
      : days <= 0
        ? 'today'
        : days === 1
          ? 'yesterday'
          : `${days} days ago`;
  return sendButtons({
    ...ctx,
    bodyText: `We last served you *${when}*. Are you facing a problem again?`,
    footer: BRAND_LABEL,
    buttons: [
      { id: 'recent_yes', title: 'Yes' },
      { id: 'recent_no', title: 'No' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

async function sendKnownMenu(ctx, state = {}) {
  const name = String(state.name || 'there').trim() || 'there';
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_known_menu' });
  return sendButtons({
    ...ctx,
    bodyText: `Hi ${name}! How can we help you today?`,
    footer: BRAND_LABEL,
    buttons: [
      { id: 'known_book', title: 'Book Service' },
      { id: 'known_chat', title: 'Chat with us' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

async function sendAmcCheckin(ctx, state = {}) {
  const name = String(state.name || 'there').trim() || 'there';
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_amc_checkin' });
  return sendButtons({
    ...ctx,
    bodyText: [
      `Hi ${name},`,
      'You have *Annual Maintenance* with us.',
      '',
      'Are you facing a problem, or do you need a visit?',
    ].join('\n'),
    footer: BRAND_LABEL,
    buttons: [
      { id: 'amc_issue', title: 'Facing issue' },
      { id: 'amc_book', title: 'Book visit' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

async function sendIdentityGate(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, {
    ...state,
    step: 'await_identity_gate',
    otherPhoneAttempts: state.otherPhoneAttempts || 0,
  });
  return sendButtons({
    ...ctx,
    bodyText: [
      `Hi! Welcome to ${BRAND_LABEL} 💧`,
      '',
      'Is this your *first time* booking with us, or have you booked before on a *different number*?',
    ].join('\n'),
    footer: BRAND_LABEL,
    buttons: [
      { id: 'id_first_time', title: 'First time' },
      { id: 'id_other_number', title: 'Different number' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

async function sendFirstTimeMenu(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_first_time_menu' });
  return sendButtons({
    ...ctx,
    bodyText: 'Great — how would you like to continue?',
    footer: BRAND_LABEL,
    buttons: [
      { id: 'first_book', title: 'Book Service' },
      { id: 'first_chat', title: 'Chat with us' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

async function askOtherPhone(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_other_phone' });
  await sendText({
    ...ctx,
    text: 'Please reply with the *10-digit mobile number* you used before (e.g. 98XXXXXXXX).',
  });
}

async function sendLinkedIdentityConfirm(ctx, state, customer, lastInfo) {
  const name = String(customer?.full_name || 'Customer').trim() || 'Customer';
  const next = {
    ...state,
    step: 'await_linked_identity_confirm',
    pendingLinkCustomerId: customer.id,
    pendingLinkName: name,
    lastServiceDate: lastInfo?.lastServiceDate || null,
    lastServiceDaysAgo: lastInfo?.daysAgo ?? null,
  };
  await setBookingState(ctx.db, ctx.to, next);
  return sendButtons({
    ...ctx,
    bodyText: [
      `We found *${name}* on that number.`,
      formatLastServiceLine(lastInfo?.lastServiceDate),
      '',
      'Is this you?',
    ].join('\n'),
    footer: 'Confirm only',
    buttons: [
      { id: 'link_yes', title: 'Yes, this is me' },
      { id: 'link_no', title: 'No' },
      { id: 'id_call_us', title: 'Call us' },
    ],
  });
}

/**
 * Customer-initiated idle / first message — identity gate + known-customer context.
 */
async function startInboundIdentityFlow(ctx) {
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  if (!customer?.id) {
    await sendIdentityGate(ctx, {});
    return { ok: true, known: false };
  }

  const name = String(customer.full_name || 'there').trim() || 'there';
  const lastInfo = await lookupLastServiceInfo(ctx.db, customer.id, customer);
  const amc = await lookupActiveAmc(ctx.db, customer.id);
  const base = {
    existingCustomerId: customer.id,
    name,
    lastServiceDate: lastInfo.lastServiceDate,
    lastServiceDaysAgo: lastInfo.daysAgo,
    hasAmc: Boolean(amc?.id),
  };

  if (amc?.id) {
    await sendAmcCheckin(ctx, base);
    return { ok: true, known: true, amc: true };
  }

  if (lastInfo.daysAgo != null && lastInfo.daysAgo >= 0 && lastInfo.daysAgo < RECENT_SERVICE_DAYS) {
    await sendRecentProblemPrompt(ctx, base);
    return { ok: true, known: true, recent: true };
  }

  await sendKnownMenu(ctx, base);
  return { ok: true, known: true };
}

async function continueAfterLinkedConfirm(ctx, state = {}) {
  const customer = await resolveCustomerForState(ctx.db, ctx.to, state);
  const lastInfo = {
    lastServiceDate: state.lastServiceDate || null,
    daysAgo: state.lastServiceDaysAgo ?? null,
  };
  if (!lastInfo.lastServiceDate && customer?.id) {
    const fresh = await lookupLastServiceInfo(ctx.db, customer.id, customer);
    lastInfo.lastServiceDate = fresh.lastServiceDate;
    lastInfo.daysAgo = fresh.daysAgo;
  }
  const amc = customer?.id ? await lookupActiveAmc(ctx.db, customer.id) : null;
  const base = {
    ...state,
    existingCustomerId: state.linkedCustomerId || state.existingCustomerId,
    name: state.name || customer?.full_name,
    lastServiceDate: lastInfo.lastServiceDate,
    lastServiceDaysAgo: lastInfo.daysAgo,
    hasAmc: Boolean(amc?.id),
  };

  if (amc?.id) {
    await sendAmcCheckin(ctx, base);
    return;
  }
  await sendFacingIssuePrompt(ctx, base);
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

/** True when customer messaged inbound within last 24h. */
async function hasOpenCustomerServiceWindow(db, phoneE164) {
  const phone = normalizePhoneE164(phoneE164);
  if (!db || !phone) return false;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phone)
      .eq('direction', 'inbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return Boolean(data?.id);
  } catch {
    return false;
  }
}

/**
 * Admin inbox quick action while 24h window is open.
 * @param {{ db: any, accessToken: string, phoneNumberId: string, to: string }} ctx
 * @param {'book_service'|'request_location'|'request_photo'|'request_building_flat'|'request_name'|'water_filter_service'|'book_location_photo'} action
 * @param {{ customerName?: string, leadSource?: string }} [opts]
 */
async function startAdminQuickAction(ctx, action, opts = {}) {
  const act = String(action || '').trim();
  await clearBookingState(ctx.db, ctx.to);

  if (act === 'water_filter_service') {
    return startWaterFilterServiceBooking(ctx, opts);
  }

  if (act === 'book_location_photo') {
    return startBookLocationPhoto(ctx, opts);
  }

  if (act === 'request_name') {
    await askCustomerName(ctx, {
      startedByAdmin: true,
      askNameOnly: true,
      brand: opts.brand,
    });
    return { ok: true, started: 'request_name' };
  }

  if (act === 'request_building_flat') {
    const customer = await lookupCustomerFull(ctx.db, ctx.to);
    const name = String(opts.customerName || customer?.full_name || '').trim();
    await askBuildingFlat(ctx, {
      startedByAdmin: true,
      name: name || undefined,
      customerName: name || undefined,
    });
    return { ok: true, started: 'request_building_flat' };
  }

  if (act === 'book_service') {
    const customer = await lookupCustomerFull(ctx.db, ctx.to);
    if (customer?.id) {
      await beginExistingCustomerDateBooking(ctx, {
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
        existingCustomerId: customer.id,
        name: customer.full_name,
        leadSource: resolveLeadSource(opts.leadSource),
        startedByAdmin: true,
      });
      return { ok: true, started: 'book_service', mode: 'date_time' };
    }
    await continueAfterServiceType(ctx, {
      serviceSubType: 'Repair',
      serviceLabel: 'Service / Repair',
    });
    return { ok: true, started: 'book_service', mode: 'service_repair' };
  }

  if (act === 'request_location') {
    const customer = await lookupCustomerFull(ctx.db, ctx.to);
    const name = String(opts.customerName || customer?.full_name || 'there').trim() || 'there';
    const fromLabel = waterFilterServiceLabelForBrand(opts.brand);
    await setBookingState(ctx.db, ctx.to, {
      step: 'await_location',
      needNewLocation: true,
      startedByAdmin: true,
    });
    const locBody = String(opts.whatsappLeadLine || opts.leadSource || '').trim()
      ? buildQuickCustomerLocationBodyText(
          name,
          opts.whatsappLeadLine != null ? opts.whatsappLeadLine : opts.leadSource,
          opts.brand
        )
      : buildAskLocationBodyText(name, fromLabel);
    const loc = await sendLocationRequest({
      ...ctx,
      bodyText: locBody,
    });
    return { ok: Boolean(loc?.ok), started: 'request_location', error: loc?.error };
  }

  if (act === 'request_photo') {
    await askPurifierPhoto(ctx, { startedByAdmin: true });
    return { ok: true, started: 'request_photo' };
  }

  return { ok: false, error: 'Unknown action' };
}

/**
 * Water Filter Service — skip name (admin provided), ask location first, then date → time → photo.
 */
async function startWaterFilterServiceBooking(ctx, opts = {}) {
  const name =
    String(opts.customerName || opts.name || '').trim() ||
    String((await lookupCustomerFull(ctx.db, ctx.to))?.full_name || '').trim() ||
    'Customer';
  const leadSource = resolveLeadSource(opts.leadSource);
  // Empty string = skip WhatsApp intro; omit field → skip (do not force Direct call on WA).
  const whatsappLeadLine =
    opts.whatsappLeadLine != null
      ? String(opts.whatsappLeadLine).trim().slice(0, 80)
      : opts.includeLeadOnWhatsApp === true
        ? leadSource
        : '';
  const existing = await lookupCustomerFull(ctx.db, ctx.to);
  const existingId =
    String(opts.customerId || opts.existingCustomerId || '').trim() || existing?.id || null;
  const brand = opts.brand || null;
  const subRaw = String(opts.serviceSubType || '').trim();
  const serviceSubType =
    subRaw === 'Installation' || subRaw === 'Reinstallation' ? subRaw : 'Repair';
  const serviceLabel =
    String(opts.serviceLabel || '').trim() ||
    (serviceSubType === 'Installation'
      ? 'Installation'
      : serviceSubType === 'Reinstallation'
        ? 'Reinstallation'
        : WATER_FILTER_SERVICE_LABEL);
  const leadCost =
    opts.leadCost != null && Number.isFinite(Number(opts.leadCost))
      ? Number(opts.leadCost)
      : null;
  const requireOtp = opts.requireOtp === true;

  const base = {
    serviceSubType,
    serviceLabel,
    name,
    leadSource,
    whatsappLeadLine,
    startedByAdmin: true,
    waterFilterService: true,
    needNewLocation: true,
    ...(leadCost != null ? { leadCost } : {}),
    ...(requireOtp ? { requireOtp: true } : {}),
    ...(existingId ? { existingCustomerId: existingId } : {}),
    ...(brand ? { brand } : {}),
  };

  await askLocationForWaterFilterService(ctx, base);
  return { ok: true, started: 'water_filter_service', mode: 'location_first' };
}

/**
 * Inbox quick: location → building/flat → photo → date → time → confirm.
 */
async function startBookLocationPhoto(ctx, opts = {}) {
  const existing = await lookupCustomerFull(ctx.db, ctx.to);
  const name =
    String(opts.customerName || opts.name || '').trim() ||
    String(existing?.full_name || '').trim() ||
    'Customer';
  const leadSource = resolveLeadSource(opts.leadSource);
  const base = {
    serviceSubType: 'Repair',
    serviceLabel: 'Service / Repair',
    name,
    leadSource,
    startedByAdmin: true,
    locationThenPhoto: true,
    needNewLocation: true,
    ...(existing?.id ? { existingCustomerId: existing.id } : {}),
  };
  await setBookingState(ctx.db, ctx.to, { ...base, step: 'await_location' });
  await sendLocationRequest({
    ...ctx,
    bodyText: [
      `Hi ${name}, let’s book your service.`,
      '',
      'First, please share your *service location*.',
      '',
      'Tap *Send location* below — we’ll ask for building/flat next, then a purifier photo.',
    ].join('\n'),
  });
  return { ok: true, started: 'book_location_photo', mode: 'location_then_photo' };
}

async function askLocationForWaterFilterService(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_location' });
  await sendLocationRequest({
    ...ctx,
    bodyText: buildLocationRequestBodyText(state),
  });
}

/** Seed pending action for cold-template reopen; resumed on next inbound. */
async function seedAdminPendingAction(db, phoneE164, action, extra = {}) {
  const phone = normalizePhoneE164(phoneE164);
  if (!db || !phone) return;
  await setBookingState(db, phone, {
    step: 'admin_pending',
    pendingAction: String(action || '').trim(),
    startedByAdmin: true,
    ...(extra && typeof extra === 'object' ? extra : {}),
  });
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
  const buildingFlat = String(draft.buildingFlat || '').trim();
  const streetParts = [buildingFlat, addressLine].filter(Boolean);
  const address = {
    street: streetParts.join(', ') || '',
    area: shortLoc || '',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '',
    landmark: buildingFlat || String(loc.name || shortLoc || '').trim() || '',
    ...(buildingFlat ? { building_flat: buildingFlat } : {}),
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
  serviceSite,
  leadSource,
  leadCost,
  requireOtp,
}) {
  const phone10 =
    phone10FromE164(customer?.phone) ||
    phone10FromE164(customer?.alternate_phone) ||
    phone10FromE164(phoneE164);
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
  const site = serviceSite === 'secondary' ? 'secondary' : 'primary';
  const lead = resolveLeadSource(leadSource);
  const cost =
    leadCost != null && Number.isFinite(Number(leadCost)) ? Math.max(0, Number(leadCost)) : null;
  const needOtp = requireOtp === true;
  const otpCode = needOtp ? String(Math.floor(1000 + Math.random() * 9000)) : null;

  const requirements = [
    {
      lead_source: lead,
      custom_time: timeMeta.label,
      booking_channel: 'whatsapp_bot',
      service_site: site,
      ...(customNote ? { custom_note: String(customNote).slice(0, 200) } : {}),
      ...(cost != null ? { lead_cost: cost } : {}),
      ...(phoneE164 && phone10FromE164(phoneE164) !== phone10
        ? { whatsapp_phone: phone10FromE164(phoneE164) }
        : {}),
    },
  ];
  if (needOtp && otpCode) {
    requirements.push({
      require_otp: true,
      otp_code: otpCode,
      otp_verified: false,
    });
  }

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
    service_site: site,
    description: `WhatsApp booking · ${subType} · ${timeMeta.label}${noteBit}`,
    requirements,
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

  // Ensure service_site even if older RPC ignores the column.
  if (job?.id && site === 'secondary') {
    try {
      await db.from('jobs').update({ service_site: 'secondary' }).eq('id', job.id);
    } catch (err) {
      console.warn('[whatsapp-booking-bot] service_site patch skipped', err?.message || err);
    }
  }

  // lead_cost / lead_source columns are not in create_job_for_booking INSERT whitelist.
  if (job?.id && (cost != null || lead)) {
    try {
      const patch = {};
      if (cost != null) patch.lead_cost = cost;
      if (lead) patch.lead_source = lead;
      await db.from('jobs').update(patch).eq('id', job.id);
    } catch (err) {
      console.warn('[whatsapp-booking-bot] lead_cost patch skipped', err?.message || err);
    }
  }

  return {
    ok: true,
    job,
    jobNumber: job?.job_number || jobNumber,
    timeLabel: timeMeta.label,
    serviceSite: site,
  };
}

/** Persist secondary site (+ optional alt phone) without touching primary address. */
async function saveSecondarySiteForBooking(db, customerId, phoneE164, loc, altPhone) {
  if (!db || !customerId || !loc) return { ok: false, error: 'missing data' };
  const phone10 = phone10FromE164(phoneE164);
  const updates = {
    alternate_location: buildAlternateLocationPayload(loc),
    alternate_address: buildAlternateAddressPayload(loc),
    alternate_visible_address:
      loc.shortLocation || loc.address || loc.name || loc.formattedAddress || null,
  };
  if (altPhone) updates.alternate_phone = String(altPhone).replace(/\D/g, '').slice(-10);

  try {
    const { data, error } = await db.rpc('update_customer_for_booking', {
      p_customer_id: customerId,
      p_phone: phone10,
      p_updates: updates,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) return { ok: true, customer: row };
    } else {
      console.warn('[whatsapp-booking-bot] alternate RPC failed:', error.message);
    }
  } catch (err) {
    console.warn('[whatsapp-booking-bot] alternate RPC threw:', err?.message || err);
  }

  // Service-role fallback when RPC does not yet accept alternate_* keys.
  const { data: patched, error: patchErr } = await db
    .from('customers')
    .update(updates)
    .eq('id', customerId)
    .select(
      'id,full_name,phone,alternate_phone,address,location,visible_address,alternate_address,alternate_location,alternate_visible_address,brand,model,service_type'
    )
    .maybeSingle();
  if (patchErr) {
    console.error('[whatsapp-booking-bot] alternate update failed:', patchErr.message);
    return { ok: false, error: patchErr.message };
  }
  return { ok: true, customer: patched };
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
  return sendButtons({
    ...ctx,
    bodyText: isNew ? GREETING_MENU.bodyNew : GREETING_MENU.bodyReturning,
    footer: GREETING_MENU.footer,
    buttons: GREETING_MENU.buttons,
  });
}

/** After a cold template opens the 24h window — same interactive UX as live chat. */
async function resumeSessionStyleFromPending(ctx, pendingAction, interactive, text, seed = {}) {
  const pending = String(pendingAction || '').trim();
  const intent =
    resolveGreetingIntent({
      id: interactive?.id,
      title: interactive?.title,
      text,
    }) ||
    (pending === 'book_reinstall'
      ? 'book_reinstall'
      : pending === 'talk_team' || pending === 'show_menu'
        ? null
        : pending === 'book_service' ||
            pending === 'request_location' ||
            pending === 'request_photo' ||
            pending === 'request_building_flat' ||
            pending === 'request_name' ||
            pending === 'water_filter_service' ||
            pending === 'book_location_photo'
          ? pending
          : null);

  if (intent === 'book_reinstall') {
    await beginServiceBooking(ctx, {
      serviceSubType: 'Reinstallation',
      serviceLabel: 'Reinstallation',
    });
    return { ok: true };
  }
  if (intent === 'book_location_photo' || pending === 'book_location_photo') {
    await startBookLocationPhoto(ctx, {
      customerName: seed.name || seed.customerName,
      leadSource: seed.leadSource,
    });
    return { ok: true };
  }
  if (intent === 'water_filter_service' || pending === 'water_filter_service') {
    await startWaterFilterServiceBooking(ctx, {
      customerName: seed.name || seed.customerName,
      name: seed.name || seed.customerName,
      leadSource: seed.leadSource,
      whatsappLeadLine: seed.whatsappLeadLine != null ? seed.whatsappLeadLine : '',
      brand: seed.brand,
      existingCustomerId: seed.existingCustomerId,
      customerId: seed.existingCustomerId,
      serviceSubType: seed.serviceSubType,
      serviceLabel: seed.serviceLabel,
      leadCost: seed.leadCost,
      requireOtp: seed.requireOtp,
    });
    return { ok: true };
  }
  if (intent === 'book_service') {
    const customer = await lookupCustomerFull(ctx.db, ctx.to);
    const existingId = String(seed.existingCustomerId || customer?.id || '').trim();
    if (existingId) {
      await beginExistingCustomerDateBooking(ctx, {
        serviceSubType: 'Service',
        serviceLabel: 'Service',
        existingCustomerId: existingId,
        name: seed.name || seed.customerName || customer?.full_name,
        leadSource: seed.leadSource || LEAD_SOURCE,
        startedByAdmin: true,
        ...(seed.serviceReminder ? { serviceReminder: true } : {}),
      });
      return { ok: true };
    }
    await beginServiceBooking(ctx, {
      serviceSubType: 'Repair',
      serviceLabel: 'Service / Repair',
    });
    return { ok: true };
  }
  if (intent === 'request_location' || pending === 'request_location') {
    return startAdminQuickAction(ctx, 'request_location', {
      customerName: seed.name || seed.customerName,
      brand: seed.brand,
      leadSource: seed.leadSource,
    });
  }
  if (intent === 'request_name' || pending === 'request_name') {
    const replyName = String(text || '').trim();
    if (replyName && isValidPersonName(replyName) && !interactive?.id) {
      await finishAdminNameOnly(ctx, {
        name: replyName,
        askNameOnly: true,
        startedByAdmin: true,
        brand: seed.brand,
      });
      return { ok: true };
    }
    return startAdminQuickAction(ctx, 'request_name', {
      brand: seed.brand,
    });
  }
  if (intent === 'talk_team' || pending === 'talk_team') {
    const customer = await lookupCustomerFull(ctx.db, ctx.to);
    const prefill = buildAdminHandoffPrefill({
      customer,
      state: {},
      phoneE164: ctx.to,
    });
    await setBookingState(ctx.db, ctx.to, {
      step: 'booking_complete',
      supportPrefill: prefill,
    });
    await sendElevenSupportButtons({
      ...ctx,
      bodyText: [
        `Chat with us on our main WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
        '',
        'Tap *Call 3311* to open the dialer, or *WhatsApp team* to message us.',
      ].join('\n'),
      footer: BRAND_LABEL,
    });
    return { ok: true };
  }
  if (
    pending === 'request_location' ||
    pending === 'request_photo' ||
    pending === 'request_building_flat' ||
    pending === 'request_name'
  ) {
    return startAdminQuickAction(ctx, pending, {
      customerName: seed.name || seed.customerName,
      brand: seed.brand,
      leadSource: seed.leadSource,
    });
  }
  // show_menu / unknown — identity gate / known context (same as in-session reopen)
  await startInboundIdentityFlow(ctx);
  return { ok: true };
}

/** Existing CRM customer — skip identity/location/photo; pick date & time only. */
function isExistingCustomerFastBook(state, customer) {
  const existingId = String(state?.existingCustomerId || customer?.id || '').trim();
  if (!existingId) return false;
  if (state?.needNewLocation || state?.useSecondarySite) return false;
  if (String(state?.serviceSubType || '') === 'Reinstallation') return false;
  if (state?.waterFilterService || state?.locationThenPhoto) return false;
  if (state?.startedByAdmin && state?.serviceSubType && state?.needNewLocation) return false;
  return true;
}

async function beginExistingCustomerDateBooking(ctx, state = {}) {
  const customer = await resolveCustomerForState(ctx.db, ctx.to, state);
  const existingId = String(
    state.existingCustomerId || state.linkedCustomerId || customer?.id || ''
  ).trim();
  if (!existingId) {
    await continueAfterServiceType(ctx, state);
    return;
  }
  const issueNote = String(state.issueNote || '').trim();
  const issueMedia = String(state.issueMediaUrl || state.photoUrl || '').trim();
  const base = {
    serviceSubType: state.serviceSubType || 'Repair',
    serviceLabel: state.serviceLabel || 'Service / Repair',
    existingCustomerId: existingId,
    name: String(state.name || customer?.full_name || 'Customer').trim() || 'Customer',
    leadSource: resolveLeadSource(state.leadSource),
    existingFastBook: true,
    ...(state.linkedCustomerId ? { linkedCustomerId: state.linkedCustomerId } : {}),
    ...(state.linkedFromOtherNumber ? { linkedFromOtherNumber: true } : {}),
    ...(issueNote ? { issueNote, customNote: issueNote } : {}),
    ...(issueMedia ? { photoUrl: issueMedia, issueMediaUrl: issueMedia } : {}),
    ...(state.startedByAdmin ? { startedByAdmin: true } : {}),
    ...(state.serviceReminder ? { serviceReminder: true } : {}),
  };
  await setBookingState(ctx.db, ctx.to, base);
  await sendDatePicker(ctx, base);
}

async function continueAfterTimeSelected(ctx, next, customer) {
  if (isExistingCustomerFastBook(next, customer)) {
    await sendNewCustomerConfirm(ctx, next);
    return;
  }
  await askPurifierPhoto(ctx, next);
}

/** Start Service/Repair or Reinstallation from greeting (or admin). */
async function beginServiceBooking(ctx, { serviceSubType, serviceLabel }) {
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  const base = {
    serviceSubType,
    serviceLabel: serviceLabel || serviceLabelFromState({ serviceSubType }),
  };
  if (customer?.id) {
    const isReinstall = String(serviceSubType || '') === 'Reinstallation';
    if (isReinstall) {
      await setBookingState(ctx.db, ctx.to, base);
      await sendIdentityConfirm(ctx, customer);
      return;
    }
    await beginExistingCustomerDateBooking(ctx, {
      ...base,
      existingCustomerId: customer.id,
      name: customer.full_name,
    });
    return;
  }
  await continueAfterServiceType(ctx, base);
}

async function askServiceType(ctx, state = {}) {
  // Phone already in CRM → existing customers skip straight to date/time.
  if (!state.existingCustomerId && !state.editing) {
    const existing = await lookupCustomerFull(ctx.db, ctx.to);
    if (existing?.id) {
      await beginExistingCustomerDateBooking(ctx, {
        ...state,
        existingCustomerId: existing.id,
        name: existing.full_name,
      });
      return;
    }
  }
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_service_type' });
  return sendButtons({
    ...ctx,
    bodyText: 'What do you need help with?',
    footer: 'Choose one',
    buttons: [
      { id: 'svc_repair', title: 'Service/Repair' },
      { id: 'svc_reinstall', title: 'Reinstallation' },
      { id: 'svc_custom', title: 'Custom' },
    ],
  });
}

async function startNewCustomerBooking(ctx, state = {}) {
  const existing = await lookupCustomerFull(ctx.db, ctx.to);
  if (existing?.id) {
    await setBookingState(ctx.db, ctx.to, state);
    await sendIdentityConfirm(ctx, existing);
    return;
  }
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_name' });
  await sendText({
    ...ctx,
    text: `Please reply with your *full name*.`,
  });
}

async function askAltPhone(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, {
    ...state,
    useSecondarySite: true,
    step: 'await_alt_phone',
  });
  await sendText({
    ...ctx,
    text: [
      'This visit will be saved as a *second site* on your account (your main address stays unchanged).',
      '',
      'Please reply with an *alternate mobile* for this site, or type *skip*.',
    ].join('\n'),
  });
}

async function askSecondaryLocation(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, {
    ...state,
    useSecondarySite: true,
    step: 'await_location',
  });
  await sendLocationRequest({
    ...ctx,
    bodyText:
      'Please share the *location for this visit* (secondary site).\n\nTap *Send location* below.',
  });
}

/** Reinstallation: always collect a pin and overwrite the saved (primary) address. */
async function askReinstallLocationUpdate(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, {
    ...state,
    needNewLocation: true,
    useSecondarySite: false,
    reinstallUpdateLocation: true,
    step: 'await_location',
  });
  const saved = formatAddressLine(await lookupCustomerFull(ctx.db, ctx.to));
  const savedLine = saved ? `\n\nWe currently have:\n*${saved}*` : '';
  await sendLocationRequest({
    ...ctx,
    bodyText: [
      'For *Reinstallation*, please share the *new location pin* where the purifier should be installed.',
      savedLine,
      '',
      'We’ll *update* your saved address with this pin.',
      '',
      'Tap *Send location* below.',
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

async function continueAfterServiceType(ctx, state) {
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  const isReinstall = String(state?.serviceSubType || '') === 'Reinstallation';
  if (state?.existingCustomerId || customer?.id) {
    // Reinstallation always needs a fresh pin (update existing address).
    // "Different location" (useSecondarySite) → secondary site path.
    const needsLoc =
      Boolean(state?.needNewLocation) ||
      Boolean(state?.useSecondarySite) ||
      Boolean(isReinstall && !state?.loc);

    if (state?.existingCustomerId && !state?.loc && needsLoc) {
      if (state?.useSecondarySite) {
        const next = { ...state, useSecondarySite: true, needNewLocation: true };
        if (!hasUsableAlternatePhone(customer) && !next.altPhone && !next.skipAltPhone) {
          await askAltPhone(ctx, next);
          return;
        }
        await askSecondaryLocation(ctx, next);
        return;
      }
      if (isReinstall) {
        await askReinstallLocationUpdate(ctx, {
          ...state,
          existingCustomerId: state.existingCustomerId || customer?.id,
        });
        return;
      }
      await askLocationForNew(ctx, { ...state, needNewLocation: true });
      return;
    }
    await sendDatePicker(ctx, state);
    return;
  }
  await startNewCustomerBooking(ctx, state);
}

async function askLocationForNew(ctx, state) {
  if (state?.waterFilterService) {
    await askLocationForWaterFilterService(ctx, state);
    return;
  }
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
  const secondaryNote = state?.useSecondarySite
    ? '\n\n_Saved as secondary site — primary address stays the same._'
    : state?.reinstallUpdateLocation || state?.serviceSubType === 'Reinstallation'
      ? '\n\n_We’ll update your saved address with this pin._'
      : '';
  const lat = state?.loc?.lat;
  const lng = state?.loc?.lng;
  const mapsUrl =
    lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`
      : '';

  const detailBody = [
    '📍 *Location received*',
    short ? short.trimEnd() : null,
    `*${locLine}*`,
    secondaryNote ? secondaryNote.trim() : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Native Open map button (CTA) — reply buttons cannot open Maps.
  if (mapsUrl) {
    await sendCtaUrl({
      ...ctx,
      bodyText: `${detailBody}\n\nTap *Open map* to check this pin on Google Maps.`,
      displayText: 'Open map',
      url: mapsUrl,
    });
  }

  await sendButtons({
    ...ctx,
    bodyText: mapsUrl
      ? 'Is this location correct?'
      : `${detailBody}\n\nIs this correct?`,
    footer: 'Confirm location',
    buttons: [
      { id: 'loc_yes', title: 'Yes, correct' },
      { id: 'loc_no', title: 'No, resend' },
      { id: 'talk_team', title: 'Chat with us' },
    ],
  });
}

/** After location confirm — building / flat / house no (skippable). */
async function askBuildingFlat(ctx, state = {}) {
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_building_flat' });
  let name = String(state.name || state.customerName || '').trim();
  if (!name) {
    const customer = await lookupCustomerFull(ctx.db, ctx.to);
    name = String(customer?.full_name || '').trim();
  }
  const hi = name ? `Hi ${name}, ` : '';
  await sendButtons({
    ...ctx,
    bodyText: [
      `${hi}please reply with your *building / flat / house number* (e.g. Flat 302, Block B).`,
      '',
      'If you don’t have one, tap *Skip* below.',
    ].join('\n'),
    footer: BRAND_LABEL,
    buttons: [
      { id: 'skip_building', title: 'Skip' },
      { id: 'talk_team', title: 'Chat with us' },
    ],
  });
}

/** Admin: This is brand Water Filter Service → collect full name only. */
async function askCustomerName(ctx, state = {}) {
  const who = waterFilterServiceLabelForBrand(state.brand);
  await setBookingState(ctx.db, ctx.to, {
    ...state,
    step: 'await_name',
    askNameOnly: true,
    startedByAdmin: true,
  });
  await sendText({
    ...ctx,
    text: [
      `This is ${who}. 👋`,
      '',
      'Please share your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
  });
}

async function finishAdminNameOnly(ctx, state) {
  const name = String(state.name || '').trim();
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  if (customer?.id && name) {
    const { error } = await ctx.db.from('customers').update({ full_name: name }).eq('id', customer.id);
    if (error) {
      console.error('[whatsapp-booking-bot] name update failed:', error.message);
    }
  }
  await clearBookingState(ctx.db, ctx.to);
  await sendText({
    ...ctx,
    text: name
      ? `Thank you, *${name}*. We’ve saved your name.`
      : 'Thank you — we’ve saved your name.',
  });
}

async function finishAdminLocationOnly(ctx, state) {
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  if (customer?.id && state?.loc?.lat != null) {
    const flat = String(state.buildingFlat || '').trim();
    const addressLine = String(state.loc.address || state.loc.formattedAddress || state.loc.name || '').trim();
    const shortLoc = String(state.loc.shortLocation || '').trim() || null;
    const streetParts = [flat, addressLine].filter(Boolean);
    const address = {
      street: streetParts.join(', ') || '',
      area: shortLoc || '',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '',
      landmark: flat || String(state.loc.name || shortLoc || '').trim() || '',
      ...(flat ? { building_flat: flat } : {}),
    };
    await ctx.db
      .from('customers')
      .update({
        location: {
          latitude: Number(state.loc.lat),
          longitude: Number(state.loc.lng),
          formattedAddress:
            state.loc.formattedAddress ||
            state.loc.address ||
            formatServiceLocationLine(state) ||
            `${state.loc.lat},${state.loc.lng}`,
          googleLocation: `https://www.google.com/maps/place/${state.loc.lat},${state.loc.lng}`,
          shortLocation: shortLoc,
        },
        visible_address: shortLoc || formatServiceLocationLine(state) || null,
        address,
      })
      .eq('id', customer.id);
  }
  const flatNote = String(state.buildingFlat || '').trim();
  await sendText({
    ...ctx,
    text: flatNote
      ? `Thanks — location and *${flatNote}* saved.`
      : 'Thanks — location saved.',
  });
  await clearBookingState(ctx.db, ctx.to);
}

async function finishAdminPhotoOnly(ctx, state) {
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  if (customer?.id && state?.photoUrl) {
    try {
      const { data: cust } = await ctx.db
        .from('customers')
        .select('photos')
        .eq('id', customer.id)
        .maybeSingle();
      const existing = Array.isArray(cust?.photos) ? cust.photos : [];
      const rest = existing.filter((p) => {
        const url = typeof p === 'string' ? p : p?.url;
        return url && url !== state.photoUrl;
      });
      await ctx.db
        .from('customers')
        .update({
          photos: [
            { url: state.photoUrl, source: 'whatsapp_bot', kind: 'unit' },
            ...rest,
          ].slice(0, 12),
        })
        .eq('id', customer.id);
    } catch (err) {
      console.warn('[whatsapp-booking-bot] admin photo save failed', err?.message || err);
    }
  }
  await sendText({
    ...ctx,
    text: 'Thanks — purifier photo saved.',
  });
  await clearBookingState(ctx.db, ctx.to);
}

async function continueAfterBuildingFlat(ctx, state) {
  if (state?.editing) {
    await resumeAfterEdit(ctx, state);
    return;
  }
  // Inbox quick: location → photo, then date/time
  if (state?.locationThenPhoto) {
    await askPurifierPhoto(ctx, state);
    return;
  }
  // Admin only asked for location (no booking)
  if (
    state?.startedByAdmin &&
    !state?.serviceSubType &&
    !state?.waterFilterService &&
    !state?.dateIso
  ) {
    await finishAdminLocationOnly(ctx, state);
    return;
  }
  await sendDatePicker(ctx, { ...state, step: 'await_date' });
}

async function sendDatePicker(ctx, state) {
  if (state) await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_date' });
  const customer = await lookupCustomerFull(ctx.db, ctx.to);
  const existingFast = isExistingCustomerFastBook(state, customer);
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
    bodyText: existingFast
      ? 'Pick a date for your service visit:'
      : 'Step 2 of 5 · Pick a date for the visit:',
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
    bodyText: `Step 3 of 5 · Date: *${formatDateIsoLabel(dateIso)}*\n\nChoose a time of day:`,
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
    bodyText: `Step 4 of 5 · Date: *${formatDateIsoLabel(dateIso)}*\n*${periodMeta.label}* (${periodMeta.frame})\n\nPick a time:`,
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
  const stepLabel = state?.locationThenPhoto
    ? 'Next'
    : 'Step 5 of 5';
  await sendText({
    ...ctx,
    text:
      `${stepLabel} · Please *send a photo of your purifier* to continue.\n\n` +
      'Clear photo of the purifier label / unit.\n\n(Photo is required — saved to your customer profile.)\n\n' +
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
  if (loc) {
    lines.push(`*Location:* ${loc}`);
    if (state.useSecondarySite) lines.push('_Secondary site_');
  } else if (existing && formatAddressLine(customer)) {
    lines.push(`*Location:* ${formatAddressLine(customer)}`);
  }
  if (String(state.buildingFlat || '').trim()) {
    lines.push(`*Building / flat:* ${String(state.buildingFlat).trim()}`);
  }
  if (state.photoUrl) lines.push('*Photo:* Received');
  return lines.join('\n');
}

async function sendNewCustomerConfirm(ctx, state) {
  let customer = null;
  if (state?.existingCustomerId || state?.linkedCustomerId) {
    customer = await resolveCustomerForState(ctx.db, ctx.to, state);
  }
  const lines = buildBookingSummaryLines(state, customer);
  const issue = String(state.issueNote || '').trim();
  const bodyText = issue
    ? `${lines}\n*Issue:* ${issue.slice(0, 120)}${state.issueMediaUrl || state.photoUrl ? '\n*Media:* Received' : ''}`
    : lines;
  await setBookingState(ctx.db, ctx.to, { ...state, step: 'await_confirm', editing: false });
  return sendButtons({
    ...ctx,
    bodyText,
    footer: state?.existingCustomerId ? 'Add job only' : 'Almost done',
    buttons: [
      { id: 'confirm_new', title: 'Yes, book now' },
      { id: 'edit_details', title: 'Edit details' },
      { id: 'talk_team', title: 'Chat with us' },
    ],
  });
}

async function sendIdentityConfirm(ctx, customer) {
  const name = String(customer.full_name || 'this customer').trim() || 'this customer';
  const loc = formatAddressLine(customer) || 'your saved address';
  return sendButtons({
    ...ctx,
    bodyText: [
      `Is this booking for *${name}*?`,
      `*${loc}*`,
      '',
      'Tap *Yes* to use this address, or *Different location* to add a second site.',
    ].join('\n'),
    footer: 'Confirm account',
    buttons: [
      { id: 'identity_yes', title: "Yes, that's me" },
      { id: 'identity_no', title: 'Different location' },
      { id: 'talk_team', title: 'Chat with us' },
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
      { id: 'talk_team', title: 'Chat with us' },
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
      { id: 'talk_team', title: 'Chat with us' },
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
      { id: 'talk_team', title: 'Chat with us' },
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
      { id: 'edit_service', title: 'Service type', description: 'Repair, reinstall, custom' },
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
          buildingFlat: state.buildingFlat || '',
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
          street: [String(state.buildingFlat || '').trim(), state.loc.address || state.loc.formattedAddress || addressLine || '']
            .filter(Boolean)
            .join(', '),
          area: shortLoc || '',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '',
          landmark: String(state.buildingFlat || '').trim() || state.loc.name || shortLoc || '',
          ...(String(state.buildingFlat || '').trim()
            ? { building_flat: String(state.buildingFlat).trim() }
            : {}),
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
    `Message our team on Eleven RO WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
    '',
    'Tap *Call 3311* to open the dialer, or *WhatsApp team* to chat (your details will be attached).',
  ].join('\n');

  await sendElevenSupportButtons({
    ...ctx,
    bodyText,
    footer: BRAND_LABEL,
  });
  // Keep prefill on state for WhatsApp button tap — stay on booking_complete
  await setBookingState(ctx.db, ctx.to, {
    ...st,
    step: 'booking_complete',
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

  // Restart identity flow if they say Hi mid-gate
  if (
    msgType === 'text' &&
    text &&
    GREETING_RE.test(text) &&
    state?.step &&
    [
      'await_identity_gate',
      'await_other_phone',
      'await_linked_identity_confirm',
      'await_facing_issue',
      'await_recent_problem',
      'await_issue_text',
      'await_issue_media',
      'await_first_time_menu',
      'await_known_menu',
      'await_amc_checkin',
    ].includes(state.step)
  ) {
    await clearBookingState(db, to);
    await startInboundIdentityFlow(ctx);
    return { handled: true };
  }

  // Admin inbox / cold template seeded intent — resume with *session* interactive UX.
  if (state?.step === 'admin_pending' && state?.pendingAction) {
    const pending = String(state.pendingAction || '').trim();
    const pendingSeed = { ...state };
    await clearBookingState(db, to);
    await resumeSessionStyleFromPending(ctx, pending, interactive, text, pendingSeed);
    return { handled: true };
  }

  // Cold "Share location" quick reply (or typed) without pending seed → Send location.
  if (
    resolveGreetingIntent({
      id: interactive?.id,
      title: interactive?.title,
      text,
    }) === 'request_location'
  ) {
    await startAdminQuickAction(ctx, 'request_location');
    return { handled: true };
  }

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
      // Fresh ask → menu or new booking (not everyone says Hi)
      if (msgType === 'text' && text) {
        if (REINSTALL_INTENT_RE.test(text)) {
          await clearBookingState(db, to);
          await beginServiceBooking(ctx, {
            serviceSubType: 'Reinstallation',
            serviceLabel: 'Reinstallation',
          });
          return { handled: true };
        }
        if (
          GREETING_RE.test(text) ||
          /\b(book|booking|again|another|new\s+(job|visit|service))\b/i.test(text)
        ) {
          await clearBookingState(db, to);
          const customer = await lookupCustomerFull(db, to);
          if (
            customer?.id &&
            (/\b(book|booking|again|another|new\s+(job|visit|service))\b/i.test(text) ||
              /^\s*book(ing)?\s*$/i.test(text.trim()))
          ) {
            await beginExistingCustomerDateBooking(ctx, {
              serviceSubType: 'Repair',
              serviceLabel: 'Service / Repair',
              existingCustomerId: customer.id,
              name: customer.full_name,
            });
            return { handled: true };
          }
          await startInboundIdentityFlow(ctx);
          return { handled: true };
        }
        if (REPAIR_INTENT_RE.test(text)) {
          await clearBookingState(db, to);
          await beginServiceBooking(ctx, {
            serviceSubType: 'Repair',
            serviceLabel: 'Service / Repair',
          });
          return { handled: true };
        }
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
  if (state?.step === 'await_other_phone' && msgType === 'text' && text && !GREETING_RE.test(text)) {
    const attempts = Number(state.otherPhoneAttempts || 0);
    if (attempts >= OTHER_PHONE_LOOKUP_MAX) {
      await sendText({
        ...ctx,
        text: 'Too many tries. Please tap *First time* to book as new, or *Call us*.',
      });
      await sendIdentityGate(ctx, { otherPhoneAttempts: attempts });
      return { handled: true };
    }
    const mobile = parseStrictIndianMobile(text);
    if (!mobile) {
      await setBookingState(db, to, {
        ...state,
        otherPhoneAttempts: attempts + 1,
        step: 'await_other_phone',
      });
      await sendText({
        ...ctx,
        text: 'That doesn’t look like a valid Indian mobile. Reply with a *10-digit* number starting 6–9.',
      });
      return { handled: true };
    }
    // Block looking up the same WA number as “other”
    if (mobile === phone10FromE164(to)) {
      await sendText({
        ...ctx,
        text: 'That’s this WhatsApp number. If you’re new here, tap *First time*.',
      });
      await sendIdentityGate(ctx, { otherPhoneAttempts: attempts });
      return { handled: true };
    }
    const found = await lookupCustomerFull(db, `91${mobile}`);
    const nextAttempts = attempts + 1;
    if (!found?.id) {
      if (nextAttempts >= OTHER_PHONE_LOOKUP_MAX) {
        await sendText({
          ...ctx,
          text: 'We couldn’t find that number after several tries. Tap *First time* to book as new, or *Call us*.',
        });
        await sendIdentityGate(ctx, { otherPhoneAttempts: nextAttempts });
        return { handled: true };
      }
      await setBookingState(db, to, {
        ...state,
        otherPhoneAttempts: nextAttempts,
        step: 'await_other_phone',
      });
      await sendText({
        ...ctx,
        text: `No customer found for *${mobile}*. Please check and reply again (${OTHER_PHONE_LOOKUP_MAX - nextAttempts} tries left), or go back and tap *First time*.`,
      });
      return { handled: true };
    }
    const lastInfo = await lookupLastServiceInfo(db, found.id, found);
    await sendLinkedIdentityConfirm(
      ctx,
      { ...state, otherPhoneAttempts: nextAttempts, lookedUpPhone10: mobile },
      found,
      lastInfo
    );
    return { handled: true };
  }

  if (state?.step === 'await_issue_text' && msgType === 'text' && text && !GREETING_RE.test(text)) {
    const note = text.trim().slice(0, 200);
    if (note.length < 3) {
      await sendText({
        ...ctx,
        text: 'Please describe the issue in a few words.',
      });
      return { handled: true };
    }
    await askIssueMedia(ctx, {
      ...state,
      issueNote: note,
      customNote: note,
    });
    return { handled: true };
  }

  if (state?.step === 'await_issue_media') {
    if (msgType === 'image' || msgType === 'video' || msgType === 'document') {
      const rawUrl = inboundMedia?.media_url || null;
      if (!rawUrl) {
        await sendText({
          ...ctx,
          text: 'We couldn’t save that file. Please send the photo or video again.',
        });
        return { handled: true };
      }
      const mediaUrl =
        (await ensurePublicCrmPhotoUrl(rawUrl, {
          mime: inboundMedia?.media_mime,
          filename:
            inboundMedia?.filename ||
            (msgType === 'video' ? 'issue.mp4' : 'issue.jpg'),
        })) || rawUrl;
      await sendText({ ...ctx, text: 'Thanks — we received your media.' });
      await beginLinkedOrKnownBooking(ctx, {
        ...state,
        issueMediaUrl: mediaUrl,
        photoUrl: mediaUrl,
        serviceSubType: state.serviceSubType || 'Repair',
        serviceLabel: state.serviceLabel || 'Service / Repair',
      });
      return { handled: true };
    }
    if (msgType === 'text' && text && !GREETING_RE.test(text)) {
      if (/^(skip|no photo|later)$/i.test(text.trim())) {
        await beginLinkedOrKnownBooking(ctx, {
          ...state,
          serviceSubType: state.serviceSubType || 'Repair',
          serviceLabel: state.serviceLabel || 'Service / Repair',
        });
        return { handled: true };
      }
      await sendText({
        ...ctx,
        text: 'Please send a *photo or video* of the issue, or type *skip* to continue without media.',
      });
      return { handled: true };
    }
  }

  // Re-prompt button menus if they type free text instead of tapping
  if (
    msgType === 'text' &&
    text &&
    !GREETING_RE.test(text) &&
    !interactive &&
    state?.step
  ) {
    if (state.step === 'await_identity_gate') {
      await sendIdentityGate(ctx, state);
      return { handled: true };
    }
    if (state.step === 'await_first_time_menu') {
      await sendFirstTimeMenu(ctx, state);
      return { handled: true };
    }
    if (state.step === 'await_known_menu') {
      await sendKnownMenu(ctx, state);
      return { handled: true };
    }
    if (state.step === 'await_amc_checkin') {
      await sendAmcCheckin(ctx, state);
      return { handled: true };
    }
    if (state.step === 'await_facing_issue') {
      await sendFacingIssuePrompt(ctx, state);
      return { handled: true };
    }
    if (state.step === 'await_recent_problem') {
      await sendRecentProblemPrompt(ctx, state);
      return { handled: true };
    }
    if (state.step === 'await_linked_identity_confirm') {
      await sendText({
        ...ctx,
        text: 'Please tap *Yes, this is me* or *No* below.',
      });
      return { handled: true };
    }
  }

  if (state?.step === 'await_alt_phone' && msgType === 'text' && text && !GREETING_RE.test(text)) {
    const raw = text.trim();
    let next = { ...state, useSecondarySite: true };
    if (/^skip$/i.test(raw)) {
      next = { ...next, skipAltPhone: true, altPhone: null };
    } else {
      const alt = normalizeAltPhoneInput(raw);
      if (!alt) {
        await sendText({
          ...ctx,
          text: 'Please reply with a valid 10-digit mobile, or type *skip*.',
        });
        return { handled: true };
      }
      next = { ...next, altPhone: alt, skipAltPhone: false };
    }
    await askSecondaryLocation(ctx, next);
    return { handled: true };
  }

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
    await continueAfterTimeSelected(ctx, next, await lookupCustomerFull(db, to));
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
    if (state.askNameOnly || (state.startedByAdmin && !state.serviceSubType && !state.waterFilterService)) {
      await finishAdminNameOnly(ctx, next);
      return { handled: true };
    }
    await askLocationForNew(ctx, next);
    return { handled: true };
  }

  if (state?.step === 'await_building_flat' && msgType === 'text' && text && !GREETING_RE.test(text) && !EDIT_RE.test(text)) {
    const flat = text.trim().slice(0, 80);
    if (/^skip$/i.test(flat)) {
      await continueAfterBuildingFlat(ctx, { ...state, buildingFlat: '' });
      return { handled: true };
    }
    await continueAfterBuildingFlat(ctx, { ...state, buildingFlat: flat });
    return { handled: true };
  }

  if (state?.step === 'await_model_or_photo') {
    if (msgType === 'image' || msgType === 'document') {
      const rawUrl = inboundMedia?.media_url || null;
      if (!rawUrl) {
        await sendText({
          ...ctx,
          text: 'We couldn’t save that photo. Please send the purifier photo again.',
        });
        return { handled: true };
      }
      const photoUrl =
        (await ensurePublicCrmPhotoUrl(rawUrl, {
          mime: inboundMedia?.media_mime,
          filename: inboundMedia?.filename || 'purifier.jpg',
        })) || rawUrl;
      if (!/^https:\/\//i.test(String(photoUrl)) || !/cloudinary/i.test(String(photoUrl))) {
        console.warn(
          '[whatsapp-booking-bot] photo not on Cloudinary — CRM may not show it',
          String(photoUrl).slice(0, 80)
        );
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
      // Admin only asked for a photo (no booking)
      if (
        state.startedByAdmin &&
        !state.serviceSubType &&
        !state.waterFilterService &&
        !state.locationThenPhoto &&
        !state.dateIso
      ) {
        await finishAdminPhotoOnly(ctx, next);
        return { handled: true };
      }
      if (state.locationThenPhoto && !state.dateIso) {
        await sendDatePicker(ctx, { ...next, step: 'await_date', locationThenPhoto: false });
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

  if (interactive?.id || interactive?.title) {
    let id = interactive.id || '';
    const menuIntentEarly = resolveGreetingIntent({
      id,
      title: interactive.title,
      text: '',
    });
    if (menuIntentEarly === 'talk_team') id = 'talk_team';
    if (menuIntentEarly === 'book_service') id = 'book_service';
    if (menuIntentEarly === 'book_reinstall') id = 'book_reinstall';

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

    // —— Identity gate / known-customer menus ——
    if (id === 'id_call_us' || id === 'known_call' || id === 'first_call') {
      const customer = await resolveCustomerForState(db, to, state || {});
      await sendCallUsHandoff(ctx, customer, state || {});
      return { handled: true };
    }

    if (id === 'id_first_time') {
      await sendFirstTimeMenu(ctx, {});
      return { handled: true };
    }

    if (id === 'id_other_number') {
      await askOtherPhone(ctx, { otherPhoneAttempts: Number(state?.otherPhoneAttempts || 0) });
      return { handled: true };
    }

    if (id === 'first_book') {
      await clearBookingState(db, to);
      await beginServiceBooking(ctx, {
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
      });
      return { handled: true };
    }

    if (id === 'first_chat' || id === 'known_chat') {
      const customer = await resolveCustomerForState(db, to, state || {});
      await sendChatHandoff(ctx, customer, state || {});
      return { handled: true };
    }

    if (id === 'known_book' || id === 'amc_book') {
      await beginLinkedOrKnownBooking(ctx, {
        ...(state || {}),
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
      });
      return { handled: true };
    }

    if (id === 'amc_issue' || id === 'recent_yes') {
      await askIssueExplain(ctx, {
        ...(state || {}),
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
      });
      return { handled: true };
    }

    if (id === 'recent_no') {
      await sendKnownMenu(ctx, state || {});
      return { handled: true };
    }

    if (id === 'face_yes') {
      const days = state?.lastServiceDaysAgo;
      const recent =
        days != null && days >= 0 && days < RECENT_SERVICE_DAYS;
      if (recent) {
        await askIssueExplain(ctx, {
          ...(state || {}),
          serviceSubType: 'Repair',
          serviceLabel: 'Service / Repair',
        });
        return { handled: true };
      }
      await beginLinkedOrKnownBooking(ctx, {
        ...(state || {}),
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
      });
      return { handled: true };
    }

    if (id === 'face_no') {
      await beginLinkedOrKnownBooking(ctx, {
        ...(state || {}),
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
      });
      return { handled: true };
    }

    if (id === 'link_yes') {
      const linkId = String(state?.pendingLinkCustomerId || '').trim();
      if (!linkId) {
        await sendIdentityGate(ctx, {});
        return { handled: true };
      }
      await continueAfterLinkedConfirm(ctx, {
        ...(state || {}),
        linkedCustomerId: linkId,
        existingCustomerId: linkId,
        linkedFromOtherNumber: true,
        name: state?.pendingLinkName || state?.name,
        pendingLinkCustomerId: undefined,
        pendingLinkName: undefined,
      });
      return { handled: true };
    }

    if (id === 'link_no') {
      await sendText({
        ...ctx,
        text: 'No problem. You can try another number, or book as first time.',
      });
      await sendIdentityGate(ctx, {
        otherPhoneAttempts: Number(state?.otherPhoneAttempts || 0),
      });
      return { handled: true };
    }

    if (id === 'book_service') {
      await clearBookingState(db, to);
      await beginServiceBooking(ctx, {
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
      });
      return { handled: true };
    }

    if (id === 'book_reinstall') {
      await clearBookingState(db, to);
      await beginServiceBooking(ctx, {
        serviceSubType: 'Reinstallation',
        serviceLabel: 'Reinstallation',
      });
      return { handled: true };
    }

    // Legacy greeting button — redirect to Chat with us (Eleven 3311)
    if (id === 'call_back') {
      const customer = await lookupCustomerFull(db, to);
      const prefill = buildAdminHandoffPrefill({ customer, state: {}, phoneE164: to });
      await setBookingState(db, to, { step: 'booking_complete', supportPrefill: prefill });
      await sendElevenSupportButtons({
        ...ctx,
        bodyText: [
          `Chat with us on our main WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
          '',
          'Tap *Call 3311* to open the dialer, or *WhatsApp team* to message us.',
        ].join('\n'),
        footer: BRAND_LABEL,
      });
      return { handled: true };
    }

    if (id === 'svc_repair' || id === 'svc_reinstall' || id === 'svc_install' || id === 'svc_custom') {
      const choice = SERVICE_CHOICES[id] || {
        label: 'Service',
        subType: 'Service',
      };
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
          `Need anything else? Message our team on Eleven RO WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
          'Tap *Call 3311* or *WhatsApp team* (details attached).',
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
      await askBuildingFlat(ctx, { ...(st || {}) });
      return { handled: true };
    }

    if (id === 'skip_building') {
      const st = (await getBookingState(db, to)) || state || {};
      await continueAfterBuildingFlat(ctx, { ...st, buildingFlat: '' });
      return { handled: true };
    }

    if (id === 'loc_no') {
      const st = state || { step: 'await_location' };
      if (st.useSecondarySite) {
        await askSecondaryLocation(ctx, { ...st, step: 'await_location', loc: undefined });
      } else if (
        st.reinstallUpdateLocation ||
        String(st.serviceSubType || '') === 'Reinstallation'
      ) {
        await askReinstallLocationUpdate(ctx, {
          ...st,
          step: 'await_location',
          loc: undefined,
        });
      } else {
        await askLocationForNew(ctx, { ...st, step: 'await_location', loc: undefined });
      }
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
      const existingByPhone = await resolveCustomerForState(db, to, st || {});
      const isExisting = Boolean(st?.existingCustomerId || st?.linkedCustomerId || existingByPhone?.id);

      if ((!st?.name && !isExisting) || !st?.dateIso || !st?.slotKey) {
        await sendText({
          ...ctx,
          text: 'Something is missing. Please tap *Book Service* to start again.',
        });
        await beginServiceBooking(ctx, {
          serviceSubType: st?.serviceSubType || 'Repair',
          serviceLabel: st?.serviceLabel || 'Service / Repair',
        });
        return { handled: true };
      }
      if (!st.photoUrl && !isExistingCustomerFastBook(st, existingByPhone)) {
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
        customer = existingByPhone || (await resolveCustomerForState(db, to, st || {}));
        if (!customer?.id) {
          await sendText({
            ...ctx,
            text: 'We couldn’t load your account. Please tap *Book Service* to try again.',
          });
          return { handled: true };
        }
        if (st.loc) {
          // Secondary only when customer chose "Different location".
          // Reinstallation updates the existing (primary) address.
          const useSecondary = Boolean(st.useSecondarySite);
          try {
            if (useSecondary) {
              const saved = await saveSecondarySiteForBooking(
                db,
                customer.id,
                to,
                { ...st.loc, buildingFlat: st.buildingFlat || '' },
                st.altPhone || null
              );
              if (saved.customer) customer = saved.customer;
              st.useSecondarySite = true;
            } else {
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
                    street: [String(st.buildingFlat || '').trim(), st.loc.address || st.loc.formattedAddress || '']
                      .filter(Boolean)
                      .join(', '),
                    area: st.loc.shortLocation || '',
                    city: 'Bangalore',
                    state: 'Karnataka',
                    pincode: '',
                    landmark:
                      String(st.buildingFlat || '').trim() ||
                      st.loc.name ||
                      st.loc.shortLocation ||
                      '',
                    ...(String(st.buildingFlat || '').trim()
                      ? { building_flat: String(st.buildingFlat).trim() }
                      : {}),
                  },
                },
              });
              customer = (await lookupCustomerFull(db, to)) || customer;
            }
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
          text: `Please tap *Service/Repair* to start again.`,
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
            buildingFlat: st.buildingFlat || '',
          }
        : await getRememberedLocation(db, to);
      if (locOverride && st.buildingFlat && !locOverride.buildingFlat) {
        locOverride.buildingFlat = st.buildingFlat;
      }

      const serviceSite = st.useSecondarySite ? 'secondary' : 'primary';

      const created = await createAutoBookingJob(db, {
        phoneE164: to,
        customer,
        dateIso: st.dateIso,
        slotKey: st.slotKey,
        locOverride,
        photoUrl: st.photoUrl || st.issueMediaUrl || null,
        modelOverride: st.model || null,
        serviceSubType: st.serviceSubType || 'Service',
        customNote: st.issueNote || st.customNote || null,
        customTimeLabel: st.customTimeLabel || null,
        periodSlot: st.periodSlot || null,
        serviceSite,
        leadSource: st.leadSource || LEAD_SOURCE,
        leadCost: st.leadCost != null ? st.leadCost : null,
        requireOtp: st.requireOtp === true,
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
      const st = state || {};
      const isReinstall = String(st.serviceSubType || '') === 'Reinstallation';
      const base = {
        name: customer?.full_name || st.name || 'Customer',
        existingCustomerId: customer?.id || null,
        // Reinstallation: always ask for a new pin and update saved address.
        needNewLocation: isReinstall,
        useSecondarySite: false,
        reinstallUpdateLocation: isReinstall,
        serviceSubType: st.serviceSubType || null,
        serviceLabel: st.serviceLabel || null,
      };
      if (base.serviceSubType) {
        await continueAfterServiceType(ctx, {
          ...st,
          ...base,
          serviceLabel: base.serviceLabel || serviceLabelFromState(base),
        });
      } else {
        await askServiceType(ctx, base);
      }
      return { handled: true };
    }

    if (id === 'identity_no') {
      const customer = await lookupCustomerFull(db, to);
      const st = state || {};
      const base = {
        name: customer?.full_name || st.name || 'Customer',
        existingCustomerId: customer?.id || null,
        needNewLocation: true,
        useSecondarySite: true,
        serviceSubType: st.serviceSubType || null,
        serviceLabel: st.serviceLabel || null,
      };
      if (base.serviceSubType) {
        await continueAfterServiceType(ctx, {
          ...st,
          ...base,
          serviceLabel: base.serviceLabel || serviceLabelFromState(base),
        });
      } else {
        await askServiceType(ctx, base);
      }
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
          `Chat with us on our main WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
          '',
          `*Call 3311* opens your phone dialer.`,
          `*WhatsApp team* opens chat with details attached when available.`,
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
      await continueAfterTimeSelected(ctx, next, await resolveCustomerForState(db, to, next));
      return { handled: true };
    }

    if (id.startsWith('confirm__')) {
      const parts = id.split('__');
      const date = parts[1] || '';
      const slotKey = parts[2] || '10-AM';
      const st = (await getBookingState(db, to)) || state || {};
      const customerForConfirm = await resolveCustomerForState(db, to, st);
      if (!st.photoUrl && !isExistingCustomerFastBook(st, customerForConfirm)) {
        await sendText({
          ...ctx,
          text: 'A *purifier photo is required* before we can book.',
        });
        await askPurifierPhoto(ctx, { ...st, dateIso: date, slotKey });
        return { handled: true };
      }
      const customer = customerForConfirm;
      const locOverride = st.loc
        ? {
            lat: st.loc.lat,
            lng: st.loc.lng,
            name: st.loc.name,
            address: st.loc.address,
            shortLocation: st.loc.shortLocation,
            formattedAddress: st.loc.formattedAddress,
            buildingFlat: st.buildingFlat || '',
          }
        : await getRememberedLocation(db, to);
      if (locOverride && st.buildingFlat && !locOverride.buildingFlat) {
        locOverride.buildingFlat = st.buildingFlat;
      }

      if (!customer?.id) {
        await sendText({
          ...ctx,
          text: `Please use *Book Service* so we can collect your details first.`,
        });
        await beginServiceBooking(ctx, {
          serviceSubType: st.serviceSubType || 'Repair',
          serviceLabel: st.serviceLabel || 'Service / Repair',
        });
        return { handled: true };
      }

      const created = await createAutoBookingJob(db, {
        phoneE164: to,
        customer,
        dateIso: date,
        slotKey,
        locOverride,
        photoUrl: st.photoUrl || st.issueMediaUrl || null,
        modelOverride: st.model || null,
        serviceSubType: st.serviceSubType || 'Service',
        customNote: st.issueNote || st.customNote || null,
        customTimeLabel: st.customTimeLabel || null,
        periodSlot: st.periodSlot || null,
        serviceSite: st.useSecondarySite ? 'secondary' : 'primary',
        leadSource: st.leadSource || LEAD_SOURCE,
        leadCost: st.leadCost != null ? st.leadCost : null,
        requireOtp: st.requireOtp === true,
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

  // Cold / idle inbound: not everyone says "Hi" — any text opens menu or starts an intent.
  // (Post-book free-form already returned earlier via sendPostBookingHumanRedirect.)
  if (
    msgType === 'text' &&
    text &&
    !midActiveFlow &&
    state?.step !== 'await_post_book' &&
    state?.step !== 'booking_complete'
  ) {
    const customer = await lookupCustomerFull(db, to);

    if (REINSTALL_INTENT_RE.test(text)) {
      await clearBookingState(db, to);
      await beginServiceBooking(ctx, {
        serviceSubType: 'Reinstallation',
        serviceLabel: 'Reinstallation',
      });
      return { handled: true };
    }

    // Prefer chat handoff only when they clearly ask for a human (not "help me book").
    if (CHAT_INTENT_RE.test(text) && !REPAIR_INTENT_RE.test(text)) {
      const prefill = buildAdminHandoffPrefill({
        customer,
        state: {},
        phoneE164: to,
      });
      await setBookingState(db, to, { step: 'booking_complete', supportPrefill: prefill });
      await sendElevenSupportButtons({
        ...ctx,
        bodyText: [
          `Chat with us on our main WhatsApp (*${SUPPORT_PHONE_DISPLAY}*).`,
          '',
          'Tap *Call 3311* to open the dialer, or *WhatsApp team* to message us.',
        ].join('\n'),
        footer: BRAND_LABEL,
      });
      return { handled: true };
    }

    if (REPAIR_INTENT_RE.test(text) && !GREETING_RE.test(text)) {
      await clearBookingState(db, to);
      await startInboundIdentityFlow(ctx);
      return { handled: true };
    }

    if (customer?.id && /^\s*(book(ing)?|book\s*now)\s*$/i.test(text.trim())) {
      await clearBookingState(db, to);
      await beginExistingCustomerDateBooking(ctx, {
        serviceSubType: 'Repair',
        serviceLabel: 'Service / Repair',
        existingCustomerId: customer.id,
        name: customer.full_name,
      });
      return { handled: true };
    }

    // Default: identity gate (unknown) or known-customer context menus
    await clearBookingState(db, to);
    await startInboundIdentityFlow(ctx);
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
  lookupCustomerById,
  resolveCustomerForState,
  parseStrictIndianMobile,
  startInboundIdentityFlow,
  createAutoBookingJob,
  startAdminQuickAction,
  seedAdminPendingAction,
  startWaterFilterServiceBooking,
  startBookLocationPhoto,
  hasOpenCustomerServiceWindow,
  clearBookingState,
  setBookingState,
  getBookingState,
  askServiceType,
  sendIdentityConfirm,
  askPurifierPhoto,
  sendGreetingMenu,
  GREETING_MENU,
  resolveGreetingIntent,
  resumeSessionStyleFromPending,
  WATER_FILTER_SERVICE_LABEL,
  DEFAULT_LEAD_SOURCES,
  OTHER_PHONE_LOOKUP_MAX,
  RECENT_SERVICE_DAYS,
};
