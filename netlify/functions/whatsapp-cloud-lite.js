/**
 * Minimal WhatsApp Cloud API helpers for website booking confirmation.
 * No R2 / media / sharp — safe to ship on both HydrogenRO and ElevenRO Netlify sites.
 */
const { createClient } = require('@supabase/supabase-js');

const GRAPH_VERSION = 'v21.0';

const SECRET_KEYS = {
  accessToken: 'whatsapp_access_token',
  phoneNumberId: 'whatsapp_phone_number_id',
};

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneE164(value) {
  let digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function getServiceSupabase() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readAppSecret(db, key) {
  if (!db) return '';
  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error || !data?.value) return '';
  return String(data.value).trim();
}

async function getWhatsAppCredentials(db = getServiceSupabase()) {
  const envAccessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const envPhoneNumberId = (
    process.env.PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    ''
  ).trim();

  let accessToken = envAccessToken;
  let phoneNumberId = envPhoneNumberId;
  if (db) {
    const [secretToken, secretPhoneId] = await Promise.all([
      readAppSecret(db, SECRET_KEYS.accessToken),
      readAppSecret(db, SECRET_KEYS.phoneNumberId),
    ]);
    accessToken = secretToken || envAccessToken;
    phoneNumberId = secretPhoneId || envPhoneNumberId;
  }
  return { accessToken, phoneNumberId };
}

async function callWhatsAppApi(phoneNumberId, accessToken, payload) {
  if (!phoneNumberId || !accessToken) {
    return {
      ok: false,
      status: 401,
      data: {
        error: {
          message: 'WhatsApp credentials missing on server',
          type: 'OAuthException',
          code: 190,
        },
      },
    };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function insertWhatsAppMessage(db, row) {
  if (!db) return null;
  const phone = normalizePhoneE164(row.phone_e164 || row.phone);
  if (!phone) return null;

  const payload = {
    wa_message_id: row.wa_message_id || null,
    direction: row.direction,
    phone_e164: phone,
    customer_id: row.customer_id || null,
    msg_type: row.msg_type || row.type || 'text',
    body: row.body != null ? String(row.body).slice(0, 8000) : null,
    media_url: row.media_url || null,
    media_mime: row.media_mime || null,
    filename: row.filename || null,
    status: row.status || null,
    template_name: row.template_name || null,
    error_message: row.error_message ? String(row.error_message).slice(0, 1000) : null,
    sent_by_user_id: row.sent_by_user_id || null,
  };

  let { data, error } = await db
    .from('whatsapp_messages')
    .insert(payload)
    .select('id')
    .maybeSingle();

  if (
    error &&
    payload.customer_id &&
    (error.code === '23503' || /customer_id|foreign key/i.test(error.message || ''))
  ) {
    payload.customer_id = null;
    ({ data, error } = await db
      .from('whatsapp_messages')
      .insert(payload)
      .select('id')
      .maybeSingle());
  }

  if (error) {
    if (error.code === '23505') return null;
    console.error('[whatsapp-cloud-lite] insert failed', error.message);
    return null;
  }
  return data;
}

async function findCustomerIdByPhone(db, phoneE164) {
  if (!db) return null;
  const phone = normalizePhoneE164(phoneE164);
  if (!phone || phone.length < 10) return null;
  const last10 = phone.slice(-10);
  const candidates = Array.from(
    new Set([phone, last10, `91${last10}`, `+${phone}`, `+91${last10}`].filter(Boolean))
  );

  const { data, error } = await db
    .from('customers')
    .select('id')
    .or(
      [
        ...candidates.map((p) => `phone.eq.${p}`),
        ...candidates.map((p) => `alternate_phone.eq.${p}`),
      ].join(',')
    )
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id;
}

module.exports = {
  GRAPH_VERSION,
  digitsOnly,
  normalizePhoneE164,
  getServiceSupabase,
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  findCustomerIdByPhone,
};
