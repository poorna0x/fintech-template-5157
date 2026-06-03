// Internal "new booking" notification email (server-side, best-effort).
//
// Sent to the business owner whenever a public booking is confirmed, for both
// HydrogenRO and ElevenRO sites. This is intentionally separate from the
// customer-facing confirmation handled by `send-email.js`:
//   - recipient is a FIXED internal address (env BOOKING_NOTIFY_EMAIL), never
//     supplied by the client, so it can't be abused to send mail anywhere;
//   - it runs inside `booking-job-create.js` after the booking RPC succeeds,
//     so it can't be triggered without an actual confirmed booking.
//
// Failures here must NEVER break or delay a booking, so every path is wrapped
// in try/catch and the SMTP send is bounded by a hard timeout.

const nodemailer = require('nodemailer');
const { getFixedFromAddress } = require('./email-guard');

// Default owner inbox; override per-environment with BOOKING_NOTIFY_EMAIL
// (single address or comma-separated list).
const DEFAULT_NOTIFY_EMAIL = 'poorna8105@gmail.com';

// Hard cap on the whole SMTP attempt. Serverless functions freeze after the
// response is returned, so we await the send — but never longer than this.
const SEND_TIMEOUT_MS = 7000;

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function getNotifyRecipients() {
  const raw = process.env.BOOKING_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL;
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && EMAIL_RE.test(s) && s.length <= 254);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brandLabel(source, domain) {
  const s = String(source || '').toLowerCase();
  const d = String(domain || '').toLowerCase();
  if (s.includes('elevenro') || d.includes('elevenro')) return 'ElevenRO';
  if (s.includes('hydrogenro') || d.includes('hydrogenro')) return 'HydrogenRO';
  return 'Website';
}

function formatTimeSlot(slot, customTime) {
  if (customTime && String(customTime).trim()) return String(customTime).trim();
  switch (String(slot || '').toUpperCase()) {
    case 'MORNING':
      return 'Morning (First Half)';
    case 'AFTERNOON':
      return 'Afternoon (Second Half)';
    case 'EVENING':
      return 'Evening';
    default:
      return slot ? String(slot) : 'Not specified';
  }
}

function formatBookedFor(serviceType, serviceSubType) {
  const sub = String(serviceSubType || '').trim();
  const type = String(serviceType || '').trim();
  if (sub && type) return `${sub} (${type})`;
  return sub || type || 'Not specified';
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SMTP timeout')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Send the internal new-booking notification. Best-effort: resolves with a
 * small status object and never throws.
 */
async function sendBookingAdminNotification(details = {}) {
  try {
    const fromAddress = getFixedFromAddress();
    const pass = process.env.HOSTINGER_EMAIL_PASS;
    if (!fromAddress || !pass) {
      // SMTP not configured (e.g. local/dev) — quietly skip.
      return { sent: false, reason: 'email_not_configured' };
    }

    const recipients = getNotifyRecipients();
    if (recipients.length === 0) {
      return { sent: false, reason: 'no_recipients' };
    }

    const brand = brandLabel(details.brandSource, details.bookingDomain);
    const customerName = String(details.customerName || '').trim() || 'Unknown customer';
    const phone = String(details.phone || '').trim() || 'N/A';
    const bookedFor = formatBookedFor(details.serviceType, details.serviceSubType);
    const bookedTime = formatTimeSlot(details.scheduledTimeSlot, details.customTime);
    const scheduledDate = String(details.scheduledDate || '').trim() || 'Not specified';
    const jobNumber = String(details.jobNumber || '').trim() || 'N/A';

    const subject = `New ${brand} Booking — ${customerName} (${scheduledDate})`;

    const rows = [
      ['Brand', brand],
      ['Customer', customerName],
      ['Phone', phone],
      ['Booked For', bookedFor],
      ['Date', scheduledDate],
      ['Time', bookedTime],
      ['Job Number', jobNumber],
    ];

    const htmlRows = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;border-bottom:1px solid #eee;">${escapeHtml(
            label
          )}</td><td style="padding:6px 12px;color:#111827;border-bottom:1px solid #eee;">${escapeHtml(
            value
          )}</td></tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:16px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="background:#0f172a;color:#fff;padding:16px 20px;font-size:16px;font-weight:700;">
          New ${escapeHtml(brand)} Booking Confirmed
        </div>
        <div style="padding:8px 8px 16px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">${htmlRows}</table>
        </div>
        <div style="padding:12px 20px;color:#6b7280;font-size:12px;border-top:1px solid #eee;">
          Automated notification from the ${escapeHtml(brand)} booking system.
        </div>
      </div>
    </body></html>`;

    const text = [
      `New ${brand} booking confirmed.`,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join('\n');

    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false,
      auth: { user: fromAddress, pass },
      tls: {},
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });

    const info = await withTimeout(
      transporter.sendMail({
        from: { name: `${brand} Bookings`, address: fromAddress },
        to: recipients.join(', '),
        subject,
        html,
        text,
        headers: {
          'X-Mailer': `${brand} Booking Notifier`,
          'Auto-Submitted': 'auto-generated',
        },
        messageId: `<${Date.now()}.${Math.random()
          .toString(36)
          .slice(2, 11)}@hydrogenro.com>`,
      }),
      SEND_TIMEOUT_MS
    );

    return { sent: true, messageId: info && info.messageId };
  } catch (error) {
    console.error('[booking-notify] failed to send notification:', error && error.message);
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = {
  sendBookingAdminNotification,
  // exported for potential reuse/testing
  brandLabel,
  formatTimeSlot,
  formatBookedFor,
  getNotifyRecipients,
};
