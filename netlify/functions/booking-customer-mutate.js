// ALTCHA-gated create/update customer for public booking (service_role RPC only).
const {
  preflightOrReject,
  rateLimitBooking,
  verifyAltcha,
  getServiceClient,
  normalizePhoneDigits,
  isValidIndianMobile,
  jsonResponse,
  pickBookingCustomerUpdates,
  getClientIdentifier,
} = require('./booking-guard');
const { checkRateLimit } = require('./rate-limiter');

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

  const action = body.action;
  if (action !== 'create' && action !== 'update') {
    return jsonResponse(400, corsHeaders, { error: 'Invalid action' });
  }

  const phoneNorm = normalizePhoneDigits(body.phone);
  if (!isValidIndianMobile(phoneNorm)) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid phone number' });
  }

  const limited = rateLimitBooking(event, corsHeaders, phoneNorm, 'booking-customer-mutate');
  if (limited) return limited;

  if (action === 'create') {
    const createLimit = checkRateLimit(event, {
      maxRequests: 3,
      windowMs: 3_600_000,
      endpoint: 'booking-customer-create',
    });
    if (!createLimit.allowed) {
      return jsonResponse(429, corsHeaders, {
        error: 'Too many requests',
        message: 'Please wait before creating another booking.',
      });
    }
  }

  const altcha = verifyAltcha(body, corsHeaders);
  if (!altcha.ok) return altcha.response;

  const client = getServiceClient();
  if (client.error) {
    return jsonResponse(500, corsHeaders, { error: client.error });
  }

  const { admin } = client;

  if (action === 'create') {
    const row = body.row;
    if (!row || typeof row !== 'object') {
      return jsonResponse(400, corsHeaders, { error: 'Missing customer data' });
    }
    const pRow = { ...row, phone: row.phone || phoneNorm };
    const { data, error } = await admin.rpc('create_customer_for_booking', { p_row: pRow });
    if (error) {
      console.error('[booking-customer-mutate create]', error.message, {
        ip: getClientIdentifier(event),
      });
      return jsonResponse(500, corsHeaders, { error: 'Could not create customer record' });
    }
    return jsonResponse(200, corsHeaders, { data });
  }

  const customerId = body.customerId;
  if (!customerId || typeof customerId !== 'string') {
    return jsonResponse(400, corsHeaders, { error: 'Missing customer id' });
  }

  const updates = pickBookingCustomerUpdates(body.updates);
  const { data, error } = await admin.rpc('update_customer_for_booking', {
    p_customer_id: customerId,
    p_phone: phoneNorm,
    p_updates: updates,
  });

  if (error) {
    console.error('[booking-customer-mutate update]', error.message, {
      ip: getClientIdentifier(event),
    });
    const msg =
      error.message?.includes('not found') || error.message?.includes('mismatch')
        ? 'Customer not found or phone mismatch'
        : 'Could not update customer record';
    return jsonResponse(400, corsHeaders, { error: msg });
  }

  return jsonResponse(200, corsHeaders, { data });
};
