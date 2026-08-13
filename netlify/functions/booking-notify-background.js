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
const { getMessaging, getAdminFcmTokens, pruneAdminFcmTokens, isStaleTokenError } = require('./fcm-helper');
const { maybeSendOnlineBookingConfirmationWhatsApp } = require('./booking-confirmation-whatsapp-helper');

/** Instant push to all admin phones (HRO Admin app) — best-effort. */
async function pushBookingToAdmins(db, details) {
  const tokens = await getAdminFcmTokens(db, 'new_booking');
  if (tokens.length === 0) return;

  const service = [details.serviceType, details.serviceSubType]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
  const when = [details.scheduledDate, details.customTime || details.scheduledTimeSlot]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(', ');
  const lines = [
    `${service || 'Service'} — ${details.customerName || details.phone || 'customer'}`,
    ...(details.phone ? [`Phone: ${details.phone}`] : []),
    ...(when ? [`When: ${when}`] : []),
  ];

  const messaging = await getMessaging(db);
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: 'New website booking', body: lines.join('\n') },
    data: { type: 'new_booking' },
    android: {
      priority: 'high',
      notification: { channelId: 'job_alerts_v2', defaultSound: true, color: '#7C3AED' },
    },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
  });
  if (stale.length > 0) {
    await pruneAdminFcmTokens(db, stale);
  }
}

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

    const details = {
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
    };

    // App push first (instant), then customer WhatsApp confirmation + owner email.
    if (!client.error) {
      await pushBookingToAdmins(client.admin, details).catch((err) =>
        console.error('[booking-notify-background] admin push failed:', err && err.message)
      );
      await maybeSendOnlineBookingConfirmationWhatsApp(client.admin, {
        phone: phoneNorm,
        customerName,
        customerId,
        jobNumber: details.jobNumber,
        scheduledDate: details.scheduledDate,
        scheduledTimeSlot: details.scheduledTimeSlot,
        customTime: details.customTime,
        bookingSource: row.booking_source,
        bookingDomain: row.booking_domain,
      }).catch((err) =>
        console.error('[booking-notify-background] customer WA failed:', err && err.message)
      );
    }

    await sendBookingAdminNotification(details);
  } catch (err) {
    console.error('[booking-notify-background] failed:', err && err.message);
  }

  return { statusCode: 202, body: '' };
};
