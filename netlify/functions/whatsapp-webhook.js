/**
 * WhatsApp Cloud API webhook — Meta verification (GET) + inbound persist (POST).
 * Phase 2: write messages/statuses to whatsapp_messages; media → Cloudinary when possible.
 * Still keeps a short in-memory buffer for /whatsapp-test.
 */
const { pushEvent } = require('./whatsapp-event-store');
const {
  getServiceSupabase,
  getWhatsAppCredentials,
  verifyWhatsAppSignature,
  insertWhatsAppMessage,
  updateWhatsAppMessageStatus,
  findCustomerIdByPhone,
  resolveInboundMedia,
  extractInboundBody,
  normalizePhoneE164,
} = require('./whatsapp-helper');
const { handleBookingBotInbound } = require('./whatsapp-booking-bot');
const { handleUnsolicitedInboundMedia } = require('./whatsapp-unsolicited-media');

function readRawBody(event) {
  if (!event.body) return '';
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return String(event.body);
}

function tsToIso(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

async function persistInboundMessages(db, accessToken, phoneNumberId, value, summaries) {
  const messages = value?.messages || [];
  for (const msg of messages) {
    const phone = normalizePhoneE164(msg.from);
    const msgType = String(msg.type || 'unknown');
    const needsMedia = ['image', 'document', 'audio', 'video', 'sticker', 'voice'].includes(msgType);

    let media = { media_url: null, media_mime: null, filename: null };
    if (needsMedia && accessToken) {
      media = await resolveInboundMedia(msg, accessToken);
    }

    const customerId = await findCustomerIdByPhone(db, phone);
    const body = extractInboundBody(msg);

    await insertWhatsAppMessage(db, {
      wa_message_id: msg.id || null,
      direction: 'inbound',
      phone_e164: phone,
      customer_id: customerId,
      msg_type: msgType,
      body,
      media_url: media.media_url,
      media_mime: media.media_mime,
      filename: media.filename || msg.document?.filename || null,
      status: 'received',
      created_at: tsToIso(msg.timestamp),
    });

    summaries.push({
      from: phone,
      type: msgType,
      text: body,
      media_url: media.media_url,
      timestamp: msg.timestamp,
      wa_message_id: msg.id || null,
    });

    // Unsolicited photo/video/file → redirect to Eleven RO main WA (unless we asked for media).
    if (accessToken && phoneNumberId) {
      try {
        await handleUnsolicitedInboundMedia({
          db,
          accessToken,
          phoneNumberId,
          msg,
        });
      } catch (err) {
        console.warn('[whatsapp-webhook] unsolicited media handler error', err?.message || err);
      }
    }

    // 24h-window booking bot (reply buttons). Failures must not break webhook ACK.
    if (accessToken && phoneNumberId) {
      try {
        await handleBookingBotInbound({
          db,
          accessToken,
          phoneNumberId,
          msg,
          inboundMedia: media,
        });
      } catch (err) {
        console.warn('[whatsapp-webhook] booking bot error', err?.message || err);
      }
    }
  }
}

async function persistStatuses(db, value, summaries) {
  const statuses = value?.statuses || [];
  for (const st of statuses) {
    const status = String(st.status || '').toLowerCase();
    const errors = st.errors || [];
    const errMsg = errors[0]?.title || errors[0]?.message || null;
    if (st.id) {
      await updateWhatsAppMessageStatus(db, st.id, status, errMsg);
    }
    summaries.push({
      status,
      id: st.id,
      recipient_id: st.recipient_id,
      timestamp: st.timestamp,
    });
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod || 'GET';

  // Meta webhook verification
  if (method === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];
    const db = getServiceSupabase();
    const { verifyToken } = await getWhatsAppCredentials(db);

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      console.log('[whatsapp-webhook] verified');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: challenge || '',
      };
    }
    console.warn('[whatsapp-webhook] verification failed', {
      mode,
      tokenMatch: token === verifyToken,
    });
    return { statusCode: 403, body: 'Forbidden' };
  }

  if (method === 'POST') {
    const rawBody = readRawBody(event);
    const db = getServiceSupabase();
    const { accessToken, appSecret, phoneNumberId } = await getWhatsAppCredentials(db);

    const sigHeader =
      event.headers['x-hub-signature-256'] ||
      event.headers['X-Hub-Signature-256'] ||
      '';
    const sig = verifyWhatsAppSignature(rawBody, sigHeader, appSecret);
    if (!sig.ok) {
      console.warn('[whatsapp-webhook] signature rejected', sig.error);
      return { statusCode: 401, body: 'Invalid signature' };
    }

    let payload = {};
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch {
      payload = { raw: rawBody };
    }

    // Do not log full payloads in production (PII). Slim log only.
    const entries = payload?.entry || [];
    console.log('[whatsapp-webhook] inbound entries', entries.length);

    const summaries = [];
    try {
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          if (change.field && change.field !== 'messages') continue;
          const value = change.value || {};
          await persistInboundMessages(db, accessToken, phoneNumberId, value, summaries);
          await persistStatuses(db, value, summaries);
        }
      }
    } catch (err) {
      console.error('[whatsapp-webhook] persist failed', err?.message || err);
    }

    const stored = pushEvent({
      summaries,
      // Keep payload only in local memory POC — not written to DB
      payload: process.env.CONTEXT === 'production' ? undefined : payload,
    });
    if (summaries.length) {
      stored.summaries = summaries;
      console.log('[whatsapp-webhook] summaries', JSON.stringify(summaries));
    }

    // Meta expects 200 quickly
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, stored: summaries.length }),
    };
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
