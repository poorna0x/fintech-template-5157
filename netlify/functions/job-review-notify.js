/**
 * Public: after a customer submits /review/{token}, push admins (HRO Admin app).
 * Auth is the review token itself (must be submitted in the last 2 minutes).
 */
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');
const {
  getMessaging,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  sendToTechnicianDevices,
  isStaleTokenError,
} = require('./fcm-helper');
const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');

const COLOR = '#D97706';

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const origin = event.headers.origin || event.headers.Origin;
  if (origin && !isOriginAllowed(origin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const token = String(body.token || '').trim();
  if (!token || token.length < 12 || token.length > 48) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token required' }) };
  }

  if (typeof isRateLimitEnabled === 'function' ? isRateLimitEnabled() : Boolean(process.env.CONTEXT && process.env.CONTEXT !== 'dev')) {
    const ipLimit = checkRateLimit(event, {
      maxRequests: 20,
      windowMs: 60_000,
      endpoint: 'job-review-notify-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: { ...headers, ...base.headers } };
    }
    const tokenLimit = checkRateLimitForKey(`notify:${token}`, {
      maxRequests: 3,
      windowMs: 15 * 60_000,
      endpoint: 'job-review-notify-token',
    });
    if (!tokenLimit.allowed) {
      const base = rateLimitResponseForKey(tokenLimit);
      return { ...base, headers: { ...headers, ...base.headers } };
    }
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: review, error: reviewErr } = await db
    .from('job_reviews')
    .select('id, rating, comment, brand, status, submitted_at, notified_at, technician_id, job_id')
    .eq('token', token)
    .maybeSingle();

  if (reviewErr || !review) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0 }) };
  }
  if (review.status !== 'submitted' || !review.submitted_at) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'not_submitted' }) };
  }
  if (review.notified_at) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'already_notified' }) };
  }
  const ageMs = Date.now() - new Date(review.submitted_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 2 * 60 * 1000) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'stale' }) };
  }

  const { data: claimed } = await db
    .from('job_reviews')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', review.id)
    .is('notified_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'already_notified' }) };
  }

  let techName = 'Technician';
  if (review.technician_id) {
    const { data: tech } = await db
      .from('technicians')
      .select('full_name')
      .eq('id', review.technician_id)
      .maybeSingle();
    if (tech?.full_name) techName = String(tech.full_name).trim();
  }

  const stars = Number(review.rating) || 0;
  const starText = stars > 0 ? `${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))} ${stars}/5` : 'Review';
  const comment = String(review.comment || '').trim();
  const title = `New review · ${techName}`;
  const message = comment ? `${starText}\n${comment.slice(0, 120)}` : starText;

  let adminSent = 0;
  let technicianSent = 0;
  let failed = 0;

  try {
    const messaging = await getMessaging(db);
    const tokens = [...new Set(await getAdminFcmTokens(db, 'job_status'))];
    if (tokens.length > 0) {
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body: message },
        data: {
          type: 'job_review',
          kind: 'settings',
          panel: 'job-reviews',
          event: 'job_review',
          jobId: String(review.job_id || ''),
          reviewId: String(review.id || ''),
          color: COLOR,
          tag: `job_review_${review.id}`,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'job_alerts_v2',
            defaultSound: true,
            color: COLOR,
            tag: `job_review_${review.id}`,
          },
        },
      });
      const stale = [];
      res.responses.forEach((r, i) => {
        if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
      });
      if (stale.length) await pruneAdminFcmTokens(db, stale);
      adminSent = res.successCount || 0;
      failed += res.failureCount || 0;
    }

    if (review.technician_id) {
      const techTitle = 'You received a new review';
      const techResult = await sendToTechnicianDevices(
        db,
        messaging,
        review.technician_id,
        () => ({
          notification: { title: techTitle, body: message },
          data: {
            type: 'job_review',
            kind: 'technician_reviews',
            event: 'job_review',
            jobId: String(review.job_id || ''),
            reviewId: String(review.id || ''),
            color: COLOR,
            tag: `job_review_${review.id}`,
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'job_alerts_v2',
              defaultSound: true,
              color: COLOR,
              tag: `job_review_${review.id}`,
            },
          },
        }),
        'job_reviews'
      );
      technicianSent = techResult.sent || 0;
    }
  } catch (err) {
    console.warn('[job-review-notify] push soft-fail', err?.message || err);
  }

  if (review.technician_id) {
    await maybeSendTechnicianPushWhatsApp(db, {
      technicianId: review.technician_id,
      category: 'job_reviews',
      title: 'You received a new review',
      body: message,
    });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      sent: adminSent + technicianSent,
      adminSent,
      technicianSent,
      failed,
    }),
  };
};
