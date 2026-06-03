import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type RecaptchaVerifier as RecaptchaVerifierType,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';

/** Show OTP step only when enabled and Firebase web config is present. */
export const OTP_ENABLED =
  import.meta.env.VITE_OTP_ENABLED === 'true' && isFirebaseConfigured();

export const FIREBASE_RECAPTCHA_CONTAINER_ID = 'booking-firebase-recaptcha';

export interface OtpSendResult {
  ok: boolean;
  unavailable?: boolean;
  error?: string;
}

export interface OtpVerifyResult {
  verified: boolean;
  /** Firebase ID token — server verifies via firebase-admin on booking-job-create. */
  phoneToken?: string;
  unavailable?: boolean;
  error?: string;
}

let confirmationResult: ConfirmationResult | null = null;
let recaptchaVerifier: RecaptchaVerifierType | null = null;
// The actual element grecaptcha rendered into. We render into a fresh child
// each time so a remounted/cleared container never collides with a stale widget.
let recaptchaWidgetEl: HTMLElement | null = null;

function toE164Indian(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  return `+91${ten}`;
}

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// --- Client-side OTP send rate limiting -------------------------------------
// Reduces accidental/abusive SMS sends (and cost). Firebase enforces its own
// per-phone/per-IP quotas server-side; this is a friendly first line of defense.
const OTP_MIN_GAP_MS = 60_000; // 1 minute between sends
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_PER_DAY = 10;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function otpStoreKey(phone: string): string {
  return `otp_sends_${phoneKey(phone)}`;
}

function readOtpSends(phone: string): number[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(otpStoreKey(phone));
    const arr = raw ? (JSON.parse(raw) as number[]) : [];
    const cutoff = Date.now() - DAY_MS;
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'number' && t > cutoff) : [];
  } catch {
    return [];
  }
}

function writeOtpSends(phone: string, times: number[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(otpStoreKey(phone), JSON.stringify(times));
  } catch {
    /* ignore quota/availability errors */
  }
}

export interface OtpRateCheck {
  allowed: boolean;
  waitMs?: number;
  reason?: string;
}

/** Check whether another OTP can be sent to this phone right now. */
export function checkOtpRateLimit(phone: string): OtpRateCheck {
  const now = Date.now();
  const sends = readOtpSends(phone);
  const last = sends.length ? Math.max(...sends) : 0;

  if (last && now - last < OTP_MIN_GAP_MS) {
    return {
      allowed: false,
      waitMs: OTP_MIN_GAP_MS - (now - last),
      reason: 'Please wait a moment before requesting another code.',
    };
  }
  const inHour = sends.filter((t) => now - t < HOUR_MS);
  if (inHour.length >= OTP_MAX_PER_HOUR) {
    const oldest = Math.min(...inHour);
    return {
      allowed: false,
      waitMs: HOUR_MS - (now - oldest),
      reason: 'Too many code requests. Please try again later.',
    };
  }
  if (sends.length >= OTP_MAX_PER_DAY) {
    const oldest = Math.min(...sends);
    return {
      allowed: false,
      waitMs: DAY_MS - (now - oldest),
      reason: 'Daily verification limit reached. Please try again tomorrow.',
    };
  }
  return { allowed: true };
}

function recordOtpSend(phone: string): void {
  const sends = readOtpSends(phone);
  sends.push(Date.now());
  writeOtpSends(phone, sends);
}

function mapFirebaseError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : '';
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Invalid phone number.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/invalid-verification-code':
      return 'Incorrect or expired code.';
    case 'auth/code-expired':
      return 'Code expired. Please request a new one.';
    case 'auth/captcha-check-failed':
      return 'Security check failed. Refresh the page and try again.';
    case 'auth/quota-exceeded':
      return 'SMS limit reached. Please try again later.';
    case 'auth/internal-error':
      return [
        'Firebase internal error (usually config). Check:',
        '1) This domain is in Firebase → Auth → Authorized domains',
        '2) Google Cloud → Browser API key allows this site in HTTP referrers',
        '3) Netlify VITE_FIREBASE_* set + redeploy after adding',
        '4) SMS region India (IN) enabled',
      ].join(' ');
    case 'auth/invalid-app-credential':
      // Firebase blocks real SMS on localhost; test numbers still work.
      if (
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ) {
        return window.location.hostname === 'localhost'
          ? 'Real SMS does not work on localhost. Open this site at 127.0.0.1 (same port), add 127.0.0.1 under Firebase → Authentication → Settings → Authorized domains, or use a Firebase test number.'
          : 'Real SMS verification failed. Add 127.0.0.1 under Firebase → Authentication → Settings → Authorized domains, or use a Firebase test number for local dev.';
      }
      return 'Phone verification failed. Please refresh and try again.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }
}

async function getRecaptchaVerifier(containerId: string): Promise<RecaptchaVerifierType> {
  // Reuse the verifier only if its rendered element is still in the DOM. After a
  // React remount (e.g. step navigation) the old element is detached, so we must
  // build a fresh one — re-rendering into a live element throws "already rendered".
  if (recaptchaVerifier && recaptchaWidgetEl && recaptchaWidgetEl.isConnected) {
    return recaptchaVerifier;
  }
  resetBookingOtpSession();

  const auth = getFirebaseAuth();
  const wrapper =
    typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (!wrapper) {
    throw new Error('Verification widget is not ready. Please reopen this step.');
  }
  // Render into a brand-new child element that grecaptcha has never seen.
  const el = document.createElement('div');
  wrapper.appendChild(el);
  recaptchaWidgetEl = el;
  recaptchaVerifier = new RecaptchaVerifier(auth, el, { size: 'invisible' });
  await recaptchaVerifier.render();
  return recaptchaVerifier;
}

/**
 * Warm up Firebase + the invisible reCAPTCHA ahead of time so the first
 * "send code" tap isn't slowed by SDK init + widget render. Safe to call
 * repeatedly; no-op if already rendered or not configured.
 */
export async function prewarmBookingOtp(
  recaptchaContainerId = FIREBASE_RECAPTCHA_CONTAINER_ID
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    getFirebaseAuth();
    await getRecaptchaVerifier(recaptchaContainerId);
  } catch {
    // Best-effort; sendBookingOtp will retry/render on demand.
  }
}

/** Send SMS OTP via Firebase (Google handles delivery; no DLT). */
export async function sendBookingOtp(
  phone: string,
  recaptchaContainerId = FIREBASE_RECAPTCHA_CONTAINER_ID
): Promise<OtpSendResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, unavailable: true, error: 'Phone verification is not configured.' };
  }
  try {
    const auth = getFirebaseAuth();
    const verifier = await getRecaptchaVerifier(recaptchaContainerId);
    confirmationResult = await signInWithPhoneNumber(auth, toE164Indian(phone), verifier);
    recordOtpSend(phone);
    return { ok: true };
  } catch (e) {
    console.error('[otp] sendBookingOtp failed', e);
    confirmationResult = null;
    // A failed/expired verifier can't be reused — drop it so the next attempt
    // renders a fresh one.
    resetBookingOtpSession();
    return { ok: false, error: mapFirebaseError(e) };
  }
}

/** Confirm the SMS code; returns Firebase ID token for the booking API. */
export async function verifyBookingOtp(otp: string): Promise<OtpVerifyResult> {
  if (!isFirebaseConfigured()) {
    return { verified: false, unavailable: true, error: 'Phone verification is not configured.' };
  }
  if (!confirmationResult) {
    return { verified: false, error: 'Please request a code first.' };
  }
  const code = otp.replace(/\D/g, '');
  if (code.length < 4) {
    return { verified: false, error: 'Enter the code you received.' };
  }
  try {
    const cred = await confirmationResult.confirm(code);
    const phoneToken = await cred.user.getIdToken();
    const auth = getFirebaseAuth();
    await signOut(auth);
    confirmationResult = null;
    return { verified: true, phoneToken };
  } catch (e) {
    return { verified: false, error: mapFirebaseError(e) };
  }
}

/** Reset in-memory OTP session (phone change, form reset). */
export function resetBookingOtpSession(): void {
  confirmationResult = null;
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      /* ignore */
    }
    recaptchaVerifier = null;
  }
  if (recaptchaWidgetEl) {
    try {
      recaptchaWidgetEl.remove();
    } catch {
      /* ignore */
    }
    recaptchaWidgetEl = null;
  }
}
