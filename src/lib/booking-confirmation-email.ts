import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';

export interface BookingConfirmationEmailData {
  customerName: string;
  jobNumber: string;
  serviceType: string;
  serviceSubType: string;
  brand: string;
  model: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  serviceAddress: string;
  phone: string;
  email: string;
  documentBrand?: DocumentBrand;
}

export interface BookingConfirmationEmailResult {
  subject: string;
  html: string;
  text: string;
}

/** Inter with safe fallbacks for email clients that block web fonts. */
const EMAIL_FONT =
  "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const BRAND_CONTACT = {
  hydrogenro: {
    phoneDisplay: '9886944288 / 8884944288',
    phoneTel: '+919886944288',
    whatsapp: '918884944288',
    email: 'mail@hydrogenro.com',
    website: 'hydrogenro.com',
    tagline: 'Authorised RO Water Purifier Service · Bengaluru',
  },
  elevenro: {
    phoneDisplay: '9880693311 / 8792467611',
    phoneTel: '+919880693311',
    whatsapp: '919880693311',
    email: 'mail@elevenro.com',
    website: 'elevenro.com',
    tagline: 'Authorised RO Water Purifier Service · Bengaluru',
  },
} as const;

/** Monochrome palette — shared for both brands. */
const EMAIL_COLORS = {
  pageBg: '#ececec',
  cardBg: '#ffffff',
  headerBg: '#111111',
  footerBg: '#111111',
  textOnDark: '#ffffff',
  mutedOnDark: '#a3a3a3',
  heading: '#0a0a0a',
  body: '#525252',
  label: '#737373',
  border: '#e5e5e5',
  detailsBg: '#fafafa',
  badgeBg: '#0a0a0a',
  badgeText: '#ffffff',
  callBtn: '#0a0a0a',
} as const;

function getEmailSiteOrigin(baseUrl?: string): string {
  return (
    baseUrl?.replace(/\/$/, '') ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : String(import.meta.env.VITE_SITE_URL || 'https://hydrogenro.com').replace(/\/$/, ''))
  );
}

export function getEmailLogoUrl(baseUrl?: string): string {
  return `${getEmailSiteOrigin(baseUrl)}/logo.webp`;
}

export function getEmailWhatsappIconUrl(baseUrl?: string): string {
  return `${getEmailSiteOrigin(baseUrl)}/whatsapp.png`;
}

export function getEmailPhoneIconUrl(baseUrl?: string): string {
  return `${getEmailSiteOrigin(baseUrl)}/telephone-call.png`;
}

export function formatBookingTimeSlot(timeSlot: string): string {
  const timeMap: Record<string, string> = {
    FIRST_HALF: 'Morning (9 AM - 2 PM)',
    SECOND_HALF: 'Afternoon (2 PM - 8 PM)',
    MORNING: 'Morning (9 AM - 12 PM)',
    AFTERNOON: 'Afternoon (12 PM - 5 PM)',
    EVENING: 'Evening (5 PM - 8 PM)',
    morning: 'Morning (9 AM - 12 PM)',
    afternoon: 'Afternoon (12 PM - 5 PM)',
    evening: 'Evening (5 PM - 8 PM)',
  };
  return timeMap[timeSlot] || timeSlot;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatServiceDate(scheduledDate: string): string {
  try {
    return new Date(scheduledDate).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return scheduledDate;
  }
}

function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${EMAIL_COLORS.border};`;
  return `
    <tr>
      <td style="padding:11px 0;${border}font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_COLORS.label};width:32%;vertical-align:top;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(label)}</td>
      <td style="padding:11px 0 11px 10px;${border}font-family:${EMAIL_FONT};font-size:14px;color:${EMAIL_COLORS.heading};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function iconActionButton(
  href: string,
  iconUrl: string,
  label: string,
  bgColor: string,
  textColor: string,
  extraStyle = ''
): string {
  return `
    <a href="${href}" style="display:block;background-color:${bgColor};color:${textColor};text-decoration:none;border-radius:10px;padding:13px 16px;${extraStyle}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="padding-right:10px;line-height:0;">
            <img src="${iconUrl}" width="22" height="22" alt="" style="display:block;width:22px;height:22px;border:0;" />
          </td>
          <td valign="middle" style="font-family:${EMAIL_FONT};font-size:15px;font-weight:600;color:${textColor};letter-spacing:-0.01em;">
            ${escapeHtml(label)}
          </td>
        </tr>
      </table>
    </a>`;
}

export function buildBookingConfirmationEmail(
  data: BookingConfirmationEmailData,
  options?: { logoUrl?: string; siteOrigin?: string }
): BookingConfirmationEmailResult {
  const documentBrand = data.documentBrand || 'hydrogenro';
  const brandName = getDocumentBrandLabel(documentBrand);
  const contact = BRAND_CONTACT[documentBrand];
  const c = EMAIL_COLORS;
  const siteOrigin = options?.siteOrigin || getEmailSiteOrigin();
  const logoUrl = options?.logoUrl || getEmailLogoUrl(siteOrigin);
  const whatsappIconUrl = getEmailWhatsappIconUrl(siteOrigin);
  const phoneIconUrl = getEmailPhoneIconUrl(siteOrigin);

  const customerName = data.customerName || 'Customer';
  const jobNumber = data.jobNumber || 'N/A';
  const serviceLine = `${data.serviceType || 'RO'} - ${data.serviceSubType || 'Service'}`;
  const deviceLine = `${data.brand || 'Not specified'} ${data.model || ''}`.trim();
  const serviceDate = formatServiceDate(data.scheduledDate);
  const timeSlot = formatBookingTimeSlot(data.scheduledTimeSlot);
  const address = data.serviceAddress || '—';
  const phoneShort = contact.phoneDisplay.split('/')[0].trim();

  const whatsappText = encodeURIComponent(
    `Hi, I have a booking (${jobNumber}) for ${data.serviceType || 'RO'} service. My name is ${customerName}.`
  );

  const whatsappButton = iconActionButton(
    `https://wa.me/${contact.whatsapp}?text=${whatsappText}`,
    whatsappIconUrl,
    `WhatsApp ${brandName}`,
    '#25D366',
    '#ffffff'
  );

  const callButton = iconActionButton(
    `tel:${contact.phoneTel}`,
    phoneIconUrl,
    `Call ${phoneShort}`,
    c.callBtn,
    '#ffffff'
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(brandName)} — Booking Confirmed</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${c.pageBg};font-family:${EMAIL_FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(brandName)} booking ${escapeHtml(jobNumber)} confirmed for ${escapeHtml(customerName)}.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${c.pageBg};font-family:${EMAIL_FONT};">
    <tr>
      <td align="center" style="padding:20px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:${c.cardBg};border:1px solid ${c.border};border-radius:12px;overflow:hidden;font-family:${EMAIL_FONT};">

          <tr>
            <td align="center" style="padding:28px 24px 22px;background-color:${c.headerBg};text-align:center;">
              <img src="${logoUrl}" alt="${escapeHtml(brandName)}" width="48" style="display:block;margin:0 auto 14px;width:48px;height:auto;border:0;" />
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:20px;line-height:1.2;font-weight:700;color:${c.textOnDark};text-align:center;letter-spacing:-0.02em;">${escapeHtml(brandName)}</p>
              <p style="margin:8px 0 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.4;color:${c.mutedOnDark};text-align:center;font-weight:400;">${escapeHtml(contact.tagline)}</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:26px 24px 10px;text-align:center;background-color:${c.cardBg};">
              <p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;color:${c.label};text-transform:uppercase;letter-spacing:1.2px;text-align:center;">Service booking</p>
              <h1 style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:24px;line-height:1.25;font-weight:700;color:${c.heading};text-align:center;letter-spacing:-0.03em;">Booking Confirmed</h1>
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.55;color:${c.body};text-align:center;font-weight:400;">
                Hi <strong style="color:${c.heading};font-weight:600;">${escapeHtml(customerName)}</strong>, your appointment with ${escapeHtml(brandName)} is confirmed.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:4px 24px 22px;text-align:center;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td style="background-color:${c.badgeBg};border-radius:999px;padding:8px 18px;font-family:${EMAIL_FONT};font-size:13px;font-weight:500;color:${c.badgeText};text-align:center;">
                    Reference&nbsp;<strong style="font-weight:700;">${escapeHtml(jobNumber)}</strong>&nbsp;·&nbsp;Confirmed
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 20px 20px;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${c.detailsBg};border:1px solid ${c.border};border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px 6px;">
                    <p style="margin:0;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${c.heading};letter-spacing:-0.01em;">Appointment details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 16px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${detailRow('Service', serviceLine)}
                      ${detailRow('Device', deviceLine)}
                      ${detailRow('Date', serviceDate)}
                      ${detailRow('Time', timeSlot)}
                      ${detailRow('Address', address, true)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 20px 18px;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom:10px;">${whatsappButton}</td>
                </tr>
                <tr>
                  <td>${callButton}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 20px 22px;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${c.border};">
                <tr>
                  <td style="padding-top:18px;">
                    <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${c.heading};text-align:center;">What happens next</p>
                    <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;color:${c.body};text-align:center;font-weight:400;">Technician calls you within 30 minutes</p>
                    <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;color:${c.body};text-align:center;font-weight:400;">Visit at your scheduled time slot</p>
                    <p style="margin:0;font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;color:${c.body};text-align:center;font-weight:400;">Service completed as requested</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:16px 20px;background-color:${c.footerBg};text-align:center;">
              <p style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${c.textOnDark};text-align:center;">${escapeHtml(brandName)}</p>
              <p style="margin:0 0 2px;font-family:${EMAIL_FONT};font-size:12px;color:${c.mutedOnDark};text-align:center;font-weight:400;">${escapeHtml(contact.phoneDisplay)} · ${escapeHtml(contact.email)}</p>
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;color:#737373;text-align:center;font-weight:400;">${escapeHtml(contact.website)}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${brandName} — Service Booking Confirmed`,
    '',
    `Hi ${customerName},`,
    '',
    `Your booking with ${brandName} is confirmed. Reference: ${jobNumber}`,
    '',
    'Appointment details:',
    `- Service: ${serviceLine}`,
    `- Device: ${deviceLine}`,
    `- Date: ${serviceDate}`,
    `- Time: ${timeSlot}`,
    `- Address: ${address}`,
    '',
    'What happens next:',
    '- Technician calls within 30 minutes',
    '- Visit at your scheduled time slot',
    '- Service completed as requested',
    '',
    `WhatsApp: https://wa.me/${contact.whatsapp}`,
    `Phone: ${contact.phoneDisplay}`,
    `Email: ${contact.email}`,
    '',
    brandName,
  ].join('\n');

  return {
    subject: `Service Booking Confirmed — ${brandName} (${jobNumber})`,
    html,
    text,
  };
}

export const SAMPLE_BOOKING_CONFIRMATION_EMAIL: BookingConfirmationEmailData = {
  customerName: 'Rahul Sharma',
  jobNumber: 'JOB-2026-0042',
  serviceType: 'RO',
  serviceSubType: 'Service & Filter Change',
  brand: 'Kent',
  model: 'Grand Plus',
  scheduledDate: new Date().toISOString().split('T')[0],
  scheduledTimeSlot: 'FIRST_HALF',
  serviceAddress: '42, 3rd Cross, HSR Layout, Bengaluru - 560102',
  phone: '9876543210',
  email: 'customer@example.com',
  documentBrand: 'hydrogenro',
};
