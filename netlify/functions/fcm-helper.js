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

/** Fetch the technician's FCM device token (null when app not installed / no token). */
async function getTechnicianFcmToken(db, technicianId) {
  const { data, error } = await db
    .from('technician_live_locations')
    .select('fcm_token')
    .eq('technician_id', technicianId)
    .maybeSingle();
  if (error) throw new Error(`token lookup failed: ${error.message}`);
  return data?.fcm_token || null;
}

/** Clear a stale token so we stop sending to it. */
async function clearTechnicianFcmToken(db, technicianId) {
  await db
    .from('technician_live_locations')
    .update({ fcm_token: null })
    .eq('technician_id', technicianId);
}

function isStaleTokenError(err) {
  const code = err?.errorInfo?.code || err?.code || '';
  return String(code).includes('registration-token-not-registered');
}

module.exports = { getMessaging, getTechnicianFcmToken, clearTechnicianFcmToken, isStaleTokenError };
