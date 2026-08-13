/**
 * Client helpers for public /authenticity (OTP session + hash check via Netlify).
 * Hashing stays in-browser; APIs never receive the PDF bytes.
 */

const SESSION_KEY = 'pdf_auth_session_v1';
export const PDF_AUTH_MAX_BYTES = 20 * 1024 * 1024;

export type PublicAuthCheckResult =
  | {
      authentic: true;
      documentType: string;
      documentRef: string | null;
      generatedOn: string | null;
      verifyCode: string | null;
    }
  | { authentic: false };

export type StoredAuthSession = {
  sessionToken: string;
  expiresAt: number;
  phone: string;
};

/** Cloud API business line (VERIFY must hit this number). Override via env. */
export function getAuthenticityWhatsAppE164(): string {
  const fromEnv = (import.meta.env.VITE_WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '');
  if (fromEnv.length >= 10) {
    return fromEnv.length === 10 ? `91${fromEnv}` : fromEnv;
  }
  // Default: production Cloud API display number (shared HRO/ERO WABA line).
  return '918792467611';
}

export function formatWaDisplay(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  return `+${d}`;
}

export function buildVerifyWhatsAppUrl(e164 = getAuthenticityWhatsAppE164()): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent('VERIFY')}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function normalizeVerifyCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sha256HexFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexFromFile(file: File): Promise<string> {
  return sha256HexFromBytes(await file.arrayBuffer());
}

export async function validatePdfFileForAuthenticity(
  file: File
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!file || file.size <= 0) {
    return { ok: false, message: 'File is empty.' };
  }
  if (file.size > PDF_AUTH_MAX_BYTES) {
    return {
      ok: false,
      message: `PDF is too large (max ${Math.round(PDF_AUTH_MAX_BYTES / (1024 * 1024))} MB).`,
    };
  }
  const nameOk = file.name.toLowerCase().endsWith('.pdf');
  const typeOk = !file.type || file.type === 'application/pdf' || file.type === 'application/x-pdf';
  if (!nameOk && !typeOk) {
    return { ok: false, message: 'Please upload a PDF file.' };
  }

  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isPdf =
      head.length >= 4 &&
      head[0] === 0x25 &&
      head[1] === 0x50 &&
      head[2] === 0x44 &&
      head[3] === 0x46;
    if (!isPdf) {
      return { ok: false, message: 'File does not look like a PDF (missing %PDF header).' };
    }
  } catch {
    return { ok: false, message: 'Could not read the file.' };
  }

  return { ok: true };
}

export function loadAuthSession(): StoredAuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (!parsed?.sessionToken || !parsed.expiresAt) return null;
    if (Date.now() > parsed.expiresAt - 15_000) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: StoredAuthSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function verifyAuthenticityOtp(params: {
  phone: string;
  otp: string;
  altchaLoginToken?: string;
  altchaPayload?: string;
}): Promise<{ ok: true; session: StoredAuthSession } | { ok: false; error: string }> {
  try {
    const res = await fetch('/.netlify/functions/pdf-authenticity-otp-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: params.phone,
        otp: params.otp,
        altchaLoginToken: params.altchaLoginToken,
        altchaPayload: params.altchaPayload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Invalid or expired code' };
    }
    const expiresInSec = Number(data.expiresInSec) || 20 * 60;
    const session: StoredAuthSession = {
      sessionToken: data.sessionToken,
      expiresAt: Date.now() + expiresInSec * 1000,
      phone: params.phone.replace(/\D/g, '').slice(-10),
    };
    saveAuthSession(session);
    return { ok: true, session };
  } catch {
    return { ok: false, error: 'Could not verify code. Try again.' };
  }
}

export async function checkPdfAuthenticity(params: {
  sessionToken: string;
  sha256Hex?: string;
  verifyCode?: string;
}): Promise<PublicAuthCheckResult | { error: string }> {
  try {
    const res = await fetch('/.netlify/functions/pdf-authenticity-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: params.sessionToken,
        sha256Hex: params.sha256Hex,
        verifyCode: params.verifyCode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearAuthSession();
      return { error: data.error || 'Session expired. Unlock again.' };
    }
    if (!res.ok) {
      return { error: data.error || 'Check failed' };
    }
    if (data.authentic === true) {
      return {
        authentic: true,
        documentType: data.documentType || 'Document',
        documentRef: data.documentRef ?? null,
        generatedOn: data.generatedOn ?? null,
        verifyCode: data.verifyCode ?? null,
      };
    }
    return { authentic: false };
  } catch {
    return { error: 'Could not reach verification service.' };
  }
}

export async function hashAndCheckPdfFile(
  file: File,
  sessionToken: string
): Promise<
  | { ok: true; result: PublicAuthCheckResult; sha256Hex: string }
  | { ok: false; error: string }
> {
  const valid = await validatePdfFileForAuthenticity(file);
  if (!valid.ok) return { ok: false, error: valid.message };

  const sha256Hex = await sha256HexFromFile(file);
  const result = await checkPdfAuthenticity({ sessionToken, sha256Hex });
  if ('error' in result) return { ok: false, error: result.error };
  return { ok: true, result, sha256Hex };
}
