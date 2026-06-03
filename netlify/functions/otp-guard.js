// Firebase Phone Auth verification for public booking.
//
// Client: Firebase SDK sends SMS + verifies OTP, then passes a Firebase ID token.
// Server: firebase-admin verifies the token and checks phone matches the booking.
//
// Rollout is opt-in and fail-safe:
//   - FIREBASE_SERVICE_ACCOUNT_JSON not set -> enforcement off.
//   - OTP_ENFORCED !== 'true' -> booking-job-create does not require a token.
//
// Required env (server-side only, NEVER VITE_*):
//   FIREBASE_SERVICE_ACCOUNT_JSON - full service account JSON (one line in Netlify)
// Optional:
//   OTP_ENFORCED - 'true' to require verified Firebase token on booking-job-create
//
// Client env (VITE_*): see src/lib/firebase.ts and .env.example
let adminApp = null;

function isFirebaseAdminConfigured() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  return raw.length > 10;
}

let warnedPartialConfig = false;

/** True only when explicitly turned on AND Firebase Admin is configured. */
function isOtpEnforced() {
  const wantEnforce = process.env.OTP_ENFORCED === 'true';
  const adminReady = isFirebaseAdminConfigured();
  // Warn once per cold start if intent and config disagree (fail-open).
  if (!warnedPartialConfig && wantEnforce && !adminReady) {
    warnedPartialConfig = true;
    console.warn(
      '[otp-guard] OTP_ENFORCED=true but FIREBASE_SERVICE_ACCOUNT_JSON is missing/invalid. ' +
        'OTP is NOT being enforced. Add the service account JSON to enable verification.'
    );
  }
  return wantEnforce && adminReady;
}

function getFirebaseAdmin() {
  if (adminApp) return adminApp;
  if (!isFirebaseAdminConfigured()) return null;
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    console.error('[otp-guard] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
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
  const admin = getFirebaseAdmin();
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

module.exports = {
  isOtpEnforced,
  isFirebaseAdminConfigured,
  verifyFirebasePhoneToken,
};
