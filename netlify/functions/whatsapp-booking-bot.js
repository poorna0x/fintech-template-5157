/**
 * In-session (24h) WhatsApp booking bot — reply buttons + location request + CTA.
 * Flow: Hi → Book → CRM phone match → confirm name/address → date → time → auto job
 *        (lead_source: Direct call, status PENDING).
 * Cold outreach still needs Meta-approved templates (see whatsappColdTemplates.ts).
 */
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
} = require('./whatsapp-helper');

const BOOK_URL = (
  process.env.WHATSAPP_BOOK_URL ||
  process.env.VITE_PUBLIC_SITE_URL ||
  'https://hydrogenro.com/book'
)
  .trim()
  .replace(/\/$/, '');
const SUPPORT_PHONE_DISPLAY = '8884944288';
const LEAD_SOURCE = 'Direct call';

const GREETING_RE =
  /^(hi+|hii+|hello|hey|hola|namaste|book|booking|service|start|menu)\b/i;

const TIME_SLOTS = {
  '10-AM': { slot: 'MORNING', label: '10:00 AM' },
  '2-PM': { slot: 'AFTERNOON', label: '2:00 PM' },
  '5-PM': { slot: 'EVENING', label: '5:00 PM' },
};

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

function buildServiceAddress(customer, locOverride) {
  if (locOverride?.address || locOverride?.name) {
    return {
      street: locOverride.address || locOverride.name || '',
      area: '',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '',
      landmark: locOverride.name || '',
    };
  }
  const a = customer?.address && typeof customer.address === 'object' ? customer.address : {};
  return {
    street: a.street || customer?.visible_address || '',
    area: a.area || '',
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
        locOverride.address || locOverride.name || `${lat},${lng}`,
      googleLocation: `https://www.google.com/maps/place/${lat},${lng}`,
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
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { preview_url: true, body: String(text).slice(0, 4096) },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(db, phone, waId, 'text', text, result);
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

async function createAutoBookingJob(db, { phoneE164, customer, dateIso, slotKey, locOverride }) {
  const phone10 = phone10FromE164(phoneE164);
  const timeMeta = TIME_SLOTS[slotKey] || {
    slot: 'MORNING',
    label: String(slotKey || '').replace(/-/g, ' ') || 'TBD',
  };
  const serviceType = customer.service_type || 'RO';
  const jobNumber = generateJobNumber(serviceType);
  const service_address = buildServiceAddress(customer, locOverride);
  const service_location = buildServiceLocation(customer, locOverride);

  const row = {
    job_number: jobNumber,
    customer_id: customer.id,
    service_type: serviceType,
    service_sub_type: 'Service',
    brand: customer.brand || 'Not specified',
    model: customer.model || 'Not specified',
    scheduled_date: dateIso,
    scheduled_time_slot: timeMeta.slot,
    estimated_duration: 120,
    service_address,
    service_location,
    description: `WhatsApp booking bot · ${timeMeta.label}`,
    requirements: [
      {
        lead_source: LEAD_SOURCE,
        custom_time: timeMeta.label,
        booking_channel: 'whatsapp_bot',
      },
    ],
    estimated_cost: 0,
    payment_status: 'PENDING',
    before_photos: [],
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

async function notifyOwnerBestEffort(customer, phoneE164, dateIso, timeLabel, jobNumber) {
  try {
    const { sendBookingAdminNotification } = require('./booking-notify');
    await sendBookingAdminNotification({
      customerName: customer?.full_name || '',
      phone: phone10FromE164(phoneE164),
      brandSource: 'hydrogenro',
      bookingDomain: 'whatsapp',
      serviceType: customer?.service_type || 'RO',
      serviceSubType: 'Service',
      scheduledDate: dateIso,
      scheduledTimeSlot: timeLabel,
      customTime: timeLabel,
      jobNumber,
    });
  } catch (err) {
    console.warn('[whatsapp-booking-bot] owner notify skipped:', err?.message || err);
  }
}

async function sendGreetingMenu(ctx) {
  return sendButtons({
    ...ctx,
    bodyText: 'Hi! Welcome to HydrogenRO 💧\n\nHow can we help you today?',
    footer: 'HydrogenRO',
    buttons: [
      { id: 'book_service', title: 'Book service' },
      { id: 'share_location', title: 'Share location' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function sendIdentityConfirm(ctx, customer) {
  const name = String(customer.full_name || 'this customer').trim() || 'this customer';
  const loc = formatAddressLine(customer) || 'the address saved in our CRM';
  return sendButtons({
    ...ctx,
    bodyText: `We found this number in our CRM.\n\nIs this booking for *${name}* at:\n📍 ${loc}\n\nTap Yes to continue with the same details.`,
    footer: 'Confirm details',
    buttons: [
      { id: 'identity_yes', title: "Yes, that's me" },
      { id: 'identity_no', title: 'No / new address' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function sendDatePicker(ctx) {
  return sendButtons({
    ...ctx,
    bodyText: 'When would you like the service visit?',
    footer: 'Pick a day',
    buttons: [
      {
        id: dateId(0),
        title: `Today (${istDateLabel(0).split(' ').slice(1).join(' ')})`.slice(0, 20),
      },
      { id: dateId(1), title: istDateLabel(1).slice(0, 20) },
      { id: dateId(2), title: istDateLabel(2).slice(0, 20) },
    ],
  });
}

async function sendTimePicker(ctx, dateIso) {
  return sendButtons({
    ...ctx,
    bodyText: `Got it (${dateIso}). What time works best?`,
    footer: 'Pick a slot',
    buttons: [
      { id: `time__10-AM__${dateIso}`, title: '10:00 AM' },
      { id: `time__2-PM__${dateIso}`, title: '2:00 PM' },
      { id: `time__5-PM__${dateIso}`, title: '5:00 PM' },
    ],
  });
}

async function sendConfirm(ctx, dateIso, slotKey, customer) {
  const timeMeta = TIME_SLOTS[slotKey] || { label: String(slotKey).replace(/-/g, ' ') };
  const nameLine = customer?.full_name ? `\n👤 ${customer.full_name}` : '';
  const locLine = formatAddressLine(customer) ? `\n📍 ${formatAddressLine(customer)}` : '';
  return sendButtons({
    ...ctx,
    bodyText: `Confirm booking?\n\n📅 ${dateIso}\n⏰ ${timeMeta.label}${nameLine}${locLine}\n\nYes will create your job in CRM (Direct call).`,
    footer: 'Almost done',
    buttons: [
      { id: `confirm__${dateIso}__${slotKey}`.slice(0, 256), title: 'Yes, book now' },
      { id: 'book_service', title: 'Change' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function afterLocationShared(ctx, locSummary) {
  await sendText({
    ...ctx,
    text: `📍 Location received${locSummary ? `:\n${locSummary}` : '.'}\n\nThanks!`,
  });
  await sendButtons({
    ...ctx,
    bodyText: 'Continue booking a service visit?',
    footer: 'Next step',
    buttons: [
      { id: 'pick_date', title: 'Pick date & time' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

async function startNewCustomerBooking(ctx) {
  await sendLocationRequest({
    ...ctx,
    bodyText:
      'We don’t have this number in CRM yet.\n\nPlease share your location so we can book the visit.',
  });
  await sendButtons({
    ...ctx,
    bodyText: 'Or skip location for now and pick a slot (our team will confirm address):',
    buttons: [
      { id: 'pick_date', title: 'Skip → pick date' },
      { id: 'talk_team', title: 'Talk to team' },
    ],
  });
}

/**
 * Handle one inbound WhatsApp message for the booking bot.
 */
async function handleBookingBotInbound({ db, accessToken, phoneNumberId, msg }) {
  const enabled = await isBookingBotEnabled(db);
  if (!enabled) return { handled: false };

  const to = normalizePhoneE164(msg.from);
  if (!to) return { handled: false };

  const ctx = { db, accessToken, phoneNumberId, to };
  const interactive = extractInteractiveReply(msg);
  const text = String(msg.text?.body || '').trim();

  // Customer shared a location pin
  if (String(msg.type) === 'location' && msg.location) {
    const { latitude, longitude, name, address } = msg.location;
    const maps = `https://maps.google.com/?q=${latitude},${longitude}`;
    const locSummary = [name, address, maps].filter(Boolean).join('\n');
    await rememberSharedLocation(db, to, { latitude, longitude, name, address });
    await afterLocationShared(ctx, locSummary);
    return { handled: true };
  }

  if (interactive?.id) {
    const id = interactive.id;

    if (id === 'book_service') {
      const customer = await lookupCustomerFull(db, to);
      if (customer?.id) {
        await sendIdentityConfirm(ctx, customer);
      } else {
        await startNewCustomerBooking(ctx);
      }
      return { handled: true };
    }

    if (id === 'identity_yes') {
      await insertWhatsAppMessage(db, {
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'text',
        body: '[Booking bot] identity_confirmed',
        status: 'sent',
      });
      await sendText({
        ...ctx,
        text: 'Great — we’ll use your saved name and location.',
      });
      await sendDatePicker(ctx);
      return { handled: true };
    }

    if (id === 'identity_no') {
      await sendLocationRequest({
        ...ctx,
        bodyText:
          'No problem. Please share the correct location for this visit (or nearest landmark).',
      });
      await sendButtons({
        ...ctx,
        bodyText: 'After sharing location, pick a date — or skip for now:',
        buttons: [
          { id: 'pick_date', title: 'Skip → pick date' },
          { id: 'talk_team', title: 'Talk to team' },
        ],
      });
      return { handled: true };
    }

    if (id === 'share_location') {
      await sendLocationRequest({ ...ctx });
      return { handled: true };
    }

    if (id === 'pick_date') {
      await sendDatePicker(ctx);
      return { handled: true };
    }

    if (id === 'talk_team') {
      await sendText({
        ...ctx,
        text: `Okay — a team member will reply here shortly.\n\nYou can also call ${SUPPORT_PHONE_DISPLAY}.`,
      });
      await sendCtaUrl({
        ...ctx,
        bodyText: 'Or book online anytime:',
        displayText: 'Book online',
        url: `${BOOK_URL.startsWith('http') ? BOOK_URL : `https://${BOOK_URL}`}`,
      });
      return { handled: true };
    }

    const dateIso = parseDateId(id);
    if (dateIso) {
      await sendTimePicker(ctx, dateIso);
      return { handled: true };
    }

    if (id.startsWith('time__')) {
      const parts = id.split('__');
      const slotKey = parts[1] || '10-AM';
      const date = parts[2] || 'soon';
      const customer = await lookupCustomerFull(db, to);
      await sendConfirm(ctx, date, slotKey, customer);
      return { handled: true };
    }

    if (id.startsWith('confirm__')) {
      const parts = id.split('__');
      const date = parts[1] || '';
      const slotKey = parts[2] || '10-AM';
      const customer = await lookupCustomerFull(db, to);
      const locOverride = await getRememberedLocation(db, to);

      if (!customer?.id) {
        await sendText({
          ...ctx,
          text: `Thanks — we received your preferred slot (${date} ${TIME_SLOTS[slotKey]?.label || slotKey}).\n\nThis number isn’t in CRM yet, so our team will create the job and confirm here or by phone (${SUPPORT_PHONE_DISPLAY}).`,
        });
        await sendCtaUrl({
          ...ctx,
          bodyText: 'Or finish booking online with full details:',
          displayText: 'Book online',
          url: `${BOOK_URL.startsWith('http') ? BOOK_URL : `https://${BOOK_URL}`}`,
        });
        await insertWhatsAppMessage(db, {
          direction: 'outbound',
          phone_e164: to,
          msg_type: 'text',
          body: `[Booking bot] Pending new-customer booking: ${date} ${slotKey}`,
          status: 'sent',
        });
        return { handled: true };
      }

      const created = await createAutoBookingJob(db, {
        phoneE164: to,
        customer,
        dateIso: date,
        slotKey,
        locOverride,
      });

      if (!created.ok) {
        await sendText({
          ...ctx,
          text: `We couldn’t auto-create the job right now. Our team will book ${date} ${TIME_SLOTS[slotKey]?.label || slotKey} for you shortly.\n\nCall ${SUPPORT_PHONE_DISPLAY} if urgent.`,
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

      await sendText({
        ...ctx,
        text: `✅ Booked!\n\nJob: *${created.jobNumber}*\n📅 ${date}\n⏰ ${created.timeLabel}\n👤 ${customer.full_name || ''}\n📍 ${formatAddressLine(customer) || 'Address on file'}\n\nLead source: Direct call\nStatus: PENDING (unassigned)\n\nWe’ll assign a technician and update you here.`,
      });
      await insertWhatsAppMessage(db, {
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'text',
        body: `[Booking bot] Auto job created: ${created.jobNumber} · ${date} ${created.timeLabel} · ${LEAD_SOURCE}`,
        status: 'sent',
        customer_id: customer.id,
      });
      void notifyOwnerBestEffort(customer, to, date, created.timeLabel, created.jobNumber);
      return { handled: true };
    }
  }

  if (msg.type === 'text' && text && GREETING_RE.test(text)) {
    await sendGreetingMenu(ctx);
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
