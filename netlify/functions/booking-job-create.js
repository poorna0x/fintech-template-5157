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
const { isOtpEnforced, verifyFirebasePhoneToken } = require('./otp-guard');

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

  // Booking succeeded — notify the owner (HydrogenRO / ElevenRO). Awaited so it
  // runs before the serverless function freezes, but fully fault-tolerant.
  await notifyOwnerOfBooking(client, row, phoneNorm, data);

  return jsonResponse(200, corsHeaders, { data });
};
