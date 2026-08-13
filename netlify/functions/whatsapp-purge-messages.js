/**
 * Admin-only: delete WhatsApp messages by timeline / phone + R2 (and legacy Cloudinary) media.
 * Body:
 *   { olderThanDays: 30|90|180|365 }
 *   { phoneE164: "...", olderThanDays?: number }  // omit days = delete whole thread
 *   { dryRun: true } — count only
 *   { keepMedia: true } — delete DB rows only; leave R2 / Cloudinary files
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { getServiceSupabase, digitsOnly, normalizePhoneE164 } = require('./whatsapp-helper');
const { deleteR2Object, isR2MediaRef, parseR2ObjectKey } = require('./r2-helper');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function cloudinaryPublicIdFromUrl(url) {
  const raw = String(url || '');
  if (!/^https:\/\//i.test(raw) || !/res\.cloudinary\.com/i.test(raw)) return null;
  // .../upload/v123/whatsapp/inbound/foo.pdf or /raw/upload/...
  const m = raw.match(/\/(?:upload|raw\/upload)\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:\?|$)/i);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  if (!id.startsWith('whatsapp/')) return null;
  return id;
}

async function destroyCloudinary(publicId) {
  const cloudName = (
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.VITE_CLOUDINARY_CLOUD_NAME ||
    ''
  ).trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret || !publicId) return { ok: false, skipped: true };
  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    // Try image then raw
    for (const resourceType of ['image', 'raw', 'video']) {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload?public_ids[]=${encodeURIComponent(publicId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Basic ${auth}` },
        }
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.deleted?.[publicId] === 'deleted' || res.status === 200) {
          return { ok: true, publicId };
        }
      }
    }
    return { ok: false, publicId };
  } catch (err) {
    return { ok: false, publicId, error: err?.message || String(err) };
  }
}

function collectMessageIds(body) {
  const raw = [];
  if (body.messageId) raw.push(body.messageId);
  if (Array.isArray(body.messageIds)) raw.push(...body.messageIds);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(raw.map((id) => String(id || '').trim()).filter((id) => uuid.test(id)))];
}

async function deleteMediaForRows(rows, keepMedia) {
  let deletedMedia = 0;
  let failedMedia = 0;
  let keptMedia = 0;
  if (keepMedia) {
    return { deletedMedia, failedMedia, keptMedia: rows.filter((r) => r.media_url).length };
  }
  for (const row of rows) {
    const media = row.media_url;
    if (!media) continue;
    if (isR2MediaRef(media) || parseR2ObjectKey(media)) {
      const r = await deleteR2Object(media);
      if (r.ok) deletedMedia += 1;
      else if (!r.skipped) failedMedia += 1;
      continue;
    }
    const publicId = cloudinaryPublicIdFromUrl(media);
    if (publicId) {
      const r = await destroyCloudinary(publicId);
      if (r.ok) deletedMedia += 1;
      else if (!r.skipped) failedMedia += 1;
    }
  }
  return { deletedMedia, failedMedia, keptMedia };
}

exports.handler = async (event) => {
  const headers = {
    ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
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

  const dryRun = body.dryRun === true;
  const keepMedia = body.keepMedia === true || body.deleteMedia === false;
  const phoneRaw = digitsOnly(body.phoneE164 || body.phone || '');
  const phone = phoneRaw ? normalizePhoneE164(phoneRaw) : '';
  const olderThanDays = body.olderThanDays != null ? Number(body.olderThanDays) : null;
  const messageIds = collectMessageIds(body);

  if (!phone && !(olderThanDays > 0) && messageIds.length === 0) {
    return json(400, headers, {
      error: 'Provide olderThanDays, phoneE164, or messageId',
    });
  }
  if (olderThanDays != null && ![7, 30, 90, 180, 365].includes(olderThanDays)) {
    return json(400, headers, { error: 'olderThanDays must be 7, 30, 90, 180, or 365' });
  }

  const db = getServiceSupabase();
  if (!db) return json(500, headers, { error: 'Database not configured' });

  if (messageIds.length > 0) {
    const { data: rows, error } = await db
      .from('whatsapp_messages')
      .select('id, media_url')
      .in('id', messageIds);
    if (error) return json(500, headers, { error: error.message });
    const list = rows || [];
    if (dryRun) {
      return json(200, headers, {
        dryRun: true,
        wouldDeleteRows: list.length,
        withMedia: list.filter((r) => r.media_url).length,
        keepMedia,
      });
    }
    const mediaStats = await deleteMediaForRows(list, keepMedia);
    const ids = list.map((r) => r.id).filter(Boolean);
    let deletedRows = 0;
    if (ids.length) {
      const { error: delErr, count } = await db
        .from('whatsapp_messages')
        .delete({ count: 'exact' })
        .in('id', ids);
      if (delErr) return json(500, headers, { error: delErr.message, ...mediaStats });
      deletedRows = count ?? ids.length;
    }
    return json(200, headers, {
      deletedRows,
      ...mediaStats,
      keepMedia,
      messageIds: ids,
    });
  }

  function buildSelectQuery() {
    let query = db.from('whatsapp_messages').select('id, media_url');
    if (phone) query = query.eq('phone_e164', phone);
    if (olderThanDays > 0) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.lt('created_at', cutoff);
    }
    return query;
  }

  if (dryRun) {
    let total = 0;
    let withMedia = 0;
    const countAll = phone && !olderThanDays;
    if (countAll) {
      // Full-thread delete: count every row (not capped at 5000).
      let offset = 0;
      const pageSize = 5000;
      for (;;) {
        const { data: page, error: pageErr } = await buildSelectQuery()
          .range(offset, offset + pageSize - 1);
        if (pageErr) return json(500, headers, { error: pageErr.message });
        const chunk = page || [];
        if (!chunk.length) break;
        total += chunk.length;
        withMedia += chunk.filter((r) => r.media_url).length;
        if (chunk.length < pageSize) break;
        offset += pageSize;
      }
    } else {
      const { data: rows, error } = await buildSelectQuery().limit(5000);
      if (error) return json(500, headers, { error: error.message });
      const list = rows || [];
      total = list.length;
      withMedia = list.filter((r) => r.media_url).length;
    }
    return json(200, headers, {
      dryRun: true,
      wouldDeleteRows: total,
      withMedia,
      keepMedia,
    });
  }

  let deletedMedia = 0;
  let failedMedia = 0;
  let deletedRows = 0;
  let keptMedia = 0;
  const fullThreadDelete = phone && !olderThanDays;

  for (;;) {
    const { data: rows, error } = await buildSelectQuery().limit(5000);
    if (error) return json(500, headers, { error: error.message });
    const list = rows || [];
    if (!list.length) break;

    if (!keepMedia) {
      const mediaStats = await deleteMediaForRows(list, false);
      deletedMedia += mediaStats.deletedMedia;
      failedMedia += mediaStats.failedMedia;
    } else {
      keptMedia += list.filter((r) => r.media_url).length;
    }

    const ids = list.map((r) => r.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: delErr, count } = await db
        .from('whatsapp_messages')
        .delete({ count: 'exact' })
        .in('id', chunk);
      if (delErr) {
        return json(500, headers, {
          error: delErr.message,
          deletedRows,
          deletedMedia,
          failedMedia,
        });
      }
      deletedRows += count ?? chunk.length;
    }

    if (!fullThreadDelete) break;
  }

  return json(200, headers, {
    deletedRows,
    deletedMedia,
    failedMedia,
    keptMedia: keepMedia ? keptMedia : 0,
    keepMedia,
    phone: phone || null,
    olderThanDays: olderThanDays || null,
  });
};
