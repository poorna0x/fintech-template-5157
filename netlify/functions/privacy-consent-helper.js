/**
 * Persist DPDP consent evidence (service-role). Soft-fail never blocks booking.
 */
const PRIVACY_NOTICE_VERSION = '2026-08-14';

function normalizeBrand(brand) {
  const b = String(brand || '')
    .trim()
    .toLowerCase();
  if (b === 'elevenro' || b === 'eleven' || b === 'ero') return 'elevenro';
  return 'hydrogenro';
}

function phoneE164FromDigits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  return d || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {object} opts
 */
async function recordCustomerConsent(db, opts = {}) {
  if (!db) return { ok: false, skipped: true };
  try {
    const phone_e164 = phoneE164FromDigits(opts.phone || opts.phoneE164);
    const row = {
      customer_id: opts.customerId || null,
      phone_e164,
      brand: normalizeBrand(opts.brand),
      purpose: String(opts.purpose || 'service_booking').trim(),
      channel: String(opts.channel || 'website').trim(),
      notice_version: String(opts.noticeVersion || PRIVACY_NOTICE_VERSION).trim(),
      policy_url: opts.policyUrl || null,
      granted: opts.granted !== false,
      evidence: {
        accept_legal: opts.acceptLegal === true,
        source: opts.source || 'booking',
        ip: opts.ip || null,
        user_agent: opts.userAgent ? String(opts.userAgent).slice(0, 300) : null,
        ...(opts.evidence && typeof opts.evidence === 'object' ? opts.evidence : {}),
      },
      consented_at: new Date().toISOString(),
    };
    const { error } = await db.from('customer_consents').insert(row);
    if (error) {
      console.warn('[consent] insert failed', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[consent] record failed', err?.message || err);
    return { ok: false, error: err?.message || 'failed' };
  }
}

async function recordSecurityAudit(db, opts = {}) {
  if (!db) return { ok: false };
  try {
    const { error } = await db.rpc('record_security_audit_event', {
      p_event_type: opts.eventType || 'security',
      p_action: opts.action || 'unknown',
      p_result: opts.result || 'ok',
      p_actor_user_id: opts.actorUserId || null,
      p_actor_email: opts.actorEmail || null,
      p_actor_role: opts.actorRole || null,
      p_target_type: opts.targetType || null,
      p_target_id: opts.targetId || null,
      p_ip: opts.ip || null,
      p_user_agent: opts.userAgent || null,
      p_meta: opts.meta || {},
    });
    if (error) {
      console.warn('[audit] record failed', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[audit] record failed', err?.message || err);
    return { ok: false };
  }
}

module.exports = {
  PRIVACY_NOTICE_VERSION,
  normalizeBrand,
  phoneE164FromDigits,
  recordCustomerConsent,
  recordSecurityAudit,
};
