// Background function: sends the internal "new booking" owner notification email
// WITHOUT blocking the customer's booking response.
//
// Netlify runs functions whose name ends in `-background` asynchronously: the
// invoking request receives a 202 almost immediately and this handler keeps
// running afterwards (up to 15 min). That lets the customer see their booking
// confirmation instantly while the (slow) SMTP send happens out-of-band.
//
// Triggered only from `booking-job-create.js` after the booking RPC succeeds, so
// it still cannot run without a real, confirmed booking.
//
// Security:
//   - The recipient is FIXED server-side (BOOKING_NOTIFY_EMAIL / default), so it
//     can never be used to send mail to an attacker-chosen address.
//   - When BOOKING_NOTIFY_SECRET is set, a matching `X-Notify-Secret` header is
//     required, so the endpoint cannot be hit directly to spam the owner inbox.
const { getServiceClient } = require('./booking-guard');
const { sendBookingAdminNotification } = require('./booking-notify');

async function lookupCustomerName(client, customerId) {
  if (!customerId) return '';
  try {
    const { data } = await client.admin
      .from('customers')
      .select('full_name')
      .eq('id', customerId)
      .maybeSingle();
    return (data && data.full_name) || '';
  } catch {
    return '';
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const requiredSecret = process.env.BOOKING_NOTIFY_SECRET;
  if (requiredSecret) {
    const provided =
      event.headers['x-notify-secret'] || event.headers['X-Notify-Secret'];
    if (provided !== requiredSecret) {
      return { statusCode: 403, body: 'Forbidden' };
    }
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const row = body.row;
  const phoneNorm = body.phoneNorm;
  const job = body.job || null;
  if (!row || typeof row !== 'object') {
    return { statusCode: 400, body: 'Missing booking data' };
  }

  try {
    const client = getServiceClient();
    const customerId =
      (job && (job.customer_id || job.customerId)) || row.customer_id || null;
    const customerName = client.error
      ? ''
      : await lookupCustomerName(client, customerId);

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
    console.error('[booking-notify-background] failed:', err && err.message);
  }

  return { statusCode: 202, body: '' };
};
