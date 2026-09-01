/**
 * Soft-fail helper: send missed-call callback WhatsApp template to a customer.
 * Used from tech-call-customer-alert when auto_send_missed_call_whatsapp is ON
 * (admin phone or technician phone missed a known customer).
 */
const {
  getWhatsAppCredentials,
  insertWhatsAppMessage,
  normalizePhoneE164,
  findCustomerIdByPhone,
} = require('./whatsapp-helper');
const { sendTemplateWithColdFallbacks } = require('./whatsapp-cold-fallback');

const DEDUPE_HOURS = 6;
const MISSED_CALL_TEMPLATE_NAMES = [
  'svc_missed_call',
  'svc_missed_call_v2',
  'svc_missed_call_v3',
  'missed_call_callback_ero_cta',
  'missed_call_callback_hro_cta',
  'missed_call_callback_ero_cta_v2',
  'missed_call_callback_hro_cta_v2',
  'missed_call_callback_ero_cta_v3',
  'missed_call_callback_hro_cta_v3',
  'missed_call_callback_ero_cta_v4',
  'missed_call_callback_hro_cta_v4',
  'missed_call_callback_ero_cta_v5',
  'missed_call_callback_hro_cta_v5',
];

function brandSuffix(brand) {
  return String(brand || '').toLowerCase() === 'hydrogenro' ? 'hro' : 'ero';
}

function normalizeServiceBrand(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('eleven')) return 'elevenro';
  if (value.includes('hydrogen')) return 'hydrogenro';
  return null;
}

function formatLastServiceDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'not on file yet';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'not on file yet';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

async function loadMissedCallFacts(db, phone, opts) {
  let customerId = opts.customerId ? String(opts.customerId) : null;
  let customerName = String(opts.customerName || '').trim();
  let lastServiceRaw = null;
  let brand = 'elevenro';

  if (!customerId) {
    customerId = (await findCustomerIdByPhone(db, phone)) || null;
  }
  if (!customerId) {
    return {
      customerId: null,
      customerName,
      brand,
      lastServiceDate: formatLastServiceDate(null),
    };
  }

  const [{ data: customer }, { data: job }] = await Promise.all([
    db
      .from('customers')
      .select('full_name, last_service_date')
      .eq('id', customerId)
      .maybeSingle(),
    db
      .from('jobs')
      .select('service_brand, completed_at')
      .eq('customer_id', customerId)
      .eq('status', 'COMPLETED')
      .not('service_brand', 'is', null)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (customer) {
    customerName = customerName || String(customer.full_name || '').trim();
    lastServiceRaw = customer.last_service_date || lastServiceRaw;
  }
  const fromJob = normalizeServiceBrand(job?.service_brand);
  if (fromJob) brand = fromJob;
  if (!lastServiceRaw && job?.completed_at) lastServiceRaw = job.completed_at;

  return {
    customerId,
    customerName,
    brand,
    lastServiceDate: formatLastServiceDate(lastServiceRaw),
  };
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
    const { data: recentTpl } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phone)
      .eq('direction', 'outbound')
      .in('template_name', MISSED_CALL_TEMPLATE_NAMES)
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle();
    if (recentTpl?.id) return { sent: false, reason: 'deduped' };
    const { data: recentBody } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phone)
      .eq('direction', 'outbound')
      .ilike('body', 'Missed-call callback%')
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle();
    if (recentBody?.id) return { sent: false, reason: 'deduped' };

    const facts = await loadMissedCallFacts(db, phone, opts);
    const name = facts.customerName || 'there';
    const templateName = `missed_call_callback_${brandSuffix(facts.brand)}_cta_v5`;
    const bodyParams = [name, facts.lastServiceDate];

    const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
    if (!accessToken || !phoneNumberId) {
      return { sent: false, reason: 'no_credentials' };
    }

    const sendResult = await sendTemplateWithColdFallbacks({
      phoneNumberId,
      accessToken,
      to: phone,
      templateName,
      languageCode: 'en',
      bodyParams,
      headerComponents: [],
      enableFallback: true,
    });

    const usedName = sendResult.templateName || templateName;
    const result = sendResult.result;

    const waId = result?.data?.messages?.[0]?.id || null;
    await insertWhatsAppMessage(db, {
      wa_message_id: waId,
      direction: 'outbound',
      phone_e164: phone,
      customer_id: facts.customerId,
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
    return { sent: true, waId, templateName: usedName, brand: facts.brand };
  } catch (err) {
    console.warn('[missed-call-whatsapp] error', err?.message || err);
    return { sent: false, reason: 'error' };
  }
}

module.exports = {
  maybeSendMissedCallCallbackWhatsApp,
  formatLastServiceDate,
  normalizeServiceBrand,
};
