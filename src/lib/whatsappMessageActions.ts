import {
  getWhatsAppMediaBytesCached,
  purgeWhatsAppMessages,
  sendAdminWhatsAppMedia,
  sendAdminWhatsAppText,
} from '@/lib/sendAdminWhatsAppApi';
import { extractMapsUrlFromText } from '@/lib/googleMapsLink';
import {
  formatAdminWhatsAppBody,
  isBookingBotStateMessage,
  removeWhatsAppThreadMessageCache,
  toWhatsAppPhoneDigits,
  type WhatsAppMessageRow,
} from '@/lib/whatsappInbox';
import { isWhatsAppLocationMessage } from '@/lib/whatsappInboxApplyToCustomer';

function bytesToBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function messageHasDeletableFile(message: WhatsAppMessageRow): boolean {
  return Boolean(String(message.media_url || '').trim());
}

export function canActOnWhatsAppMessage(message: WhatsAppMessageRow): boolean {
  return !isBookingBotStateMessage(message.body);
}

export function canForwardWhatsAppMessage(message: WhatsAppMessageRow): boolean {
  if (!canActOnWhatsAppMessage(message)) return false;
  if (String(message.media_url || '').trim()) return true;
  if (isWhatsAppLocationMessage(message)) return true;
  return Boolean(formatAdminWhatsAppBody(message.body, { compact: false }).trim());
}

export async function deleteWhatsAppInboxMessage(message: WhatsAppMessageRow): Promise<{
  ok: boolean;
  error?: string;
}> {
  const result = await purgeWhatsAppMessages({
    messageId: message.id,
    messageIds: [message.id],
  });
  if (!result.ok) return { ok: false, error: result.error || 'Could not delete' };
  removeWhatsAppThreadMessageCache(message.id, message.phone_e164);
  return { ok: true };
}

export async function forwardWhatsAppInboxMessage(opts: {
  message: WhatsAppMessageRow;
  to: string;
  customerId?: string | null;
}): Promise<{ ok: boolean; error?: string; needsWindow?: boolean }> {
  const to = toWhatsAppPhoneDigits(opts.to);
  if (!to) return { ok: false, error: 'Choose a chat to forward to' };

  const mediaUrl = String(opts.message.media_url || '').trim();
  if (mediaUrl) {
    const fetched = await getWhatsAppMediaBytesCached({
      mediaUrl,
      messageId: opts.message.id,
      mimeHint: opts.message.media_mime,
    });
    let bytes = fetched.bytes || null;
    if (!bytes && fetched.url) {
      try {
        const res = await fetch(fetched.url);
        if (res.ok) bytes = await res.arrayBuffer();
      } catch {
        bytes = null;
      }
    }
    if (!bytes) {
      return { ok: false, error: fetched.error || 'Could not load the file to forward' };
    }
    const filename =
      String(opts.message.filename || '').trim() ||
      (String(opts.message.media_mime || '').startsWith('image/') ? 'photo.jpg' : 'file');
    const mimeType =
      String(opts.message.media_mime || '').trim() ||
      (/\.pdf$/i.test(filename) ? 'application/pdf' : 'application/octet-stream');
    const caption = formatAdminWhatsAppBody(opts.message.body, { compact: false }).trim();
    const sent = await sendAdminWhatsAppMedia({
      to,
      fileBase64: bytesToBase64(bytes),
      filename,
      mimeType,
      ...(caption && caption !== filename ? { caption } : {}),
      customerId: opts.customerId,
      source: 'inbox',
    });
    if (!sent.ok) {
      return {
        ok: false,
        error: sent.error || 'Forward failed',
        needsWindow: Boolean(sent.needsWindowOrTemplate),
      };
    }
    return { ok: true };
  }

  let text = formatAdminWhatsAppBody(opts.message.body, { compact: false }).trim();
  if (!text && isWhatsAppLocationMessage(opts.message)) {
    text = extractMapsUrlFromText(opts.message.body || '') || String(opts.message.body || '').trim();
  }
  if (!text) return { ok: false, error: 'Nothing to forward' };

  const sent = await sendAdminWhatsAppText({
    to,
    text,
    customerId: opts.customerId,
    source: 'inbox',
    fallbackWaMe: false,
  });
  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error || 'Forward failed',
      needsWindow: Boolean(sent.needsWindowOrTemplate),
    };
  }
  return { ok: true };
}
