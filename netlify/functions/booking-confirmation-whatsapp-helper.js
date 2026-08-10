/**
 * Soft-fail: send online-booking confirmation via Meta UTILITY template (cold).
 * Called from booking-job-create after a public website booking succeeds.
 */
const {
  getWhatsAppCredentials,
  insertWhatsAppMessage,
  normalizePhoneE164,
  findCustomerIdByPhone,
} = require('./whatsapp-helper');
const { sendTemplateWithColdFallbacks } = require('./whatsapp-cold-fallback');
const {
  resolveBrandFromBookingSource,
  resolveBookingCta,
  buildBookingWhenLabel,
} = require('./whatsapp-booking-cta-resolve');

const DEDUPE_MINUTES = 30;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{
 *   phone: string,
 *   customerName?: string|null,
 *   customerId?: string|null,
 *   jobNumber?: string|null,
 *   scheduledDate?: string|null,
 *   scheduledTimeSlot?: string|null,
 *   customTime?: string|null,
 *   bookingSource?: string|null,
 *   bookingDomain?: string|null,
 *   force?: boolean,
 * }} opts
 */
async function maybeSendOnlineBookingConfirmationWhatsApp(db, opts) {
  try {
    if (!db) return { sent: false, reason: 'no_db' };
    const phone = normalizePhoneE164(opts.phone);
    if (!phone) return { sent: false, reason: 'no_phone' };

    const { data: settings, error: settingsErr } = await db
      .from('whatsapp_crm_settings')
      .select(
        'enabled, allow_cold_templates, allow_online_booking_whatsapp, auto_send_online_booking_whatsapp'
      )
      .eq('id', 1)
      .maybeSingle();

    let gate = settings || {};
    if (settingsErr) {
      const { data: legacy } = await db
        .from('whatsapp_crm_settings')
        .select('enabled, allow_cold_templates')
        .eq('id', 1)
        .maybeSingle();
      gate = {
        ...legacy,
        allow_online_booking_whatsapp: true,
        auto_send_online_booking_whatsapp: true,
      };
    }

    if (gate?.enabled === false) return { sent: false, reason: 'wa_master_off' };
    if (gate?.allow_online_booking_whatsapp === false) {
      return { sent: false, reason: 'online_booking_off' };
    }
    if (gate?.allow_cold_templates === false) {
      return { sent: false, reason: 'cold_templates_off' };
    }
    if (!opts.force && gate?.auto_send_online_booking_whatsapp === false) {
      return { sent: false, reason: 'auto_off' };
    }

    const jobNumber = String(opts.jobNumber || '').trim();
    if (!jobNumber) return { sent: false, reason: 'no_job_number' };

    const sinceIso = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
    const { data: recent } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phone)
      .eq('direction', 'outbound')
      .ilike('template_name', 'svc_booking_confirmed%')
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle();
    if (recent?.id) return { sent: false, reason: 'deduped' };

    const brand = resolveBrandFromBookingSource(opts.bookingSource, opts.bookingDomain);
    const customerName = String(opts.customerName || '').trim() || 'there';
    const whenLabel = buildBookingWhenLabel(
      opts.scheduledDate,
      opts.scheduledTimeSlot,
      opts.customTime
    );
    const tpl = resolveBookingCta('booking_confirmed', brand, customerName, jobNumber, whenLabel);

    let customerId = opts.customerId ? String(opts.customerId) : null;
    if (!customerId) {
      customerId = await findCustomerIdByPhone(db, phone);
    }

    const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
    if (!accessToken || !phoneNumberId) {
      return { sent: false, reason: 'no_credentials' };
    }

    const sendResult = await sendTemplateWithColdFallbacks({
      phoneNumberId,
      accessToken,
      to: phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      bodyParams: tpl.bodyParams,
      headerComponents: [],
      enableFallback: true,
    });

    const usedName = sendResult.templateName || tpl.name;
    const result = sendResult.result;
    const waId = result?.data?.messages?.[0]?.id || null;

    await insertWhatsAppMessage(db, {
      wa_message_id: waId,
      direction: 'outbound',
      phone_e164: phone,
      customer_id: customerId,
      msg_type: 'template',
      body: `Online booking confirmed (${usedName}) · ${jobNumber}`,
      template_name: usedName,
      status: sendResult.ok ? 'sent' : 'failed',
      error_message: sendResult.ok
        ? null
        : JSON.stringify(result?.data?.error || result?.data || {}).slice(0, 500),
    });

    if (!sendResult.ok) {
      console.warn(
        '[booking-confirm-whatsapp] send failed',
        result?.data?.error?.message || result?.status
      );
      return { sent: false, reason: 'api_failed' };
    }

    return { sent: true, waId, templateName: usedName, jobNumber };
  } catch (err) {
    console.warn('[booking-confirm-whatsapp] error', err?.message || err);
    return { sent: false, reason: 'error' };
  }
}

module.exports = { maybeSendOnlineBookingConfirmationWhatsApp };
