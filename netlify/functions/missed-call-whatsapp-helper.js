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
  'missed_call_callback_ero_cta_v6',
  'missed_call_callback_hro_cta_v6',
  'missed_call_callback_ero_cta_v7',
  'missed_call_callback_hro_cta_v7',
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

/** Latest completion timestamp among COMPLETED job rows (completed_at, else end_time). */
function pickLastCompletedServiceAt(jobs) {
  let best = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const row of jobs || []) {
    const raw = String(row?.completed_at || row?.end_time || '').trim();
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isNaN(ms) || ms < bestMs) continue;
    bestMs = ms;
    best = raw;
  }
  return best;
}

async function loadMissedCallFacts(db, phone, opts) {
  let customerId = opts.customerId ? String(opts.customerId) : null;
  let customerName = String(opts.customerName || '').trim();
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

  const [{ data: customer }, { data: completedJobs }, { data: brandedJob }] = await Promise.all([
    db.from('customers').select('full_name').eq('id', customerId).maybeSingle(),
    db
      .from('jobs')
      .select('completed_at, end_time')
      .eq('customer_id', customerId)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(40),
    db
      .from('jobs')
      .select('service_brand')
      .eq('customer_id', customerId)
      .eq('status', 'COMPLETED')
      .not('service_brand', 'is', null)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (customer) {
    customerName = customerName || String(customer.full_name || '').trim();
  }
  const fromJob = normalizeServiceBrand(brandedJob?.service_brand);
  if (fromJob) brand = fromJob;
  // Same source as Reports: COMPLETED jobs only. Ignore customers.last_service_date.
  const lastServiceRaw = pickLastCompletedServiceAt(completedJobs || []);

  return {
    customerId,
    customerName,
    brand,
    lastServiceDate: formatLastServiceDate(lastServiceRaw),
  };
}

/**
 * Auto missed-call WhatsApp to customers is off. Staff can still send a
 * missed-call template by hand from Calling / inbox.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ phone: string, customerId?: string|null, customerName?: string|null, force?: boolean }} opts
 */
async function maybeSendMissedCallCallbackWhatsApp(_db, _opts) {
  return { sent: false, reason: 'disabled' };
}

module.exports = {
  maybeSendMissedCallCallbackWhatsApp,
  formatLastServiceDate,
  normalizeServiceBrand,
  pickLastCompletedServiceAt,
  loadMissedCallFacts,
};
