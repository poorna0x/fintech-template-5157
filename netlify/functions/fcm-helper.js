// Shared Firebase Cloud Messaging bootstrap for Netlify functions.
// Per-device push category filtering lives in push-prefs-helper.js.

const {
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
} = require('./push-prefs-helper');

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
    messagingPromise.catch(() => {
      messagingPromise = null;
    });
  }
  return messagingPromise;
}

module.exports = {
  getMessaging,
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
