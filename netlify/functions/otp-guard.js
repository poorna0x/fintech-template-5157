// Firebase Phone Auth verification for public booking / warranty lookup.
//
// Client: Firebase SDK sends SMS + verifies OTP, then passes a Firebase ID token.
// Server: firebase-admin verifies the token and checks phone matches the booking.
//
// Service account (first match):
//   FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT env
//   app_secrets.firebase_service_account (same key FCM already uses)
//
// OTP_ENFORCED=true → require a matching Firebase phone token.
// Production: if OTP_ENFORCED is on but Admin cannot init, callers must 503
// (fail closed) instead of creating the booking / returning warranty PII.
//
// Client env (VITE_*): see src/lib/firebase.ts and .env.example
const { createClient } = require('@supabase/supabase-js');

let adminApp = null;
let saJsonPromise = null;
let warnedPartialConfig = false;

function envServiceAccountJson() {
  return (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    ''
  ).trim();
}

async function loadServiceAccountJson() {
  if (!saJsonPromise) {
    saJsonPromise = (async () => {
      const envJson = envServiceAccountJson();
      if (envJson.length > 10) return envJson;

      const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
      const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      if (!url || !serviceKey) return '';

      const db = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await db
        .from('app_secrets')
        .select('value')
        .eq('key', 'firebase_service_account')
        .maybeSingle();
      if (error || !data?.value) return '';
      return String(data.value).trim();
    })();
    saJsonPromise = saJsonPromise.catch((err) => {
      saJsonPromise = null;
      throw err;
    });
  }
  try {
    return await saJsonPromise;
  } catch (err) {
    console.warn('[otp-guard] service account load failed', err?.message || err);
    return '';
  }
}

function isFirebaseAdminConfigured() {
  return envServiceAccountJson().length > 10;
}

/** True when OTP_ENFORCED=true and a Firebase service account is available. */
async function isOtpEnforced() {
  const wantEnforce = process.env.OTP_ENFORCED === 'true';
  if (!wantEnforce) return false;
  const raw = await loadServiceAccountJson();
  const adminReady = raw.length > 10;
  if (!adminReady && !warnedPartialConfig) {
    warnedPartialConfig = true;
    console.warn(
      '[otp-guard] OTP_ENFORCED=true but Firebase service account missing ' +
        '(env FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT or ' +
        'app_secrets.firebase_service_account). Callers should fail closed in production.'
    );
  }
  return adminReady;
}

async function getFirebaseAdmin() {
  if (adminApp) return adminApp;
  const raw = await loadServiceAccountJson();
  if (raw.length <= 10) return null;
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    console.error('[otp-guard] Firebase service account is not valid JSON');
    return null;
  }
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  adminApp = admin;
  return adminApp;
}

/** +919876543210 or 919876543210 -> 9876543210 */
function phoneNormFromE164(phoneE164) {
  const digits = String(phoneE164 || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 10) return digits;
  return '';
}

/**
 * Verify a Firebase ID token from Phone Auth and ensure it matches the booking phone.
 * @param {string} idToken - Firebase ID token from user.getIdToken() after OTP confirm
 * @param {string} phoneNorm - 10-digit Indian mobile
 */
async function verifyFirebasePhoneToken(idToken, phoneNorm) {
  const admin = await getFirebaseAdmin();
  if (!admin) {
    return { ok: false, error: 'Phone verification not configured' };
  }
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, error: 'Missing phone verification' };
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const tokenPhone = phoneNormFromE164(decoded.phone_number);
    if (!tokenPhone || tokenPhone !== phoneNorm) {
      return { ok: false, error: 'Phone verification does not match' };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[otp-guard] verifyIdToken failed', err && err.code);
    return { ok: false, error: 'Invalid or expired phone verification' };
  }
}

/**
 * Eagerly load + initialize firebase-admin so the (heavy) module and credential
 * parsing happen during a warmup ping rather than on the first real booking.
 * Best-effort: never throws.
 */
function warmFirebaseAdmin() {
  void getFirebaseAdmin().catch(() => {});
}

module.exports = {
  isOtpEnforced,
  isFirebaseAdminConfigured,
  verifyFirebasePhoneToken,
  warmFirebaseAdmin,
};
