/**
 * Soft-fail helper: send missed-call callback WhatsApp template to a customer.
 * Used from tech-call-customer-alert when auto_send_missed_call_whatsapp is ON.
 */
const {
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  findCustomerIdByPhone,
} = require('./whatsapp-helper');

const DEDUPE_HOURS = 6;

function brandSuffix(brand) {
  return String(brand || '').toLowerCase() === 'elevenro' ? 'ero' : 'hro';
}

function resolveBrandFromCustomer(customer) {
  const raw = String(customer?.brand || customer?.service_brand || '').toLowerCase();
  if (raw.includes('eleven')) return 'elevenro';
  return 'hydrogenro';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ phone: string, customerId?: string|null, customerName?: string|null, force?: boolean }} opts
 */
async function maybeSendMissedCallCallbackWhatsApp(db, opts) {
  try {
    if (!db) return { sent: false, reason: 'no_db' };
    const phone = normalizePhoneE164(opts.phone);
    if (!phone) return { sent: false, reason: 'no_phone' };

    const { data: settings } = await db
      .from('whatsapp_crm_settings')
      .select('enabled, allow_calling, allow_cold_templates, auto_send_missed_call_whatsapp')
      .eq('id', 1)
      .maybeSingle();

    if (settings?.enabled === false) return { sent: false, reason: 'wa_master_off' };
    if (settings?.allow_calling === false) return { sent: false, reason: 'calling_off' };
    if (settings?.allow_cold_templates === false) {
      return { sent: false, reason: 'cold_templates_off' };
    }
    if (!opts.force && settings?.auto_send_missed_call_whatsapp !== true) {
      return { sent: false, reason: 'auto_off' };
    }

    const sinceIso = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
    const { data: recent } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phone)
      .eq('direction', 'out')
      .ilike('template_name', 'missed_call_callback%')
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle();
    if (recent?.id) return { sent: false, reason: 'deduped' };

    let customerId = opts.customerId ? String(opts.customerId) : null;
    let customerName = String(opts.customerName || '').trim();
    let brand = 'hydrogenro';

    if (customerId) {
      const { data: c } = await db
        .from('customers')
        .select('id, full_name, brand')
        .eq('id', customerId)
        .maybeSingle();
      if (c) {
        customerName = customerName || String(c.full_name || '').trim();
        brand = resolveBrandFromCustomer(c);
      }
    } else {
      const foundId = await findCustomerIdByPhone(db, phone);
      if (foundId) {
        customerId = foundId;
        const { data: c } = await db
          .from('customers')
          .select('full_name, brand')
          .eq('id', foundId)
          .maybeSingle();
        if (c) {
          customerName = customerName || String(c.full_name || '').trim();
          brand = resolveBrandFromCustomer(c);
        }
      }
    }

    const name = customerName || 'there';
    const templateName = `missed_call_callback_${brandSuffix(brand)}_cta`;
    const fallbackName = 'svc_visit_reminder';
    const fallbackParams = [name, 'callback for your missed call'];
    const primaryParams = [name];

    const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
    if (!accessToken || !phoneNumberId) {
      return { sent: false, reason: 'no_credentials' };
    }

    const buildPayload = (tName, params) => ({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: tName,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: params.map((t) => ({ type: 'text', text: String(t) })),
          },
        ],
      },
    });

    let usedName = templateName;
    let usedParams = primaryParams;
    let result = await callWhatsAppApi(
      phoneNumberId,
      accessToken,
      buildPayload(templateName, primaryParams)
    );

    // CTA not approved yet → utility reminder with missed-call hint
    if (!result.ok) {
      const errMsg = String(result.data?.error?.message || '');
      if (/template|not (found|exist)|approved|parameter/i.test(errMsg)) {
        usedName = fallbackName;
        usedParams = fallbackParams;
        result = await callWhatsAppApi(
          phoneNumberId,
          accessToken,
          buildPayload(fallbackName, fallbackParams)
        );
      }
    }

    const waId = result?.data?.messages?.[0]?.id || null;
    await insertWhatsAppMessage(db, {
      wa_message_id: waId,
      direction: 'out',
      phone_e164: phone,
      customer_id: customerId,
      msg_type: 'template',
      body: `Missed-call callback (${usedName})`,
      template_name: usedName,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok
        ? null
        : JSON.stringify(result.data?.error || result.data || {}).slice(0, 500),
    });

    if (!result.ok) {
      console.warn(
        '[missed-call-whatsapp] send failed',
        result.data?.error?.message || result.status
      );
      return { sent: false, reason: 'api_failed' };
    }
    return { sent: true, waId, templateName: usedName };
  } catch (err) {
    console.warn('[missed-call-whatsapp] error', err?.message || err);
    return { sent: false, reason: 'error' };
  }
}

module.exports = { maybeSendMissedCallCallbackWhatsApp };
