import { supabase } from '@/lib/supabaseClient';
import { whatsappPhoneLookupKeys } from '@/lib/whatsappPhoneTarget';

const NOT_ON_WHATSAPP_RE =
  /undeliverable|131026|not on WhatsApp|not a whatsapp user|recipient is not a valid whatsapp/i;

export function isNotOnWhatsAppError(raw?: string | null): boolean {
  return NOT_ON_WHATSAPP_RE.test(String(raw || ''));
}

function last10Digits(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Staff-facing copy when Meta cannot deliver (not on WhatsApp / blocked). */
export function friendlyWhatsAppDeliveryError(
  raw?: string | null,
  phone?: string | null
): string {
  const msg = String(raw || '').trim();
  if (msg && !isNotOnWhatsAppError(msg)) return msg;
  if (/not on WhatsApp/i.test(msg)) return msg;
  const digits = last10Digits(phone);
  return digits
    ? `${digits} is not on WhatsApp (or blocked this business)`
    : 'This number is not on WhatsApp (or blocked this business)';
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function readOutboundDeliveryRow(opts: {
  rowId?: string | null;
  phone?: string | null;
}): Promise<{ status: string; error_message: string } | null> {
  const id = String(opts.rowId || '').trim();
  if (id) {
    let query = supabase.from('whatsapp_messages').select('status, error_message');
    query = isUuid(id) ? query.eq('id', id) : query.eq('wa_message_id', id);
    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return {
        status: String((data as { status?: string }).status || ''),
        error_message: String((data as { error_message?: string }).error_message || ''),
      };
    }
  }

  const keys = whatsappPhoneLookupKeys(opts.phone || '');
  if (!keys.length) return null;
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('status, error_message')
    .eq('direction', 'outbound')
    .in('phone_e164', keys)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: String((data as { status?: string }).status || ''),
    error_message: String((data as { error_message?: string }).error_message || ''),
  };
}

/**
 * Meta often returns 200, then the webhook marks the row failed a second later.
 * Wait so PDF/template sends can toast the real delivery error.
 */
export async function confirmWhatsAppCloudDelivery(opts: {
  rowId?: string | null;
  phone?: string | null;
  timeoutMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 12_000);
  while (Date.now() < deadline) {
    const row = await readOutboundDeliveryRow(opts);
    const status = String(row?.status || '').toLowerCase();
    const errMsg = String(row?.error_message || '').trim();
    if (status === 'failed' || status === 'undelivered' || status === 'error') {
      return {
        ok: false,
        error: friendlyWhatsAppDeliveryError(errMsg || 'Message undeliverable', opts.phone),
      };
    }
    if (status === 'delivered' || status === 'read' || status === 'played') {
      return { ok: true };
    }
    await new Promise((r) => setTimeout(r, 450));
  }
  return { ok: true };
}
