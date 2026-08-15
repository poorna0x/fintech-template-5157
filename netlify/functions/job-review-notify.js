/**
 * Public: after a customer submits /review/{token}, push admins (HRO Admin app).
 * Auth is the review token itself (must be submitted in the last 2 minutes).
 */
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const {
  getMessaging,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  isStaleTokenError,
} = require('./fcm-helper');

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
  if (shouldRejectMissingOrigin(event)) {
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
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) };
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

  try {
    const tokens = [...new Set(await getAdminFcmTokens(db, 'job_status'))];
    if (tokens.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
    }
    const messaging = await getMessaging(db);
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
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent: res.successCount || 0, failed: res.failureCount || 0 }),
    };
  } catch (err) {
    console.warn('[job-review-notify] soft-fail', err?.message || err);
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'error' }) };
  }
};
