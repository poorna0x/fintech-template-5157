import { supabase } from '@/lib/supabaseClient';
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
};

/** Sequential Cloud API send to unique numbers; each destination gets its own 24h check. */
export async function sendWhatsAppToMany(
  destinations: string[],
  sendOne: (to: string, windowClosed: boolean) => Promise<WhatsAppDestSendOneResult>,
  onProgress?: (to: string, windowClosed: boolean, index: number, total: number) => void
): Promise<{ sent: number; usedTemplate: boolean; lastError: string; lastVia?: string }> {
  let sent = 0;
  let usedTemplate = false;
  let lastError = '';
  let lastVia: string | undefined;
  for (let i = 0; i < destinations.length; i += 1) {
    const to = destinations[i];
    const inboundAt = await fetchLastInboundAt(to, supabase);
    const windowClosed = isCustomerServiceWindowClosed(inboundAt);
    onProgress?.(to, windowClosed, i, destinations.length);
    const result = await sendOne(to, windowClosed);
    if (!result.ok) {
      lastError = result.error || 'Could not send WhatsApp';
      continue;
    }
    sent += 1;
    if (result.viaColdTemplate || result.via === 'cold_template') usedTemplate = true;
    if (result.via) lastVia = result.via;
    invalidateInboundWindowCache(to);
  }
  return { sent, usedTemplate, lastError, lastVia };
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
  const extra =
    opts.sent < opts.total && opts.lastError ? ` (${opts.total - opts.sent} failed)` : '';
  if (opts.sent > 1) return `${opts.many} to ${opts.sent} numbers${extra}`;
  return opts.usedTemplate ? opts.oneTemplate : opts.one;
}
