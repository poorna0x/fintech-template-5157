// ALTCHA-gated job creation for public booking (service_role RPC only).
const {
  preflightOrReject,
  rateLimitBooking,
  verifyAltcha,
  getServiceClient,
  normalizePhoneDigits,
  isValidIndianMobile,
  jsonResponse,
  consumeLoginToken,
  getClientIdentifier,
} = require('./booking-guard');
const { sendBookingAdminNotification } = require('./booking-notify');
const { isOtpEnforced, verifyFirebasePhoneToken, warmFirebaseAdmin } = require('./otp-guard');

// Trigger the owner notification as a Netlify background function so the booking
// response returns immediately — the (slow) SMTP send no longer blocks the
// customer's confirmation. Netlify returns 202 the instant the background
// invocation is accepted, well before the email actually sends.
//
// Falls back to an inline send only on a fast, definitive failure (e.g. the
// background function isn't available / secret mismatch), so the owner is always
// notified without ever meaningfully delaying the customer.
async function triggerOwnerNotification(event, client, row, phoneNorm, job) {
  const base =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    (event.headers && event.headers.host ? `https://${event.headers.host}` : '');

  if (!base || typeof fetch !== 'function') {
    // No way to reach the background function — send inline as a fallback.
    await notifyOwnerOfBooking(client, row, phoneNorm, job);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.BOOKING_NOTIFY_SECRET) {
      headers['X-Notify-Secret'] = process.env.BOOKING_NOTIFY_SECRET;
    }
    const res = await fetch(`${base}/.netlify/functions/booking-notify-background`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ row, phoneNorm, job }),
      signal: controller.signal,
    });
    // 202 = background invocation accepted (normal, fast path). Any other 2xx
    // means it ran inline and already sent. A 4xx/5xx is a real failure.
    if (!res.ok && res.status !== 202) {
      throw new Error(`background notify HTTP ${res.status}`);
    }
  } catch (err) {
    // AbortError means we hit the 2s cap waiting for the 202. The request was
    // already sent, so the background work is in flight — do NOT inline-send
    // (that would double-notify and re-add the delay we just removed).
    if (err && err.name === 'AbortError') {
      console.warn('[booking-job-create] owner notify trigger slow; left to run in background');
    } else {
      console.error(
        '[booking-job-create] owner notify trigger failed, sending inline:',
        err && err.message
      );
      try {
        await notifyOwnerOfBooking(client, row, phoneNorm, job);
      } catch (inlineErr) {
        console.error(
          '[booking-job-create] inline notify fallback failed:',
          inlineErr && inlineErr.message
        );
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort internal "new booking" email to the business owner. Never allowed
// to throw or meaningfully delay the booking response.
async function notifyOwnerOfBooking(client, row, phoneNorm, job) {
  try {
    let customerName = '';
    const customerId =
      (job && (job.customer_id || job.customerId)) || row.customer_id || null;
    if (customerId) {
      try {
        const { data: cust } = await client.admin
          .from('customers')
          .select('full_name')
          .eq('id', customerId)
          .maybeSingle();
        customerName = (cust && cust.full_name) || '';
      } catch {
        // name is best-effort; fall through with empty
      }
    }

    const requirements = Array.isArray(row.requirements) ? row.requirements[0] : null;

    await sendBookingAdminNotification({
      customerName,
      phone: phoneNorm,
      brandSource: row.booking_source,
      bookingDomain: row.booking_domain,
      serviceType: row.service_type,
      serviceSubType: row.service_sub_type,
      scheduledDate: row.scheduled_date,
      scheduledTimeSlot: row.scheduled_time_slot,
      customTime: requirements ? requirements.custom_time : null,
      jobNumber: (job && (job.job_number || job.jobNumber)) || row.job_number,
    });
  } catch (err) {
    console.error('[booking-job-create] owner notification failed:', err && err.message);
  }
}

exports.handler = async (event) => {
  const pre = preflightOrReject(event);
  if (pre.handled) return pre.response;
  const corsHeaders = pre.corsHeaders;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  // Warmup ping (sent when the OTP is dispatched). Spins up the container and
  // preloads heavy deps (Supabase client + firebase-admin) so the real booking
  // hits a warm function. Does no DB/email work and exposes nothing.
  if (body && body.warmup === true) {
    try {
      getServiceClient();
    } catch {
      /* ignore */
    }
    warmFirebaseAdmin();
    return jsonResponse(200, corsHeaders, { warmed: true });
  }

  const phoneNorm = normalizePhoneDigits(body.phone);
  if (!isValidIndianMobile(phoneNorm)) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid phone number' });
  }

  const limited = rateLimitBooking(event, corsHeaders, phoneNorm, 'booking-job-create');
  if (limited) return limited;

  const altcha = verifyAltcha(body, corsHeaders);
  if (!altcha.ok) return altcha.response;

  const otpEnforced = isOtpEnforced();
  // Fail-open detector: the client completed OTP (sent a token) but the server
  // is not configured to verify it. This means anyone could skip OTP. Surfaces
  // in Netlify function logs so the misconfig is caught quickly.
  if (body.phoneToken && !otpEnforced) {
    console.warn(
      '[booking-job-create] SECURITY: received an OTP phone token but server ' +
        'enforcement is OFF. Set OTP_ENFORCED=true and FIREBASE_SERVICE_ACCOUNT_JSON ' +
        'on this site so the phone token is actually verified.'
    );
  }
  if (otpEnforced) {
    const phoneCheck = await verifyFirebasePhoneToken(body.phoneToken, phoneNorm);
    if (!phoneCheck.ok) {
      return jsonResponse(403, corsHeaders, {
        error: phoneCheck.error || 'Phone verification required',
      });
    }
  }

  const row = body.row;
  if (!row || typeof row !== 'object') {
    return jsonResponse(400, corsHeaders, { error: 'Missing job data' });
  }

  const client = getServiceClient();
  if (client.error) {
    return jsonResponse(500, corsHeaders, { error: client.error });
  }

  const { data, error } = await client.admin.rpc('create_job_for_booking', {
    p_phone: phoneNorm,
    p_row: row,
  });

  if (error) {
    console.error('[booking-job-create]', error.message, { ip: getClientIdentifier(event) });
    return jsonResponse(500, corsHeaders, { error: 'Could not create booking' });
  }

  if (body.consumeToken !== false && altcha.tokenCheck?.consumeKey) {
    consumeLoginToken(altcha.tokenCheck.consumeKey, altcha.tokenCheck.exp);
  }

  // Booking succeeded — notify the owner (HydrogenRO / ElevenRO) out-of-band so
  // the slow SMTP send never delays the customer's confirmation. Fully
  // fault-tolerant: any failure here can never break the booking.
  await triggerOwnerNotification(event, client, row, phoneNorm, data);

  return jsonResponse(200, corsHeaders, { data });
};
