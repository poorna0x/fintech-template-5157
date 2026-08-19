/**
 * Shared helpers for public PDF authenticity OTP + short-lived session tokens.
 * Secrets: env PDF_AUTH_SESSION_SECRET or app_secrets.pdf_auth_session_secret
 * Never log plaintext OTP.
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SEC = 20 * 60;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_SECRET_KEY = 'pdf_auth_session_secret';

const DOC_TYPE_LABELS = {
  service_bill: 'Service bill',
  quotation: 'Quotation',
  invoice: 'Tax invoice',
  warranty: 'Warranty card',
  amc: 'AMC agreement',
  salary_slip: 'Salary slip',
  letterhead: 'Letterhead document',
};

function getServiceSupabase() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readAppSecret(db, key) {
  if (!db) return '';
  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error || !data?.value) return '';
  return String(data.value).trim();
}

async function getSessionSecret(db = getServiceSupabase()) {
  let secret = (process.env.PDF_AUTH_SESSION_SECRET || '').trim();
  if (!secret && db) {
    secret = await readAppSecret(db, SESSION_SECRET_KEY);
  }
  return secret;
}

function normalizePhoneE164(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function generateOtpDigits() {
  // 100000–999999
  const n = crypto.randomInt(100000, 1000000);
  return String(n);
}

function hashOtp(phoneE164, otp, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${phoneE164}:${otp}`)
    .digest('hex');
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJson(obj) {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function issueSessionToken(phoneE164, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    phone: phoneE164,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  };
  const body = b64urlJson(payload);
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret) return { ok: false, error: 'Invalid session' };
  const parts = String(token).split('.');
  if (parts.length !== 2) return { ok: false, error: 'Invalid session' };
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid session' };
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return { ok: false, error: 'Invalid session' };
  }
  if (!payload || payload.v !== 1 || !payload.phone || !payload.exp) {
    return { ok: false, error: 'Invalid session' };
  }
  if (Math.floor(Date.now() / 1000) > Number(payload.exp)) {
    return { ok: false, error: 'Session expired' };
  }
  const phone = normalizePhoneE164(payload.phone);
  if (!phone) return { ok: false, error: 'Invalid session' };
  return { ok: true, phone };
}

function isValidSha256Hex(hex) {
  return typeof hex === 'string' && /^[a-f0-9]{64}$/i.test(hex.trim());
}

function publicHitFromDocumentRow(row) {
  return {
    authentic: true,
    documentType: DOC_TYPE_LABELS[row.doc_type] || String(row.doc_type || 'Document'),
    documentRef: row.document_ref || null,
    generatedOn: row.generated_on || null,
    verifyCode: row.verify_code || null,
  };
}

function publicHitFromAmcRow(row) {
  return {
    authentic: true,
    documentType: 'AMC agreement',
    documentRef: row.agreement_number || null,
    generatedOn: row.generated_on || null,
    verifyCode: row.verify_code || null,
  };
}

async function lookupAuthenticityBySha256(db, sha256Hex) {
  const hex = String(sha256Hex || '').trim().toLowerCase();
  if (!isValidSha256Hex(hex)) return { authentic: false };

  const { data: doc, error: docErr } = await db
    .from('document_pdf_authenticity')
    .select('doc_type, document_ref, generated_on, verify_code')
    .eq('sha256_hex', hex)
    .maybeSingle();
  if (docErr) throw docErr;
  if (doc) return publicHitFromDocumentRow(doc);

  const { data: amc, error: amcErr } = await db
    .from('amc_pdf_authenticity')
    .select('agreement_number, generated_on, verify_code')
    .eq('sha256_hex', hex)
    .maybeSingle();
  if (amcErr) throw amcErr;
  if (amc) return publicHitFromAmcRow(amc);

  return { authentic: false };
}

async function lookupAuthenticityByVerifyCode(db, code) {
  const verifyCode = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(verifyCode)) return { authentic: false };

  const { data: doc, error: docErr } = await db
    .from('document_pdf_authenticity')
    .select('doc_type, document_ref, generated_on, verify_code')
    .eq('verify_code', verifyCode)
    .maybeSingle();
  if (docErr) throw docErr;
  if (doc) return publicHitFromDocumentRow(doc);

  const { data: amc, error: amcErr } = await db
    .from('amc_pdf_authenticity')
    .select('agreement_number, generated_on, verify_code')
    .eq('verify_code', verifyCode)
    .maybeSingle();
  if (amcErr) throw amcErr;
  if (amc) return publicHitFromAmcRow(amc);

  return { authentic: false };
}

module.exports = {
  OTP_TTL_MS,
  SESSION_TTL_SEC,
  MAX_OTP_ATTEMPTS,
  SESSION_SECRET_KEY,
  getServiceSupabase,
  getSessionSecret,
  normalizePhoneE164,
  generateOtpDigits,
  hashOtp,
  timingSafeEqualHex,
  issueSessionToken,
  verifySessionToken,
  isValidSha256Hex,
  lookupAuthenticityBySha256,
  lookupAuthenticityByVerifyCode,
};
