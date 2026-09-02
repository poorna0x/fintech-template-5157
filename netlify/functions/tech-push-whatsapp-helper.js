/**
 * After (or instead of) FCM to a technician: optionally send the same alert via WhatsApp Cloud API.
 * Honors whatsapp_crm_settings.tech_push_whatsapp + technicians.whatsapp_prefs.
 * Soft-fails (never throws) — push must still succeed if WA fails / 24h window closed.
 */
const {
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
} = require('./whatsapp-helper');

/** Assign/unassign stay on Dashboard WhatsApp. Location ping is silent GPS. */
const SKIP_CATEGORIES = new Set(['job_assigned', 'job_unassigned', 'location_ping']);

/**
 * Push-mirror WhatsApp is off for most alerts (going?, start, call, office,
 * OTP, parts, bill, cash, wrong line, hours, reviews). Pay-QR customer photos
 * are the exception: text fallback when the image could not be delivered.
 */
const MIRROR_CATEGORIES = new Set(['pay_qr_screenshot']);

function isCategoryOn(prefs, category) {
  if (!category) return false;
  if (!prefs || typeof prefs !== 'object') return true;
  return prefs[category] !== false;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ technicianId: string, category: string, title?: string, body?: string }} opts
 */
async function maybeSendTechnicianPushWhatsApp(db, opts) {
  try {
    const category = String(opts.category || '').trim();
    const technicianId = String(opts.technicianId || '').trim();
    if (!db || !technicianId || !category) return { sent: false, reason: 'bad_args' };
    if (SKIP_CATEGORIES.has(category) || !MIRROR_CATEGORIES.has(category)) {
      return { sent: false, reason: 'skipped_category' };
    }

    const title = String(opts.title || '').trim().slice(0, 120);
    const body = String(opts.body || '').trim().slice(0, 900);
    if (!title && !body) return { sent: false, reason: 'empty' };

    const { data: settings } = await db
      .from('whatsapp_crm_settings')
      .select('enabled, tech_push_whatsapp')
      .eq('id', 1)
      .maybeSingle();

    if (settings?.enabled === false) {
      return { sent: false, reason: 'wa_master_off' };
    }
    if (!isCategoryOn(settings?.tech_push_whatsapp, category)) {
      return { sent: false, reason: 'category_off' };
    }

    const { data: tech } = await db
      .from('technicians')
      .select('phone, whatsapp_phone, whatsapp_prefs')
      .eq('id', technicianId)
      .maybeSingle();

    if (!tech) return { sent: false, reason: 'no_tech' };
    if (!isCategoryOn(tech.whatsapp_prefs, category)) {
      return { sent: false, reason: 'tech_pref_off' };
    }

    // Prefer admin WhatsApp number, else contact phone (same as CRM assign flow).
    const phone = normalizePhoneE164(tech.whatsapp_phone || tech.phone);
    if (!phone) return { sent: false, reason: 'no_phone' };

    const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
    if (!accessToken || !phoneNumberId) {
      return { sent: false, reason: 'no_credentials' };
    }

    const text = title && body ? `*${title}*\n\n${body}` : title || body;
    const result = await callWhatsAppApi(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 4096) },
    });

    const waId = result?.data?.messages?.[0]?.id || null;
    await insertWhatsAppMessage(db, {
      wa_message_id: waId,
      direction: 'outbound',
      phone_e164: phone,
      msg_type: 'text',
      body: text,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok
        ? null
        : JSON.stringify(result.data?.error || result.data || {}).slice(0, 500),
    });

    if (!result.ok) {
      console.warn(
        '[tech-push-whatsapp]',
        category,
        'send failed',
        result.data?.error?.message || result.status
      );
      return { sent: false, reason: 'api_failed' };
    }
    return { sent: true, waId };
  } catch (err) {
    console.warn('[tech-push-whatsapp] error', err?.message || err);
    return { sent: false, reason: 'error' };
  }
}

module.exports = {
  maybeSendTechnicianPushWhatsApp,
  MIRROR_CATEGORIES,
  SKIP_CATEGORIES,
};
