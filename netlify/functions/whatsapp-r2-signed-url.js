/**
 * Admin-only: short-lived signed GET URL for private R2 WhatsApp media.
 * Body: { key } | { mediaUrl } | { messageId }
 * Optional: { proxy: true } — stream bytes (for PDF thumbnails; no R2 browser CORS).
 * Also recovers legacy `whatsapp-media:{metaId}` by re-fetching from Meta → R2.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const {
  getServiceSupabase,
  getWhatsAppCredentials,
  downloadWhatsAppMedia,
} = require('./whatsapp-helper');
const {
  createR2SignedGetUrl,
  getR2ObjectBytes,
  parseR2ObjectKey,
  isR2MediaRef,
  uploadWhatsAppMediaToR2,
} = require('./r2-helper');

const PROXY_MAX_BYTES = 4.5 * 1024 * 1024; // stay under Netlify ~6MB response

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const cors = getCorsHeaders(event.headers?.origin || event.headers?.Origin);
  const headers = {
    ...cors,
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, { error: auth.error || 'Unauthorized' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const wantProxy = Boolean(body.proxy);
  const db = getServiceSupabase();
  let messageId = body.messageId ? String(body.messageId) : null;
  let mediaRef =
    String(body.key || body.mediaUrl || body.media_url || body.ref || '').trim() || null;
  let filename = null;
  let mimeHint = null;

  if (messageId && db) {
    const { data, error } = await db
      .from('whatsapp_messages')
      .select('media_url, filename, media_mime')
      .eq('id', messageId)
      .maybeSingle();
    if (error) return json(500, headers, { error: error.message });
    if (!mediaRef) mediaRef = data?.media_url || null;
    filename = data?.filename || null;
    mimeHint = data?.media_mime || null;
  }

  if (!mediaRef) {
    return json(400, headers, { error: 'key, mediaUrl, or messageId required' });
  }

  // Legacy Cloudinary / public https — return as-is (proxy: client fetches URL)
  if (!isR2MediaRef(mediaRef) && /^https:\/\//i.test(mediaRef)) {
    return json(200, headers, { url: mediaRef, legacy: true, expiresIn: null });
  }

  // Legacy Meta media id — download once, store on R2, update row
  const metaMatch = String(mediaRef).match(/^whatsapp-media:(.+)$/i);
  if (metaMatch) {
    const metaId = metaMatch[1].trim();
    const { accessToken } = await getWhatsAppCredentials(db);
    if (!accessToken) {
      return json(502, headers, { error: 'WhatsApp credentials missing' });
    }
    const downloaded = await downloadWhatsAppMedia(metaId, accessToken);
    if (!downloaded?.buffer) {
      return json(410, headers, {
        error: 'Meta media expired — re-send the file so it stores on R2',
      });
    }
    const uploaded = await uploadWhatsAppMediaToR2(
      downloaded.buffer,
      downloaded.mime || mimeHint || 'application/octet-stream',
      filename || `media-${metaId}`,
      'outbound'
    );
    if (!uploaded?.ref) {
      return json(502, headers, { error: 'Could not store media on R2' });
    }
    mediaRef = uploaded.ref;
    if (messageId && db) {
      await db.from('whatsapp_messages').update({ media_url: mediaRef }).eq('id', messageId);
    }
  }

  const key = parseR2ObjectKey(mediaRef);
  if (!key) {
    return json(400, headers, { error: 'Not an R2 WhatsApp media reference' });
  }

  if (wantProxy) {
    const obj = await getR2ObjectBytes(key);
    if (!obj?.buffer) {
      return json(502, headers, { error: 'Could not read media from R2' });
    }
    if (obj.buffer.length > PROXY_MAX_BYTES) {
      const signed = await createR2SignedGetUrl(key);
      return json(200, headers, {
        url: signed?.url || null,
        key,
        expiresIn: signed?.expiresIn ?? null,
        tooLargeForProxy: true,
      });
    }
    const contentType =
      mimeHint ||
      obj.contentType ||
      (/\.pdf$/i.test(filename || '') ? 'application/pdf' : 'application/octet-stream');
    const safeName = String(filename || 'document.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
    return {
      statusCode: 200,
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=60',
        'X-WhatsApp-R2-Key': key,
      },
      body: obj.buffer.toString('base64'),
      isBase64Encoded: true,
    };
  }

  const signed = await createR2SignedGetUrl(key);
  if (!signed?.url) {
    return json(502, headers, { error: 'Could not create signed URL (check R2 env / restart :8888)' });
  }

  return json(200, headers, {
    url: signed.url,
    key: signed.key,
    expiresIn: signed.expiresIn,
  });
};
