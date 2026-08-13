/**
 * Admin: copy a WhatsApp inbox photo into the customer gallery (Cloudinary ro-service).
 *
 * Body: { action: 'gallery_photo', messageId, customerId? }
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const {
  getServiceSupabase,
  resolveCustomerIdForWhatsAppChat,
  isR2MediaRef,
  parseR2ObjectKey,
  uploadBufferToCloudinaryOnly,
} = require('./whatsapp-helper');
const { getR2ObjectBytes } = require('./r2-helper');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function photoListContainsUrl(list, url) {
  if (!Array.isArray(list) || !url) return false;
  const target = String(url).split('?')[0].toLowerCase();
  return list.some((entry) => {
    const entryUrl = typeof entry === 'string' ? entry : entry?.url || entry?.secure_url;
    return typeof entryUrl === 'string' && entryUrl.split('?')[0].toLowerCase() === target;
  });
}

async function bufferFromMediaUrl(mediaUrl) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return null;
  if (isR2MediaRef(raw) || parseR2ObjectKey(raw)) {
    const obj = await getR2ObjectBytes(raw);
    if (!obj?.buffer) return null;
    return { buffer: obj.buffer, mime: obj.contentType || 'image/jpeg' };
  }
  if (!/^https:\/\//i.test(raw)) return null;
  const res = await fetch(raw);
  if (!res.ok) return null;
  const mime = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime };
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(401, headers, { error: auth.error || 'Unauthorized' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const action = String(body.action || '').trim();
  const messageId = String(body.messageId || body.message_id || '').trim();
  const requestedCustomerId = String(body.customerId || body.customer_id || '').trim();
  if (!messageId || action !== 'gallery_photo') {
    return json(400, headers, { error: 'action and messageId required' });
  }

  const db = getServiceSupabase();
  if (!db) return json(503, headers, { error: 'Service unavailable' });

  const { data: msg, error: msgErr } = await db
    .from('whatsapp_messages')
    .select('id, phone_e164, customer_id, msg_type, body, media_url, media_mime, filename')
    .eq('id', messageId)
    .maybeSingle();
  if (msgErr || !msg) {
    return json(404, headers, { error: 'Message not found' });
  }

  const customerId = await resolveCustomerIdForWhatsAppChat(db, {
    requestedCustomerId,
    messageCustomerId: msg.customer_id,
    phoneE164: msg.phone_e164,
  });
  if (!customerId) {
    return json(400, headers, {
      error:
        'No customer linked to this chat. Open the customer from the header, or save this WhatsApp number on the customer record.',
    });
  }

  const isImage =
    msg.msg_type === 'image' || String(msg.media_mime || '').startsWith('image/');
  if (!isImage || !msg.media_url) {
    return json(400, headers, { error: 'This message is not a photo' });
  }

  let galleryUrl = /^https:\/\/res\.cloudinary\.com\//i.test(String(msg.media_url))
    ? String(msg.media_url)
    : null;
  if (!galleryUrl) {
    const media = await bufferFromMediaUrl(msg.media_url);
    if (!media?.buffer?.length) {
      return json(502, headers, { error: 'Could not load WhatsApp photo' });
    }
    const uploaded = await uploadBufferToCloudinaryOnly(
      media.buffer,
      media.mime || msg.media_mime || 'image/jpeg',
      msg.filename || 'whatsapp-photo.jpg',
      'ro-service'
    );
    galleryUrl = uploaded?.url || null;
  }
  if (!galleryUrl) {
    return json(502, headers, { error: 'Cloudinary upload failed' });
  }

  const { data: latestJob } = await db
    .from('jobs')
    .select('id, before_photos')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestJob?.id) {
    const current = Array.isArray(latestJob.before_photos) ? latestJob.before_photos : [];
    if (!photoListContainsUrl(current, galleryUrl)) {
      const { error: upErr } = await db
        .from('jobs')
        .update({ before_photos: [...current, galleryUrl] })
        .eq('id', latestJob.id);
      if (upErr) return json(500, headers, { error: upErr.message || 'Failed to save photo' });
    }
  } else {
    const { data: cust } = await db
      .from('customers')
      .select('photos')
      .eq('id', customerId)
      .maybeSingle();
    const current = Array.isArray(cust?.photos) ? cust.photos : [];
    if (!photoListContainsUrl(current, galleryUrl)) {
      const { error: upErr } = await db
        .from('customers')
        .update({ photos: [...current, galleryUrl] })
        .eq('id', customerId);
      if (upErr) return json(500, headers, { error: upErr.message || 'Failed to save photo' });
    }
  }

  return json(200, headers, { ok: true, url: galleryUrl });
};
