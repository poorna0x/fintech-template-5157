// Shared helpers: log sent emails, inject open-tracking pixel, record opens.
// Egress-conscious: cache CRM setting, insert without RETURNING, single RPC on pixel hit.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Avoid reading crm_settings on every send (same pattern as admin notification counts). */
const TRACKING_SETTING_CACHE_MS = 5 * 60 * 1000;
let trackingEnabledCache = { value: true, expiresAt: 0 };

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function getSupabaseAdmin() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Customer emails must hit production — localhost/preview URLs never load from Gmail. */
function getTrackingPixelUrl(token) {
  return `https://hydrogenro.com/api/email-open-track?t=${encodeURIComponent(token)}`;
}

function sanitizeTemplateType(purpose, raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && trimmed.length <= 64 && /^[\w.-]+$/.test(trimmed)) {
      return trimmed;
    }
  }
  if (typeof purpose === 'string' && purpose.length <= 64) return purpose;
  return 'unknown';
}

function sanitizeBrand(raw) {
  return raw === 'elevenro' ? 'elevenro' : 'hydrogenro';
}

async function isTrackingEnabled(admin) {
  const now = Date.now();
  if (now < trackingEnabledCache.expiresAt) {
    return trackingEnabledCache.value;
  }

  if (!admin) return true;

  try {
    const { data, error } = await admin
      .from('crm_settings')
      .select('value')
      .eq('key', 'email_open_tracking_enabled')
      .maybeSingle();
    let enabled = true;
    if (!error && data) {
      const v = data.value;
      if (v === false || v === 'false' || v === 0) enabled = false;
    }
    trackingEnabledCache = { value: enabled, expiresAt: now + TRACKING_SETTING_CACHE_MS };
    return enabled;
  } catch {
    return true;
  }
}

function invalidateTrackingSettingCache() {
  trackingEnabledCache.expiresAt = 0;
}

function injectTrackingPixel(html, token) {
  if (!html || !token || !isUuid(token)) return html;
  const url = getTrackingPixelUrl(token);
  // Avoid display:none — some mail clients skip loading hidden images.
  const pixel = `<img src="${url}" width="1" height="1" border="0" alt="" style="width:1px;height:1px;margin:0;padding:0;line-height:1px;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

async function prepareTrackedEmail(options) {
  const {
    html,
    recipientEmail,
    subject,
    templateType,
    documentBrand,
    jobId,
    customerId,
    sentByUserId,
  } = options;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { html, logId: null };
  }

  let trackingEnabled = false;
  try {
    trackingEnabled = await isTrackingEnabled(admin);
  } catch {
    trackingEnabled = true;
  }

  const trackingToken = trackingEnabled ? crypto.randomUUID() : null;
  const row = {
    tracking_token: trackingToken,
    recipient_email: String(recipientEmail || '').slice(0, 500),
    subject: String(subject || '').slice(0, 500),
    template_type: sanitizeTemplateType(options.purpose, templateType),
    document_brand: sanitizeBrand(documentBrand),
    job_id: isUuid(jobId) ? jobId.trim() : null,
    customer_id: isUuid(customerId) ? customerId.trim() : null,
    sent_by_user_id: isUuid(sentByUserId) ? sentByUserId.trim() : null,
    smtp_message_id: null,
    tracking_pixel_enabled: Boolean(trackingEnabled && trackingToken),
    sent_at: new Date().toISOString(),
  };

  if (!row.recipient_email || !row.subject) {
    return { html, logId: null };
  }

  try {
    const { error } = await admin.from('sent_email_logs').insert(row);
    if (error) {
      console.warn('[email-tracking] insert failed', error.message);
      return { html, logId: null };
    }

    const finalHtml = trackingToken ? injectTrackingPixel(html, trackingToken) : html;
    return { html: finalHtml, logId: null };
  } catch (err) {
    console.warn('[email-tracking] prepare failed', err && err.message);
    return { html, logId: null };
  }
}

async function recordEmailOpenDirect(admin, token) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('sent_email_logs')
    .update({ opened_at: now, open_count: 1 })
    .eq('tracking_token', token.trim())
    .is('opened_at', null)
    .select('id');

  if (error) {
    console.warn('[email-tracking] open direct update failed', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** First open only — RPC when available, direct UPDATE fallback if migration not run yet. */
async function recordEmailOpen(token) {
  if (!isUuid(token)) return false;
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  try {
    const { data, error } = await admin.rpc('record_sent_email_open', {
      p_token: token.trim(),
    });

    if (!error) {
      return data === true || data === 't' || data === 1;
    }

    const msg = error.message || '';
    if (/record_sent_email_open|PGRST202|42883|schema cache/i.test(msg)) {
      return recordEmailOpenDirect(admin, token);
    }

    console.warn('[email-tracking] open rpc failed', msg);
    return false;
  } catch (err) {
    console.warn('[email-tracking] open record failed', err && err.message);
    return false;
  }
}

module.exports = {
  TRANSPARENT_GIF,
  isUuid,
  prepareTrackedEmail,
  recordEmailOpen,
  invalidateTrackingSettingCache,
};
