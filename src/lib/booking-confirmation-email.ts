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

/** Monochrome palette with subtle success accent. */
const EMAIL_COLORS = {
  pageBg: '#f3f3f4',
  cardBg: '#ffffff',
  headerBg: '#ffffff',
  footerBg: '#fafafa',
  textOnDark: '#0a0a0a',
  mutedOnDark: '#737373',
  heading: '#0a0a0a',
  body: '#525252',
  label: '#737373',
  border: '#e5e5e5',
  detailsBg: '#fafafa',
  badgeBg: '#f4f4f5',
  badgeText: '#0a0a0a',
  success: '#16a34a',
  successBg: '#dcfce7',
  successMuted: '#15803d',
  callBtn: '#0a0a0a',
  headerTagline: '#737373',
  cardShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)',
} as const;

function getEmailSiteOrigin(baseUrl?: string): string {
  return (
    baseUrl?.replace(/\/$/, '') ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : String(import.meta.env.VITE_SITE_URL || 'https://hydrogenro.com').replace(/\/$/, ''))
  );
}

export function getEmailLogoUrl(
  baseUrl?: string,
  brand: DocumentBrand = 'hydrogenro'
): string {
  const path = brand === 'elevenro' ? '/elevenrofulloogo.webp' : '/fulllogo.webp';
  return `${getEmailSiteOrigin(baseUrl)}${path}`;
}

export function getEmailIconUrl(baseUrl?: string): string {
  return `${getEmailSiteOrigin(baseUrl)}/logo.webp`;
}

export function getEmailWhatsappIconUrl(baseUrl?: string): string {
  return `${getEmailSiteOrigin(baseUrl)}/whatsapp.png`;
}

export function getEmailPhoneIconUrl(baseUrl?: string): string {
  return `${getEmailSiteOrigin(baseUrl)}/telephone-call.png`;
}

/** Resolve brand from explicit field, then site origin (elevenro.com vs hydrogenro.com). */
export function resolveBookingEmailDocumentBrand(
  data: Pick<BookingConfirmationEmailData, 'documentBrand'>,
  siteOrigin?: string
): DocumentBrand {
  if (data.documentBrand === 'elevenro' || data.documentBrand === 'hydrogenro') {
    return data.documentBrand;
  }
  const origin = (siteOrigin || getEmailSiteOrigin()).toLowerCase();
  if (origin.includes('elevenro')) return 'elevenro';
  return 'hydrogenro';
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

function preventAutoLinkText(text: string): string {
  return escapeHtml(text)
    .replace(/@/g, '&#8203;@')
    .replace(/\./g, '&#8203;.')
    .replace(/\//g, ' &#8203;/&#8203; ');
}

function isMeaningfulDeviceValue(val: string | undefined): boolean {
  if (!val) return false;
  const t = val.trim();
  return t !== '' && t.toLowerCase() !== 'not specified' && t.toLowerCase() !== 'n/a';
}

/** Both brand and model must be present; otherwise omit the Device row entirely. */
function formatDeviceLine(brand: string | undefined, model: string | undefined): string | null {
  const validBrand = isMeaningfulDeviceValue(brand) ? brand!.trim() : '';
  const validModel = isMeaningfulDeviceValue(model) ? model!.trim() : '';
  if (!validBrand || !validModel) return null;
  return `${validBrand} ${validModel}`;
}

function detailRow(label: string, value: string, last = false, highlight = false): string {
  const border = last ? '' : `border-bottom:1px solid ${EMAIL_COLORS.border};`;
  const valueColor = highlight ? EMAIL_COLORS.heading : EMAIL_COLORS.heading;
  const valueWeight = highlight ? '700' : '600';
  return `
    <tr>
      <td style="padding:12px 0;${border}font-family:${EMAIL_FONT};font-size:11px;color:${EMAIL_COLORS.label};width:30%;vertical-align:top;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;">${escapeHtml(label)}</td>
      <td style="padding:12px 0 12px 12px;${border}font-family:${EMAIL_FONT};font-size:14px;color:${valueColor};font-weight:${valueWeight};vertical-align:top;line-height:1.45;">${escapeHtml(value)}</td>
    </tr>`;
}

function compactActionButton(
  href: string,
  iconUrl: string,
  label: string,
  borderColor: string,
  textColor: string,
  bgColor = '#ffffff'
): string {
  return `
    <a href="${href}" style="display:block;background-color:${bgColor};color:${textColor};text-decoration:none;border-radius:10px;padding:12px 10px;border:1px solid ${borderColor};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="padding-right:7px;line-height:0;">
            <img src="${iconUrl}" width="18" height="18" alt="" style="display:block;width:18px;height:18px;border:0;" />
          </td>
          <td valign="middle" style="font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${textColor};letter-spacing:-0.01em;">
            ${escapeHtml(label)}
          </td>
        </tr>
      </table>
    </a>`;
}

function nextStepRow(step: number, text: string, last = false): string {
  const c = EMAIL_COLORS;
  const margin = last ? '0' : '12px';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 auto ${margin};">
      <tr>
        <td width="30" valign="top" style="width:30px;padding-right:12px;line-height:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" valign="middle" width="24" height="24" style="width:24px;height:24px;background-color:${c.heading};border-radius:999px;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;color:#ffffff;line-height:24px;text-align:center;">
                ${step}
              </td>
            </tr>
          </table>
        </td>
        <td valign="middle" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.5;color:${c.body};padding-top:2px;">
          ${escapeHtml(text)}
        </td>
      </tr>
    </table>`;
}

function buildSuccessIconBlock(): string {
  const c = EMAIL_COLORS;
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;">
                <tr>
                  <td align="center" valign="middle" width="48" height="48" style="width:48px;height:48px;background-color:${c.successBg};border-radius:999px;font-family:${EMAIL_FONT};font-size:24px;font-weight:700;color:${c.success};line-height:48px;text-align:center;">
                    &#10003;
                  </td>
                </tr>
              </table>`;
}

/** Matches DocumentBrandLogo: h-12 sm:h-14 → 52px tall, max 200px wide. */
const EMAIL_LOGO_HEIGHT = 52;
const EMAIL_LOGO_MAX_WIDTH = 200;

function buildEmailHeaderBlock(
  fullLogoUrl: string,
  brandName: string,
  tagline: string
): string {
  const c = EMAIL_COLORS;
  const h = EMAIL_LOGO_HEIGHT;

  return `
              <img src="${fullLogoUrl}" alt="${escapeHtml(brandName)}" width="${EMAIL_LOGO_MAX_WIDTH}" height="${h}" style="display:block;margin:0 auto;height:${h}px;width:auto;max-width:${EMAIL_LOGO_MAX_WIDTH}px;max-height:${h}px;border:0;" />
              <p style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.45;color:${c.headerTagline};text-align:center;font-weight:400;">${escapeHtml(tagline)}</p>`;
}

export function buildBookingConfirmationEmail(
  data: BookingConfirmationEmailData,
  options?: { logoUrl?: string; siteOrigin?: string }
): BookingConfirmationEmailResult {
  const siteOrigin = options?.siteOrigin || getEmailSiteOrigin();
  const documentBrand = resolveBookingEmailDocumentBrand(data, siteOrigin);
  const brandName = getDocumentBrandLabel(documentBrand);
  const contact = BRAND_CONTACT[documentBrand];
  const c = EMAIL_COLORS;
  const fullLogoUrl = options?.logoUrl || getEmailLogoUrl(siteOrigin, documentBrand);
  const whatsappIconUrl = getEmailWhatsappIconUrl(siteOrigin);
  const phoneIconUrl = getEmailPhoneIconUrl(siteOrigin);

  const headerLogoBlock = buildEmailHeaderBlock(
    fullLogoUrl,
    getDocumentBrandLabel(documentBrand),
    contact.tagline
  );

  const customerName = data.customerName || 'Customer';
  const jobNumber = data.jobNumber || 'N/A';
  const serviceLine = `${data.serviceType || 'RO'} - ${data.serviceSubType || 'Service'}`;
  const deviceLine = formatDeviceLine(data.brand, data.model);
  const serviceDate = formatServiceDate(data.scheduledDate);
  const timeSlot = formatBookingTimeSlot(data.scheduledTimeSlot);
  const address = data.serviceAddress || '—';

  const whatsappText = encodeURIComponent(
    `Hi, I have a booking (${jobNumber}) for ${data.serviceType || 'RO'} service. My name is ${customerName}.`
  );

  const whatsappButton = compactActionButton(
    `https://wa.me/${contact.whatsapp}?text=${whatsappText}`,
    whatsappIconUrl,
    'WhatsApp',
    '#86efac',
    c.successMuted,
    '#f0fdf4'
  );

  const callButton = compactActionButton(
    `tel:${contact.phoneTel}`,
    phoneIconUrl,
    'Call us',
    c.border,
    c.heading,
    '#fafafa'
  );

  const footerContactLine = `${preventAutoLinkText(contact.phoneDisplay)} &middot; ${preventAutoLinkText(contact.email)}`;
  const footerWebsiteLine = preventAutoLinkText(contact.website);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no, date=no, email=no, address=no">
  <title>${escapeHtml(brandName)} — Booking Confirmed</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${c.pageBg};font-family:${EMAIL_FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(brandName)} booking ${escapeHtml(jobNumber)} confirmed for ${escapeHtml(customerName)}.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${c.pageBg};font-family:${EMAIL_FONT};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:${c.cardBg};border:1px solid ${c.border};border-radius:14px;overflow:hidden;font-family:${EMAIL_FONT};box-shadow:${c.cardShadow};">

          <tr>
            <td align="center" style="padding:28px 28px 22px;background-color:${c.headerBg};border-bottom:1px solid ${c.border};text-align:center;">
              ${headerLogoBlock}
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:28px 28px 8px;text-align:center;background-color:${c.cardBg};">
              ${buildSuccessIconBlock()}
              <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;color:${c.label};text-transform:uppercase;letter-spacing:1.4px;text-align:center;">Service booking</p>
              <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.2;font-weight:700;color:${c.heading};text-align:center;letter-spacing:-0.03em;">Booking Confirmed</h1>
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.6;color:${c.body};text-align:center;font-weight:400;max-width:420px;">
                Hi <strong style="color:${c.heading};font-weight:600;">${escapeHtml(customerName)}</strong>, your appointment with ${escapeHtml(brandName)} is confirmed.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:8px 28px 24px;text-align:center;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td style="background-color:${c.badgeBg};border:1px solid ${c.border};border-radius:999px;padding:9px 20px;font-family:${EMAIL_FONT};font-size:13px;font-weight:500;color:${c.badgeText};text-align:center;">
                    Ref&nbsp;<strong style="font-weight:700;letter-spacing:-0.02em;">${escapeHtml(jobNumber)}</strong>&nbsp;&middot;&nbsp;<span style="color:${c.success};font-weight:600;">Confirmed</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 22px;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${c.detailsBg};border:1px solid ${c.border};border-radius:12px;border-left:3px solid ${c.heading};">
                <tr>
                  <td style="padding:16px 18px 8px;">
                    <p style="margin:0;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${c.heading};letter-spacing:-0.01em;">Appointment details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${detailRow('Service', serviceLine)}
                      ${deviceLine ? detailRow('Device', deviceLine) : ''}
                      ${detailRow('Date', serviceDate, false, true)}
                      ${detailRow('Time', timeSlot, false, true)}
                      ${detailRow('Address', address, true)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 8px;background-color:${c.cardBg};">
              <p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;color:${c.label};text-transform:uppercase;letter-spacing:0.8px;text-align:center;">Need help?</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 22px;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" style="width:50%;padding-right:6px;vertical-align:top;">${whatsappButton}</td>
                  <td width="50%" style="width:50%;padding-left:6px;vertical-align:top;">${callButton}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 26px;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${c.footerBg};border:1px solid ${c.border};border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${c.heading};text-align:center;">What happens next</p>
                    ${nextStepRow(1, 'Technician calls you within 30 minutes')}
                    ${nextStepRow(2, 'Visit at your scheduled time slot')}
                    ${nextStepRow(3, 'Service completed as requested', true)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 24px 22px;background-color:${c.footerBg};border-top:1px solid ${c.border};text-align:center;">
              <p style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${c.textOnDark};text-align:center;">${escapeHtml(brandName)}</p>
              <p style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:${c.mutedOnDark};text-align:center;font-weight:400;">
                <span style="color:${c.mutedOnDark} !important;text-decoration:none !important;">${footerContactLine}</span>
              </p>
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;color:${c.mutedOnDark};text-align:center;font-weight:400;">
                <span style="color:${c.mutedOnDark} !important;text-decoration:none !important;">${footerWebsiteLine}</span>
              </p>
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
    ...(deviceLine ? [`- Device: ${deviceLine}`] : []),
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
