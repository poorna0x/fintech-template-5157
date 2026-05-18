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

  return jsonResponse(200, corsHeaders, { data });
};
