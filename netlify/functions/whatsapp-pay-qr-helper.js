/**
 * Technician pay-QR watch: after Cloud API UPI QR send, inbound photos from
 * that number are forwarded to the sending technician for 30 minutes.
 */
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');
const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  uploadOutboundFileToWhatsAppMedia,
} = require('./whatsapp-helper');
const { getR2ObjectBytes } = require('./r2-helper');

const WATCH_MINUTES = 30;
const CATEGORY = 'pay_qr_screenshot';
/** IMAGE-header UTILITY — customer photo to technician when the 24h window is closed. */
const TECH_PHOTO_TEMPLATE = 'svc_tech_customer_photo_v1';

function isHttps(url) {
  return /^https:\/\//i.test(String(url || '').trim());
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function isClosedWindowError(result) {
  const blob = JSON.stringify(result?.data?.error || result?.data || result || {});
  return /24\s*hour|re-?engage|131047|131026|customer care window|session|not.?allowed.*session/i.test(
    blob
  );
}

async function upsertPayQrWatch(db, opts = {}) {
  if (!db) return null;
  const phone = normalizePhoneE164(opts.phoneE164);
  const technicianId = String(opts.technicianId || '').trim();
  if (!phone || !isUuid(technicianId)) return null;
  const minutes = Math.max(5, Math.min(120, Number(opts.minutes) || WATCH_MINUTES));
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const jobId = isUuid(opts.jobId) ? String(opts.jobId).trim() : null;
  const { whatsappGreetingName } = require('./whatsapp-greeting-name');
  const customerName = whatsappGreetingName(opts.customerName, '').slice(0, 80) || null;
  try {
    const row = {
      phone_e164: phone,
      technician_id: technicianId,
      job_id: jobId,
      expires_at: expiresAt,
      ...(customerName ? { customer_name: customerName } : {}),
    };
    let { data, error } = await db
      .from('whatsapp_pay_qr_watch')
      .insert(row)
      .select('id, expires_at')
      .maybeSingle();
    if (error && /customer_name/i.test(error.message || '')) {
      delete row.customer_name;
      ({ data, error } = await db
        .from('whatsapp_pay_qr_watch')
        .insert(row)
        .select('id, expires_at')
        .maybeSingle());
    }
    if (error) {
      console.warn('[pay-qr-watch] insert failed', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[pay-qr-watch] insert threw', err?.message || err);
    return null;
  }
}

async function findActivePayQrWatch(db, phoneE164) {
  if (!db) return null;
  const { digitsOnly } = require('./whatsapp-helper');
  const phone = normalizePhoneE164(phoneE164);
  const last10 = digitsOnly(phoneE164).slice(-10);
  const candidates = [...new Set([phone, last10, last10 ? `91${last10}` : ''].filter(Boolean))];
  if (candidates.length === 0) return null;
  try {
    let { data, error } = await db
      .from('whatsapp_pay_qr_watch')
      .select('id, technician_id, job_id, customer_name, expires_at, phone_e164')
      .in('phone_e164', candidates)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && /customer_name/i.test(error.message || '')) {
      ({ data, error } = await db
        .from('whatsapp_pay_qr_watch')
        .select('id, technician_id, job_id, expires_at, phone_e164')
        .in('phone_e164', candidates)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle());
    }
    if (error) {
      console.warn('[pay-qr-watch] lookup failed', error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn('[pay-qr-watch] lookup threw', err?.message || err);
    return null;
  }
}

async function hasInboundWindow(db, phoneE164) {
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

async function resolveCustomerDisplayName(db, phoneE164, storedName) {
  const { whatsappGreetingName } = require('./whatsapp-greeting-name');
  const fromWatch = whatsappGreetingName(storedName, '');
  if (fromWatch) return fromWatch;
  try {
    const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');
    const digits = String(phoneE164 || '').replace(/\D/g, '').slice(-10);
    const row = await findCustomerByPhoneDigits(db, digits, 'id,full_name');
    return whatsappGreetingName(row?.full_name, 'the customer');
  } catch {
    return 'the customer';
  }
}

async function bufferFromMediaUrl(mediaUrl) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return null;
  try {
    if (raw.startsWith('r2:') || raw.startsWith('whatsapp/')) {
      const obj = await getR2ObjectBytes(raw);
      if (!obj?.buffer) return null;
      return { buffer: obj.buffer, mime: obj.contentType || 'image/jpeg' };
    }
    if (!isHttps(raw)) return null;
    const res = await fetch(raw);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/jpeg';
    return { buffer: Buffer.from(await res.arrayBuffer()), mime };
  } catch (err) {
    console.warn('[pay-qr-watch] load media failed', err?.message || err);
    return null;
  }
}

async function persistTechImageSend(db, { to, waId, caption, mediaUrl, mime, ok, error, templateName }) {
  await insertWhatsAppMessage(db, {
    wa_message_id: waId,
    direction: 'outbound',
    phone_e164: to,
    msg_type: 'image',
    body: caption,
    media_url: mediaUrl,
    media_mime: mime,
    filename: 'payment-screenshot.jpg',
    status: ok ? 'sent' : 'failed',
    template_name: templateName || null,
    error_message: ok ? null : String(error || '').slice(0, 500),
  });
}

/**
 * Free-form image when the technician has an open 24h window; otherwise IMAGE template
 * `svc_tech_customer_photo_v1` (use once Meta APPROVED). Caption: "Image shared by {name}."
 */
async function sendImageToTechnicianWhatsApp({
  db,
  accessToken,
  phoneNumberId,
  technicianId,
  mediaUrl,
  customerName,
}) {
  if (!db || !accessToken || !phoneNumberId || !technicianId || !mediaUrl) {
    return { sent: false };
  }
  try {
    const { data: tech } = await db
      .from('technicians')
      .select('phone, whatsapp_phone')
      .eq('id', technicianId)
      .maybeSingle();
    const to = normalizePhoneE164(tech?.whatsapp_phone || tech?.phone);
    if (!to) return { sent: false };

    const name = String(customerName || 'the customer').trim() || 'the customer';
    const caption = `Image shared by ${name}.`.slice(0, 1024);

    const media = await bufferFromMediaUrl(mediaUrl);
    if (!media?.buffer?.length) return { sent: false };
    const uploaded = await uploadOutboundFileToWhatsAppMedia(
      phoneNumberId,
      accessToken,
      media.buffer,
      'payment-screenshot.jpg',
      media.mime || 'image/jpeg'
    );
    if (!uploaded?.id) return { sent: false };

    const windowOpen = await hasInboundWindow(db, to);
    if (windowOpen) {
      const session = await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: {
          id: uploaded.id,
          caption,
        },
      });
      const waId = session?.data?.messages?.[0]?.id || null;
      if (session.ok) {
        await persistTechImageSend(db, {
          to,
          waId,
          caption,
          mediaUrl,
          mime: media.mime,
          ok: true,
        });
        return { sent: true, via: 'session', waId };
      }
      if (!isClosedWindowError(session)) {
        await persistTechImageSend(db, {
          to,
          waId,
          caption,
          mediaUrl,
          mime: media.mime,
          ok: false,
          error: JSON.stringify(session.data?.error || {}),
        });
        return { sent: false };
      }
    }

    const cold = await callWhatsAppApi(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: TECH_PHOTO_TEMPLATE,
        language: { code: 'en' },
        components: [
          {
            type: 'header',
            parameters: [{ type: 'image', image: { id: uploaded.id } }],
          },
          {
            type: 'body',
            parameters: [{ type: 'text', text: name }],
          },
        ],
      },
    });
    const waId = cold?.data?.messages?.[0]?.id || null;
    await persistTechImageSend(db, {
      to,
      waId,
      caption,
      mediaUrl,
      mime: media.mime,
      ok: Boolean(cold.ok),
      error: JSON.stringify(cold.data?.error || {}),
      templateName: TECH_PHOTO_TEMPLATE,
    });
    if (cold.ok) return { sent: true, via: 'template', waId };
    console.warn(
      '[pay-qr-watch] tech photo template failed (pending approval?)',
      cold.data?.error?.message || cold.data?.error || cold.status
    );
    return { sent: false };
  } catch (err) {
    console.warn('[pay-qr-watch] tech image send failed', err?.message || err);
    return { sent: false };
  }
}

async function notifyTechnicianPayQrPhoto({
  db,
  accessToken,
  phoneNumberId,
  watch,
  phone,
  mediaUrl,
}) {
  const customerName = await resolveCustomerDisplayName(db, phone, watch.customer_name);
  const title = 'Payment screenshot';
  const body = `Image shared by ${customerName}.`;
  const technicianId = watch.technician_id;

  try {
    const messaging = await getMessaging(db);
    if (messaging) {
      await sendToTechnicianDevices(
        db,
        messaging,
        technicianId,
        (token) => ({
          token,
          notification: {
            title,
            body,
            ...(isHttps(mediaUrl) ? { image: mediaUrl } : {}),
          },
          data: {
            type: CATEGORY,
            phone,
            jobId: String(watch.job_id || ''),
            imageUrl: String(mediaUrl || ''),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'job_alerts_v2',
              sound: 'tech_alert',
              ...(isHttps(mediaUrl) ? { imageUrl: mediaUrl } : {}),
            },
          },
        }),
        CATEGORY
      );
    }
  } catch (err) {
    console.warn('[pay-qr-watch] FCM failed', err?.message || err);
  }

  let imageSent = false;
  if (accessToken && phoneNumberId && mediaUrl) {
    const img = await sendImageToTechnicianWhatsApp({
      db,
      accessToken,
      phoneNumberId,
      technicianId,
      mediaUrl,
      customerName,
    });
    imageSent = Boolean(img?.sent);
  }

  // Image is the WhatsApp path. Text mirror only if the photo could not be delivered
  // (template not approved yet / 24h closed).
  if (!imageSent) {
    void maybeSendTechnicianPushWhatsApp(db, {
      technicianId,
      category: CATEGORY,
      title,
      body,
    });
  }
}

/**
 * If this inbound photo is within an active pay-QR watch, forward to that technician.
 * Lookup is awaited; FCM / WhatsApp fan-out is fire-and-forget so the webhook can ACK fast.
 * @returns {{ handled: boolean, technicianId?: string }}
 */
async function handlePayQrWatchInbound({ db, accessToken, phoneNumberId, msg, media }) {
  const msgType = String(msg?.type || '').toLowerCase();
  const mime = String(media?.media_mime || msg?.image?.mime_type || msg?.document?.mime_type || '');
  const isPhoto =
    msgType === 'image' || (msgType === 'document' && /^image\//i.test(mime));
  if (!isPhoto) return { handled: false };
  const phone = normalizePhoneE164(msg.from);
  if (!phone) return { handled: false };

  const watch = await findActivePayQrWatch(db, phone);
  if (!watch?.technician_id) return { handled: false };

  const mediaUrl = media?.media_url || null;
  void notifyTechnicianPayQrPhoto({
    db,
    accessToken,
    phoneNumberId,
    watch,
    phone,
    mediaUrl,
  }).catch((err) => {
    console.warn('[pay-qr-watch] notify failed', err?.message || err);
  });

  return { handled: true, technicianId: watch.technician_id };
}

module.exports = {
  WATCH_MINUTES,
  CATEGORY,
  TECH_PHOTO_TEMPLATE,
  upsertPayQrWatch,
  findActivePayQrWatch,
  handlePayQrWatchInbound,
};
