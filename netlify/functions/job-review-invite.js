/**
 * Mint / reuse a job_reviews token (admin or the technician on that job).
 * Uses service role so auto Cloud API completion can attach Review us even when
 * the browser RPC is blocked.
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { isRateLimitEnabled, checkRateLimit, rateLimitResponseForKey } = require('./rate-limiter');

function newReviewToken() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function tokenIsTidy(token) {
  const t = String(token || '');
  return t.length >= 12 && t.length <= 16;
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (shouldRejectMissingOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }
  if (typeof isRateLimitEnabled === 'function' && isRateLimitEnabled()) {
    const ipLimit = checkRateLimit(event, {
      maxRequests: 60,
      windowMs: 60_000,
      endpoint: 'job-review-invite-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: { ...headers, ...base.headers } };
    }
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const staff = await verifyStaffBearerToken(readBearerToken(event));
  if (!staff.ok || !staff.userId) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const jobId = String(body.jobId || '').trim();
  const technicianId = uuidRe.test(String(body.technicianId || '').trim())
    ? String(body.technicianId).trim()
    : null;
  if (!uuidRe.test(jobId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'job required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select('id, assigned_technician_id, completed_by, customer_id, service_brand')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'job not found' }) };
  }

  const onJob =
    job.assigned_technician_id === staff.userId || job.completed_by === staff.userId;
  if (staff.role !== 'admin' && !onJob) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'job not found' }) };
  }

  const techArg =
    staff.role === 'admin'
      ? [technicianId, job.completed_by, job.assigned_technician_id].find((id) =>
          uuidRe.test(String(id || ''))
        ) || null
      : staff.userId;
  const requestedBrand = String(body.brand || '')
    .trim()
    .toLowerCase();
  const brand =
    requestedBrand === 'elevenro' || requestedBrand === 'hydrogenro'
      ? requestedBrand
      : String(job.service_brand || '')
            .trim()
            .toLowerCase() === 'elevenro'
        ? 'elevenro'
        : 'hydrogenro';

  const { data: existing, error: existingErr } = await db
    .from('job_reviews')
    .select('id, token, status, expires_at')
    .eq('job_id', jobId)
    .maybeSingle();

  if (existingErr) {
    console.warn('[job-review-invite] lookup', existingErr.message);
  }

  if (existing?.status === 'submitted') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        already_submitted: true,
        id: existing.id,
        brand,
      }),
    };
  }

  if (existing?.token && tokenIsTidy(existing.token)) {
    const expiresAt = existing.expires_at ? new Date(existing.expires_at).getTime() : 0;
    if (expiresAt > Date.now()) {
      await db
        .from('job_reviews')
        .update({
          technician_id: techArg,
          customer_id: job.customer_id,
          brand,
        })
        .eq('id', existing.id);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          reused: true,
          id: existing.id,
          token: existing.token,
          brand,
        }),
      };
    }
  }

  const token = newReviewToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  if (existing?.id) {
    const { data: updated, error: updErr } = await db
      .from('job_reviews')
      .update({
        token,
        technician_id: techArg,
        customer_id: job.customer_id,
        brand,
        status: 'pending',
        rating: null,
        comment: '',
        submitted_at: null,
        notified_at: null,
        expires_at: expiresAt,
      })
      .eq('id', existing.id)
      .select('id, token, brand')
      .maybeSingle();
    if (updErr || !updated?.token) {
      console.warn('[job-review-invite] update', updErr?.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'update failed' }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, id: updated.id, token: updated.token, brand: updated.brand || brand }),
    };
  }

  const { data: inserted, error: insErr } = await db
    .from('job_reviews')
    .insert({
      token,
      job_id: jobId,
      customer_id: job.customer_id,
      technician_id: techArg,
      brand,
      expires_at: expiresAt,
    })
    .select('id, token, brand')
    .maybeSingle();

  if (insErr || !inserted?.token) {
    console.warn('[job-review-invite] insert', insErr?.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'insert failed' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      id: inserted.id,
      token: inserted.token,
      brand: inserted.brand || brand,
    }),
  };
};
