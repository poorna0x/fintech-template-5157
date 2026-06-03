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
    return { ok: true };
  } catch (e) {
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
