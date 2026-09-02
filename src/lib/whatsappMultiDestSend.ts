import { supabase } from '@/lib/supabaseClient';
import { SEND_CANCELLED_MESSAGE } from '@/lib/abortSend';
import { friendlyWhatsAppDeliveryError } from '@/lib/whatsappDeliveryError';
import {
  fetchLastInboundAt,
  invalidateInboundWindowCache,
  isCustomerServiceWindowClosed,
} from '@/lib/whatsappInbox';

export type WhatsAppDestSendOneResult = {
  ok: boolean;
  error?: string;
  viaColdTemplate?: boolean;
  via?: string;
  cancelled?: boolean;
};

/** Sequential Cloud API send to unique numbers; each destination gets its own 24h check. */
export async function sendWhatsAppToMany(
  destinations: string[],
  sendOne: (to: string, windowClosed: boolean) => Promise<WhatsAppDestSendOneResult>,
  onProgress?: (to: string, windowClosed: boolean, index: number, total: number) => void,
  signal?: AbortSignal
): Promise<{ sent: number; usedTemplate: boolean; lastError: string; lastVia?: string; cancelled?: boolean }> {
  let sent = 0;
  let usedTemplate = false;
  let lastError = '';
  let lastVia: string | undefined;
  let cancelled = false;
  for (let i = 0; i < destinations.length; i += 1) {
    if (signal?.aborted) {
      cancelled = true;
      lastError = lastError || SEND_CANCELLED_MESSAGE;
      break;
    }
    const to = destinations[i];
    const inboundAt = await fetchLastInboundAt(to, supabase);
    const windowClosed = isCustomerServiceWindowClosed(inboundAt);
    onProgress?.(to, windowClosed, i, destinations.length);
    const result = await sendOne(to, windowClosed);
    if (result.cancelled) {
      cancelled = true;
      lastError = result.error || SEND_CANCELLED_MESSAGE;
      break;
    }
    if (!result.ok) {
      lastError = friendlyWhatsAppDeliveryError(
        result.error || 'Could not send WhatsApp',
        to
      );
      continue;
    }
    sent += 1;
    if (result.viaColdTemplate || result.via === 'cold_template') usedTemplate = true;
    if (result.via) lastVia = result.via;
    invalidateInboundWindowCache(to);
  }
  return { sent, usedTemplate, lastError, lastVia, cancelled };
}

export function whatsappMultiSendOkMessage(opts: {
  sent: number;
  total: number;
  usedTemplate: boolean;
  lastError?: string;
  one: string;
  oneTemplate: string;
  many: string;
}): string {
  const failNote =
    opts.sent < opts.total && opts.lastError ? ` ${opts.lastError}` : '';
  if (opts.total > 1 && opts.sent > 0 && opts.sent < opts.total) {
    return `PDF sent to ${opts.sent} of ${opts.total} numbers.${failNote}`;
  }
  if (opts.sent > 1) return `${opts.many} to ${opts.sent} numbers.${failNote}`;
  const one = opts.usedTemplate ? opts.oneTemplate : opts.one;
  return `${one}${failNote ? `.${failNote}` : ''}`;
}
