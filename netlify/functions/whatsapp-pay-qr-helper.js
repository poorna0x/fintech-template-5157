/**
 * Technician pay-QR watch: after Cloud API UPI QR send, inbound photos from
 * that number are forwarded to the sending technician for 30 minutes.
 */
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  uploadOutboundFileToWhatsAppMedia,
  uploadBufferToCloudinaryOnly,
} = require('./whatsapp-helper');
const { createR2SignedGetUrl, getR2ObjectBytes } = require('./r2-helper');

const WATCH_MINUTES = 30;
const CATEGORY = 'pay_qr_screenshot';
/** IMAGE-header UTILITY — customer photo to technician when the 24h window is closed. */
const TECH_PHOTO_TEMPLATE = 'svc_tech_customer_photo_v1';
/** Cold text when IMAGE template + session image both fail (24h closed on business line). */
const TECH_PAY_QR_TEXT_TEMPLATE = 'svc_smoke_update';

function isHttps(url) {
  return /^https:\/\//i.test(String(url || '').trim());
}

/** FCM can only fetch public HTTPS. Inbound WhatsApp media is private R2 (`r2:…`). */
async function httpsUrlForPush(mediaUrl) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return null;
  if (isHttps(raw)) return raw;
  const signed = await createR2SignedGetUrl(raw, 3600);
  return signed?.url || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function isClosedWindowError(result) {
  const blob = JSON.stringify(result?.data?.error || result?.data || result || {});
  return /24\s*hour|re-?engage|131047|customer care window|session|not.?allowed.*session/i.test(
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
  if (!db) return false;
  const { digitsOnly } = require('./whatsapp-helper');
  const phone = normalizePhoneE164(phoneE164);
  const last10 = digitsOnly(phoneE164).slice(-10);
  const candidates = [...new Set([phone, last10, last10 ? `91${last10}` : ''].filter(Boolean))];
  if (candidates.length === 0) return false;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('whatsapp_messages')
      .select('id')
      .in('phone_e164', candidates)
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

    const persistCold = async (cold) => {
      const waId = cold?.data?.messages?.[0]?.id || null;
      await persistTechImageSend(db, {
        to,
        waId,
        caption,
        mediaUrl,
        mime: media.mime,
        ok: Boolean(cold?.ok),
        error: cold?.ok ? null : JSON.stringify(cold?.data?.error || {}),
        templateName: TECH_PHOTO_TEMPLATE,
      });
      return waId;
    };

    const persistSession = async (session) => {
      const waId = session?.data?.messages?.[0]?.id || null;
      await persistTechImageSend(db, {
        to,
        waId,
        caption,
        mediaUrl,
        mime: media.mime,
        ok: Boolean(session?.ok),
        error: session?.ok ? null : JSON.stringify(session?.data?.error || {}),
      });
      return waId;
    };

    // 1. Cold IMAGE template first — technicians are usually outside the 24h window
    // on the business WhatsApp line. Session-first used to Meta-accept then fail
    // delivery ("Re-engagement message"), which skipped the text fallback.
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
    if (cold.ok) {
      const waId = await persistCold(cold);
      return { sent: true, via: 'template', waId };
    }

    // 2. Free-form session image only when the tech recently messaged the business line.
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
      if (session.ok) {
        const waId = await persistSession(session);
        return { sent: true, via: 'session', waId };
      }
      if (!isClosedWindowError(session)) {
        await persistSession(session);
        return { sent: false };
      }
    }

    await persistCold(cold);
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

/** Cold template text to technician when pay-QR photo image could not be delivered. */
async function sendPayQrTextFallbackToTechnician({
  db,
  accessToken,
  phoneNumberId,
  technicianId,
  title,
  body,
}) {
  if (!db || !accessToken || !phoneNumberId || !technicianId) {
    return { sent: false, reason: 'bad_args' };
  }
  try {
    const { data: tech } = await db
      .from('technicians')
      .select('full_name, phone, whatsapp_phone')
      .eq('id', technicianId)
      .maybeSingle();
    const to = normalizePhoneE164(tech?.whatsapp_phone || tech?.phone);
    if (!to) return { sent: false, reason: 'no_phone' };

    const { whatsappGreetingName } = require('./whatsapp-greeting-name');
    const techName = whatsappGreetingName(tech?.full_name, 'there');

    const cold = await callWhatsAppApi(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: TECH_PAY_QR_TEXT_TEMPLATE,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: techName }],
          },
        ],
      },
    });
    const coldWaId = cold?.data?.messages?.[0]?.id || null;
    const notice = [title, body].filter(Boolean).join('\n\n').slice(0, 4096);
    if (cold.ok) {
      await insertWhatsAppMessage(db, {
        wa_message_id: coldWaId,
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'template',
        body: notice || title || body,
        status: 'sent',
        template_name: TECH_PAY_QR_TEXT_TEMPLATE,
      });
      return { sent: true, via: 'template', waId: coldWaId };
    }

    if (await hasInboundWindow(db, to)) {
      const text = title && body ? `*${title}*\n\n${body}` : title || body;
      const session = await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: text.slice(0, 4096) },
      });
      const waId = session?.data?.messages?.[0]?.id || null;
      await insertWhatsAppMessage(db, {
        wa_message_id: waId,
        direction: 'outbound',
        phone_e164: to,
        msg_type: 'text',
        body: text,
        status: session.ok ? 'sent' : 'failed',
        error_message: session.ok
          ? null
          : JSON.stringify(session.data?.error || {}).slice(0, 500),
      });
      if (session.ok) return { sent: true, via: 'session', waId };
    }

    return { sent: false, reason: 'template_and_session_failed' };
  } catch (err) {
    console.warn('[pay-qr-watch] tech text fallback failed', err?.message || err);
    return { sent: false, reason: 'error' };
  }
}

async function isPayQrWhatsAppEnabled(db, technicianId) {
  try {
    const { data: settings } = await db
      .from('whatsapp_crm_settings')
      .select('enabled, tech_push_whatsapp')
      .eq('id', 1)
      .maybeSingle();
    if (settings?.enabled === false) return false;
    const global = settings?.tech_push_whatsapp;
    if (global && typeof global === 'object' && global.pay_qr_screenshot === false) {
      return false;
    }
    const { data: tech } = await db
      .from('technicians')
      .select('whatsapp_prefs')
      .eq('id', technicianId)
      .maybeSingle();
    const prefs = tech?.whatsapp_prefs;
    if (prefs && typeof prefs === 'object' && prefs.pay_qr_screenshot === false) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function normalizePhotoUrlForCompare(url) {
  return String(url || '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toLowerCase();
}

function extractPhotoUrlList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        return String(entry.url || entry.secure_url || '').trim();
      }
      return '';
    })
    .filter((u) => /^https?:\/\//i.test(u));
}

function parseJobRequirements(raw) {
  if (Array.isArray(raw)) return [...raw];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? [...parsed] : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Re-host inbound WhatsApp media (often private R2) to public Cloudinary so the
 * technician complete-job payment-screenshot UI can show/use it.
 */
async function publicHttpsUrlForJobPayment(mediaUrl) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return null;
  if (/^https:\/\/res\.cloudinary\.com\//i.test(raw)) return raw;

  const media = await bufferFromMediaUrl(raw);
  if (!media?.buffer?.length) return null;

  const uploaded = await uploadBufferToCloudinaryOnly(
    media.buffer,
    media.mime || 'image/jpeg',
    'payment-screenshot.jpg',
    'payment-receipts'
  );
  if (uploaded?.url) return uploaded.url;

  // Preset may restrict folders — fall back to a known-good gallery folder.
  const fallback = await uploadBufferToCloudinaryOnly(
    media.buffer,
    media.mime || 'image/jpeg',
    'payment-screenshot.jpg',
    'ro-service'
  );
  return fallback?.url || null;
}

/**
 * Save customer WhatsApp payment photo onto the job the same way complete-job
 * step 5 does: requirements.qr_photos.payment_screenshot + payment_photos + after_photos.
 * Soft-fails (returns null) so technician FCM/WhatsApp still run.
 */
async function attachPayQrPhotoToJob(db, jobId, mediaUrl) {
  if (!db || !isUuid(jobId) || !mediaUrl) return null;
  try {
    const httpsUrl = await publicHttpsUrlForJobPayment(mediaUrl);
    if (!httpsUrl) {
      console.warn('[pay-qr-watch] could not re-host payment photo for job', jobId);
      return null;
    }

    const { data: job, error: jobErr } = await db
      .from('jobs')
      .select('id, requirements, after_photos')
      .eq('id', jobId)
      .maybeSingle();
    if (jobErr || !job) {
      console.warn('[pay-qr-watch] job lookup failed', jobErr?.message || 'missing');
      return null;
    }

    const requirements = parseJobRequirements(job.requirements);
    const compare = normalizePhotoUrlForCompare(httpsUrl);

    const qrIdx = requirements.findIndex((r) => r && typeof r === 'object' && r.qr_photos);
    if (qrIdx >= 0) {
      const existingShot = String(requirements[qrIdx].qr_photos?.payment_screenshot || '').trim();
      requirements[qrIdx] = {
        ...requirements[qrIdx],
        qr_photos: {
          ...(requirements[qrIdx].qr_photos || {}),
          // Keep first screenshot as primary; later photos go to payment_photos.
          payment_screenshot: existingShot || httpsUrl,
          shared_via_whatsapp: true,
          from_customer_whatsapp: true,
        },
      };
    } else {
      requirements.push({
        qr_photos: {
          payment_screenshot: httpsUrl,
          shared_via_whatsapp: true,
          from_customer_whatsapp: true,
        },
      });
    }

    const payIdx = requirements.findIndex((r) => r && typeof r === 'object' && r.payment_photos);
    const existingPay = extractPhotoUrlList(
      payIdx >= 0 ? requirements[payIdx].payment_photos : []
    );
    if (!existingPay.some((u) => normalizePhotoUrlForCompare(u) === compare)) {
      const mergedPay = [...existingPay, httpsUrl];
      if (payIdx >= 0) requirements[payIdx] = { payment_photos: mergedPay };
      else requirements.push({ payment_photos: mergedPay });
    }

    const after = extractPhotoUrlList(job.after_photos);
    if (!after.some((u) => normalizePhotoUrlForCompare(u) === compare)) {
      after.push(httpsUrl);
    }

    const { error: upErr } = await db
      .from('jobs')
      .update({
        requirements,
        after_photos: after,
      })
      .eq('id', jobId);
    if (upErr) {
      console.warn('[pay-qr-watch] job payment attach failed', upErr.message);
      return null;
    }

    console.log('[pay-qr-watch] attached payment screenshot to job', jobId);
    return httpsUrl;
  } catch (err) {
    console.warn('[pay-qr-watch] attachPayQrPhotoToJob threw', err?.message || err);
    return null;
  }
}

async function notifyTechnicianPayQrPhoto({
  db,
  accessToken,
  phoneNumberId,
  watch,
  phone,
  mediaUrl,
  attachedToJob,
}) {
  const customerName = await resolveCustomerDisplayName(db, phone, watch.customer_name);
  const title = 'Payment screenshot';
  const body = attachedToJob
    ? `Image shared by ${customerName}. Saved on the job — open Complete Job to see it.`
    : `Image shared by ${customerName}.`;
  const technicianId = watch.technician_id;
  const pushImageUrl = await httpsUrlForPush(mediaUrl);

  try {
    const messaging = await getMessaging(db);
    if (messaging) {
      const pushResult = await sendToTechnicianDevices(
        db,
        messaging,
        technicianId,
        (token) => ({
          token,
          notification: {
            title,
            body,
            ...(pushImageUrl ? { image: pushImageUrl } : {}),
          },
          data: {
            type: CATEGORY,
            phone,
            jobId: String(watch.job_id || ''),
            imageUrl: String(pushImageUrl || mediaUrl || ''),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'tech_general_v1',
              defaultSound: true,
              ...(pushImageUrl ? { imageUrl: pushImageUrl } : {}),
            },
          },
        }),
        CATEGORY
      );
      console.log('[pay-qr-watch] FCM push', {
        technicianId,
        sent: pushResult?.sent ?? 0,
        tokens: pushResult?.tokens ?? 0,
        skipped: pushResult?.skipped,
        reason: pushResult?.reason,
      });
    } else {
      console.warn('[pay-qr-watch] FCM skipped — Firebase not configured');
    }
  } catch (err) {
    console.warn('[pay-qr-watch] FCM failed', err?.message || err);
  }

  const waOn = await isPayQrWhatsAppEnabled(db, technicianId);
  let imageSent = false;
  if (waOn && accessToken && phoneNumberId && mediaUrl) {
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

  // Photo is the WhatsApp path. Cold text template if image could not be delivered.
  if (waOn && !imageSent && accessToken && phoneNumberId) {
    const textWa = await sendPayQrTextFallbackToTechnician({
      db,
      accessToken,
      phoneNumberId,
      technicianId,
      title,
      body,
    });
    console.log('[pay-qr-watch] WhatsApp text fallback', {
      technicianId,
      sent: Boolean(textWa?.sent),
      via: textWa?.via,
      reason: textWa?.reason,
    });
  }
}

/**
 * If this inbound photo is within an active pay-QR watch:
 * 1) Attach it to the job's payment-screenshot fields (complete-job step 5)
 * 2) Forward to that technician via FCM / WhatsApp
 * Lookup is awaited; FCM / WhatsApp fan-out is fire-and-forget so the webhook can ACK fast.
 * @returns {{ handled: boolean, technicianId?: string, attachedUrl?: string|null }}
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
  let attachedUrl = null;
  if (watch.job_id && mediaUrl) {
    try {
      attachedUrl = await attachPayQrPhotoToJob(db, watch.job_id, mediaUrl);
    } catch (err) {
      console.warn('[pay-qr-watch] job attach failed', err?.message || err);
    }
  }

  try {
    await notifyTechnicianPayQrPhoto({
      db,
      accessToken,
      phoneNumberId,
      watch,
      phone,
      mediaUrl,
      attachedToJob: Boolean(attachedUrl),
    });
  } catch (err) {
    console.warn('[pay-qr-watch] notify failed', err?.message || err);
  }

  return { handled: true, technicianId: watch.technician_id, attachedUrl };
}

module.exports = {
  WATCH_MINUTES,
  CATEGORY,
  TECH_PHOTO_TEMPLATE,
  upsertPayQrWatch,
  findActivePayQrWatch,
  handlePayQrWatchInbound,
  attachPayQrPhotoToJob,
};
