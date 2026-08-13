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

  const messaging = await getMessaging(db);
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `WhatsApp · ${title}`,
      body,
    },
    data: {
      type: 'whatsapp_inbound',
      phone,
      tag: `wa_inbound_${phone}`,
      panel: 'whatsapp-inbox',
      color: WA_GREEN,
      ...(details.waMessageId ? { waMessageId: String(details.waMessageId) } : {}),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'job_alerts_v2',
        // Admin APK drawable — WhatsApp mark instead of HRO default ic_stat_notify
        icon: 'ic_stat_whatsapp',
        defaultSound: true,
        color: WA_GREEN,
        tag: `wa_inbound_${phone}`,
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

module.exports = { pushWhatsAppInboundToAdmins, previewInboundBody };
