// Shared Firebase Cloud Messaging bootstrap for Netlify functions.
// The service-account credential lives in the app_secrets table (key
// 'firebase_service_account', service-role read only) — NOT in an env var,
// because a ~2.5KB value pushes the function env over AWS Lambda's 4KB limit
// and breaks deploys of every function.

let messagingPromise = null;

/** @param db Supabase client using the service role key. */
function getMessaging(db) {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
        if (!raw) {
          const { data, error } = await db
            .from('app_secrets')
            .select('value')
            .eq('key', 'firebase_service_account')
            .maybeSingle();
          if (error || !data?.value) {
            throw new Error('firebase_service_account secret not found in app_secrets');
          }
          raw = data.value;
        }
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
      }
      return admin.messaging();
    })();
    // Allow a retry on the next invocation if init failed.
    messagingPromise.catch(() => {
      messagingPromise = null;
    });
  }
  return messagingPromise;
}

/**
 * All FCM device tokens for a technician (one per logged-in device).
 * Union of the technician_push_tokens table (multi-device) and the legacy
 * technician_live_locations.fcm_token column, deduped. Empty array when the
 * app isn't installed anywhere.
 */
async function getTechnicianFcmTokens(db, technicianId) {
  const tokens = new Set();

  const { data: rows, error: tableErr } = await db
    .from('technician_push_tokens')
    .select('token')
    .eq('technician_id', technicianId);
  if (tableErr) {
    // Table missing (add-technician-push-tokens.sql not run yet) — legacy column still works.
    console.warn('[fcm-helper] technician_push_tokens lookup failed:', tableErr.message);
  }
  for (const r of rows || []) if (r.token) tokens.add(r.token);

  const { data: legacy, error: legacyErr } = await db
    .from('technician_live_locations')
    .select('fcm_token')
    .eq('technician_id', technicianId)
    .maybeSingle();
  if (legacyErr && tokens.size === 0) {
    throw new Error(`token lookup failed: ${legacyErr.message}`);
  }
  if (legacy?.fcm_token) tokens.add(legacy.fcm_token);

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
 * Send one FCM message to every device of a technician. Returns the number
 * of successful deliveries and prunes tokens FCM reports as dead.
 * `buildMessage(token)` must return the full message object for that token.
 * Skips when Settings has push_notifications_enabled = false.
 */
async function sendToTechnicianDevices(db, messaging, technicianId, buildMessage) {
  try {
    const { data: techRow, error: techErr } = await db
      .from('technicians')
      .select('push_notifications_enabled')
      .eq('id', technicianId)
      .maybeSingle();
    // Missing column (migration not run) → treat as enabled.
    if (!techErr && techRow && techRow.push_notifications_enabled === false) {
      return { sent: 0, tokens: 0, skipped: true };
    }
  } catch (e) {
    console.warn('[fcm-helper] push_notifications_enabled check failed:', e?.message || e);
  }

  const tokens = await getTechnicianFcmTokens(db, technicianId);
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
  getMessaging,
  getTechnicianFcmTokens,
  pruneTechnicianFcmTokens,
  sendToTechnicianDevices,
  isStaleTokenError,
};
