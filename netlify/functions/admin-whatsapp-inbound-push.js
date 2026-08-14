// Best-effort FCM to all admin APK devices when a customer WhatsApp arrives.
// Called from whatsapp-webhook after persisting inbound — soft-fail only.

const { getMessaging, getAdminFcmTokens, pruneAdminFcmTokens, isStaleTokenError } = require('./fcm-helper');

const WA_GREEN = '#25D366';

function previewInboundBody({ body, msgType, filename, mediaUrl, mediaMime }) {
  const text = String(body || '').trim();
  const file = String(filename || '').trim();
  const type = String(msgType || 'unknown');
  const isDoc =
    type === 'document' ||
    type === 'pdf' ||
    String(mediaMime || '').includes('pdf') ||
    /\.pdf$/i.test(file);
  const isImage = type === 'image' || String(mediaMime || '').startsWith('image/');

  if (text) {
    const snippet = text.length > 120 ? `${text.slice(0, 117).trim()}…` : text;
    if (mediaUrl && isDoc) return `📄 ${snippet}`;
    if (mediaUrl && isImage) return `📷 ${snippet}`;
    return snippet;
  }
  if (mediaUrl && file && (isDoc || isImage)) {
    return isImage ? `📷 ${file}` : `📄 ${file}`;
  }
  if (type === 'image' || isImage) return '📷 Photo';
  if (type === 'document' || isDoc) return '📄 Document';
  if (type === 'audio' || type === 'voice') return '🎤 Voice message';
  if (type === 'video') return '🎬 Video';
  if (type === 'sticker') return 'Sticker';
  if (type === 'location') return '📍 Location';
  if (type === 'contacts') return '👤 Contact';
  return 'New message';
}

async function lookupCustomerName(db, customerId) {
  if (!customerId) return null;
  try {
    const { data } = await db
      .from('customers')
      .select('full_name')
      .eq('id', customerId)
      .maybeSingle();
    return (data && data.full_name) || null;
  } catch {
    return null;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ phoneE164: string, body?: string|null, msgType?: string, filename?: string|null, mediaUrl?: string|null, mediaMime?: string|null, customerId?: string|null, waMessageId?: string|null }} details
 */
async function pushWhatsAppInboundToAdmins(db, details) {
  const phone = String(details.phoneE164 || '').replace(/\D/g, '');
  if (!phone) return { sent: 0, reason: 'no_phone' };

  const tokens = await getAdminFcmTokens(db, 'whatsapp_inbound', phone);
  if (tokens.length === 0) return { sent: 0, reason: 'no_tokens' };

  const customerName = await lookupCustomerName(db, details.customerId);
  const title = customerName?.trim() || phone;
  const body = previewInboundBody({
    body: details.body,
    msgType: details.msgType,
    filename: details.filename,
    mediaUrl: details.mediaUrl,
    mediaMime: details.mediaMime,
  });

  const waId = String(details.waMessageId || '').replace(/\W/g, '').slice(-20);
  const tag = waId ? `wa_inbound_${phone}_${waId}` : `wa_inbound_${phone}`;
  const titleText = `WhatsApp · ${title}`;

  const messaging = await getMessaging(db);
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: titleText,
      body,
    },
    data: {
      type: 'whatsapp_inbound',
      phone,
      tag,
      panel: 'whatsapp-inbox',
      color: WA_GREEN,
      title: titleText,
      body,
      ...(details.waMessageId ? { waMessageId: String(details.waMessageId) } : {}),
    },
    android: {
      priority: 'high',
      // Unique per message so FCM does not hold/replace the first inbound.
      collapseKey: tag.slice(0, 64),
      notification: {
        channelId: 'job_alerts_v2',
        icon: 'ic_stat_whatsapp',
        defaultSound: true,
        color: WA_GREEN,
        tag,
      },
    },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
  });
  if (stale.length > 0) {
    await pruneAdminFcmTokens(db, stale);
  }

  return { sent: res.successCount };
}

/**
 * Data-only FCM: cancel WhatsApp tray on admin APKs after the team opened the chat
 * (desktop / another phone). No notification payload — otherwise Android would
 * post a new shade item instead of clearing.
 */
async function pushWhatsAppTrayClearToAdmins(db, phoneE164) {
  const phone = String(phoneE164 || '').replace(/\D/g, '');
  if (!phone) return { sent: 0, reason: 'no_phone' };

  const tokens = await getAdminFcmTokens(db, 'whatsapp_inbound');
  if (tokens.length === 0) return { sent: 0, reason: 'no_tokens' };

  const messaging = await getMessaging(db);
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: {
      type: 'whatsapp_tray_clear',
      phone,
      tag: `wa_inbound_${phone}`,
    },
    android: { priority: 'high' },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
  });
  if (stale.length > 0) {
    await pruneAdminFcmTokens(db, stale);
  }

  return { sent: res.successCount };
}

module.exports = {
  pushWhatsAppInboundToAdmins,
  pushWhatsAppTrayClearToAdmins,
  previewInboundBody,
};
