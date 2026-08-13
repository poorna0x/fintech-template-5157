// Shared push category keys — mirrored in src/lib/pushNotificationPrefs.ts

/** @typedef {import('./push-prefs-helper').AdminPushCategory} AdminPushCategory */
/** @typedef {import('./push-prefs-helper').TechPushCategory} TechPushCategory */

const ADMIN_PUSH_CATEGORIES = [
  'whatsapp_inbound',
  'job_status',
  'customer_calls',
  'wrong_line',
  'tech_search',
  'tech_messages',
  'tech_dismiss_acks',
  'reminders',
  'cash_check',
  'day_summary',
  'new_booking',
  'parts_reminder',
];

const TECH_PUSH_CATEGORIES = [
  'job_assigned',
  'job_unassigned',
  'job_nudges',
  'office_messages',
  'otp_request',
  'location_ping',
  'parts_reminder',
  'bill_reminders',
  'cash_handover',
  'wrong_line',
];

const DEFAULT_ADMIN_PREFS = Object.fromEntries(ADMIN_PUSH_CATEGORIES.map((k) => [k, true]));
const DEFAULT_TECH_PREFS = Object.fromEntries(TECH_PUSH_CATEGORIES.map((k) => [k, true]));

function isCategoryEnabled(pushPrefs, category) {
  if (!category) return true;
  const prefs = pushPrefs && typeof pushPrefs === 'object' ? pushPrefs : null;
  if (!prefs) return true;
  if (prefs[category] === false) return false;
  return true;
}

/** True when push_enabled column is missing or explicitly enabled. */
function isPushEnabledRow(row) {
  return row?.push_enabled !== false;
}

/**
 * All FCM device tokens for admin phones, optionally filtered by notification category.
 * @param skipIfViewingPhone digits — skip devices currently open on that WhatsApp chat (≤2 min).
 */
async function getAdminFcmTokens(db, category = null, skipIfViewingPhone = null) {
  const skipPhone = String(skipIfViewingPhone || '').replace(/\D/g, '');
  let rows = [];
  let error = null;
  if (skipPhone) {
    const first = await db
      .from('admin_push_tokens')
      .select('token, push_enabled, push_prefs, viewing_whatsapp_phone, viewing_whatsapp_at');
    error = first.error;
    rows = first.data || [];
    if (error && /viewing_whatsapp/i.test(error.message || '')) {
      const fallback = await db
        .from('admin_push_tokens')
        .select('token, push_enabled, push_prefs');
      error = fallback.error;
      rows = fallback.data || [];
    }
  } else {
    const first = await db
      .from('admin_push_tokens')
      .select('token, push_enabled, push_prefs');
    error = first.error;
    rows = first.data || [];
  }
  if (error) {
    console.warn('[fcm-helper] admin_push_tokens lookup failed:', error.message);
    return [];
  }
  const now = Date.now();
  const VIEWING_MAX_MS = 2 * 60 * 1000;
  // Unique tokens — duplicate rows (reinstall / race) were causing 2 alerts on one phone.
  return [...new Set(
    (rows || [])
      .filter((r) => {
        if (!r.token || !isPushEnabledRow(r) || !isCategoryEnabled(r.push_prefs, category)) {
          return false;
        }
        if (!skipPhone) return true;
        const viewing = String(r.viewing_whatsapp_phone || '').replace(/\D/g, '');
        if (viewing !== skipPhone) return true;
        const at = r.viewing_whatsapp_at ? new Date(r.viewing_whatsapp_at).getTime() : 0;
        if (Number.isFinite(at) && now - at < VIEWING_MAX_MS) return false;
        return true;
      })
      .map((r) => r.token)
  )];
}

/** Remove stale admin device tokens. */
async function pruneAdminFcmTokens(db, staleTokens) {
  if (!staleTokens || staleTokens.length === 0) return;
  try {
    await db.from('admin_push_tokens').delete().in('token', staleTokens);
  } catch {
    /* table may not exist yet */
  }
}

async function getTechnicianFcmTokens(db, technicianId, category = null) {
  const tokens = new Set();
  const knownDeviceTokens = new Set();

  const { data: rows, error: tableErr } = await db
    .from('technician_push_tokens')
    .select('token, push_enabled, push_prefs')
    .eq('technician_id', technicianId);
  if (tableErr) {
    console.warn('[fcm-helper] technician_push_tokens lookup failed:', tableErr.message);
  }
  for (const r of rows || []) {
    if (!r.token) continue;
    knownDeviceTokens.add(r.token);
    if (isPushEnabledRow(r) && isCategoryEnabled(r.push_prefs, category)) {
      tokens.add(r.token);
    }
  }

  const { data: legacy, error: legacyErr } = await db
    .from('technician_live_locations')
    .select('fcm_token')
    .eq('technician_id', technicianId)
    .maybeSingle();
  if (legacyErr && tokens.size === 0 && knownDeviceTokens.size === 0) {
    throw new Error(`token lookup failed: ${legacyErr.message}`);
  }
  // Legacy column has no push_enabled / push_prefs. Never use it to bypass Device
  // Tracker mute: if this FCM token already has a push_tokens row, prefs above
  // already decided. Only fall back when the tech has no multi-device rows yet.
  if (legacy?.fcm_token && !knownDeviceTokens.has(legacy.fcm_token) && knownDeviceTokens.size === 0) {
    tokens.add(legacy.fcm_token);
  }

  return [...tokens];
}

/** Remove stale device tokens (FCM reported them dead) so we stop sending to them. */
async function pruneTechnicianFcmTokens(db, technicianId, staleTokens) {
  if (!staleTokens || staleTokens.length === 0) return;
  try {
    await db.from('technician_push_tokens').delete().in('token', staleTokens);
  } catch {
    /* table may not exist yet */
  }
  await db
    .from('technician_live_locations')
    .update({ fcm_token: null })
    .eq('technician_id', technicianId)
    .in('fcm_token', staleTokens);
}

/**
 * Send one FCM message to every device of a technician. Optional `category`
 * filters by per-technician push_prefs + per-device push_prefs.
 * Skips when technician push_notifications_enabled = false.
 */
async function sendToTechnicianDevices(db, messaging, technicianId, buildMessage, category = null) {
  try {
    const { data: techRow, error: techErr } = await db
      .from('technicians')
      .select('push_notifications_enabled, push_prefs')
      .eq('id', technicianId)
      .maybeSingle();
    if (!techErr && techRow) {
      if (techRow.push_notifications_enabled === false) {
        return { sent: 0, tokens: 0, skipped: true, reason: 'tech_muted' };
      }
      if (category && !isCategoryEnabled(techRow.push_prefs, category)) {
        return { sent: 0, tokens: 0, skipped: true, reason: 'tech_category_off' };
      }
    }
  } catch (e) {
    console.warn('[fcm-helper] push_notifications_enabled check failed:', e?.message || e);
  }

  const tokens = await getTechnicianFcmTokens(db, technicianId, category);
  if (tokens.length === 0) return { sent: 0, tokens: 0 };

  const results = await Promise.allSettled(tokens.map((t) => messaging.send(buildMessage(t))));
  const stale = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent += 1;
    else if (isStaleTokenError(r.reason)) stale.push(tokens[i]);
    else console.error('[fcm-helper] send failed', r.reason?.message || r.reason);
  });
  await pruneTechnicianFcmTokens(db, technicianId, stale);
  return { sent, tokens: tokens.length };
}

function isStaleTokenError(err) {
  const code = err?.errorInfo?.code || err?.code || '';
  return String(code).includes('registration-token-not-registered');
}

module.exports = {
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  getTechnicianFcmTokens,
  pruneTechnicianFcmTokens,
  sendToTechnicianDevices,
  isStaleTokenError,
  isPushEnabledRow,
  isCategoryEnabled,
  ADMIN_PUSH_CATEGORIES,
  TECH_PUSH_CATEGORIES,
  DEFAULT_ADMIN_PREFS,
  DEFAULT_TECH_PREFS,
};
