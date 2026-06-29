import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { getPublicSiteOrigin } from '@/lib/publicSiteSeo';
import {
  buildEmailForceLightHead,
  buildEmailForceLightBodyAttrs,
  EMAIL_PAGE_BG,
  EMAIL_CARD_BG,
  EMAIL_FOOTER_BG,
  EMAIL_LAYOUT,
} from '@/lib/email-force-light-html';

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

/** Logo webp files are hosted on hydrogenro.com (mail clients cannot load localhost/CRM origins). */
const EMAIL_LOGO_ASSET_ORIGIN = 'https://hydrogenro.com';

export type EmailAssetOriginOptions = {
  /** CRM preview only — load /public images from localhost instead of production. */
  allowLocalhost?: boolean;
  /** Brand for public-site asset URLs (whatsapp/phone icons). */
  brand?: DocumentBrand;
};

function isLocalDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(
    origin.replace(/\/$/, '')
  );
}

/** Public marketing-site origin for email assets — never localhost or the CRM app URL. */
export function getPublicEmailAssetOrigin(brand: DocumentBrand = 'hydrogenro'): string {
  return getPublicSiteOrigin(brand);
}

/** @deprecated Prefer getPublicEmailAssetOrigin */
export function getPublicEmailSiteOrigin(): string {
  return getPublicEmailAssetOrigin('hydrogenro');
}

function getEmailSiteOrigin(baseUrl?: string, options?: EmailAssetOriginOptions): string {
  const allowLocalhost = options?.allowLocalhost ?? false;
  const brand = options?.brand ?? 'hydrogenro';

  if (allowLocalhost) {
    const normalized = baseUrl?.replace(/\/$/, '');
    if (normalized && isLocalDevOrigin(normalized)) {
      return normalized;
    }
    if (typeof window !== 'undefined') {
      const origin = window.location.origin.replace(/\/$/, '');
      if (isLocalDevOrigin(origin)) {
        return origin;
      }
    }
  }

  return getPublicEmailAssetOrigin(brand);
}

export function getEmailLogoUrls(
  _baseUrl?: string,
  _brand: DocumentBrand = 'hydrogenro',
  _options?: EmailAssetOriginOptions
): { light: string; dark: string } {
  // Always hydrogenro.com — mail clients cannot load localhost; preview must match sent mail.
  return {
    light: `${EMAIL_LOGO_ASSET_ORIGIN}/logo-dark.webp`,
    dark: `${EMAIL_LOGO_ASSET_ORIGIN}/logo-white.webp`,
  };
}

export function getEmailLogoUrl(
  baseUrl?: string,
  brand: DocumentBrand = 'hydrogenro',
  options?: EmailAssetOriginOptions
): string {
  return getEmailLogoUrls(baseUrl, brand, options).light;
}

export function getEmailIconUrl(
  baseUrl?: string,
  brand: DocumentBrand = 'hydrogenro',
  options?: EmailAssetOriginOptions
): string {
  return `${getEmailSiteOrigin(baseUrl, { ...options, brand })}/logo.webp`;
}

export function getEmailWhatsappIconUrl(
  baseUrl?: string,
  brand: DocumentBrand = 'hydrogenro',
  options?: EmailAssetOriginOptions
): string {
  return `${getEmailSiteOrigin(baseUrl, { ...options, brand })}/whatsapp.png`;
}

export function getEmailPhoneIconUrl(
  baseUrl?: string,
  brand: DocumentBrand = 'hydrogenro',
  options?: EmailAssetOriginOptions
): string {
  return `${getEmailSiteOrigin(baseUrl, { ...options, brand })}/telephone-call.png`;
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

export function formatServiceDate(scheduledDate: string): string {
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

/** Both brand and model must be present; otherwise omit the Device line entirely. */
export function formatDeviceLine(brand: string | undefined, model: string | undefined): string | null {
  const validBrand = isMeaningfulDeviceValue(brand) ? brand!.trim() : '';
  const validModel = isMeaningfulDeviceValue(model) ? model!.trim() : '';
  if (!validBrand || !validModel) return null;
  return `${validBrand} ${validModel}`;
}

function detailRow(label: string, value: string, last = false, highlight = false): string {
  const border = last ? '' : `border-bottom:1px solid ${EMAIL_COLORS.border};`;
  const valueWeight = highlight ? '700' : '600';
  return `
    <tr>
      <td class="email-detail-label" style="padding:12px 0;${border}font-family:${EMAIL_FONT};font-size:11px;width:30%;vertical-align:top;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;">${escapeHtml(label)}</td>
      <td class="email-detail-value" style="padding:12px 0 12px 12px;${border}font-family:${EMAIL_FONT};font-size:14px;font-weight:${valueWeight};vertical-align:top;line-height:1.45;">${escapeHtml(value)}</td>
    </tr>`;
}

function compactActionButton(
  href: string,
  iconUrl: string,
  label: string,
  borderColor: string,
  textColor: string,
  bgColor = '#ffffff',
  variant: 'whatsapp' | 'call' = 'call'
): string {
  const variantClass =
    variant === 'whatsapp' ? 'email-action-btn-whatsapp' : 'email-action-btn-call';
  return `
    <a href="${href}" class="email-action-btn ${variantClass}" style="display:block;background-color:${bgColor};color:${textColor};text-decoration:none;border-radius:10px;padding:12px 10px;border:1px solid ${borderColor};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="padding-right:7px;line-height:0;">
            <img src="${iconUrl}" width="18" height="18" alt="" class="email-action-btn-icon" style="display:block;width:18px;height:18px;border:0;" />
          </td>
          <td valign="middle" class="email-action-btn-label" style="font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${textColor};letter-spacing:-0.01em;">
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
              <td align="center" valign="middle" width="24" height="24" class="email-step-num" style="width:24px;height:24px;background-color:${c.heading};border-radius:999px;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;color:#ffffff;line-height:24px;text-align:center;">
                ${step}
              </td>
            </tr>
          </table>
        </td>
        <td valign="middle" class="email-step-text" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.5;padding-top:2px;">
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
                  <td align="center" valign="middle" width="48" height="48" class="email-success-icon" style="width:48px;height:48px;background-color:${c.successBg};border-radius:999px;font-family:${EMAIL_FONT};font-size:24px;font-weight:700;color:${c.success};line-height:48px;text-align:center;">
                    &#10003;
                  </td>
                </tr>
              </table>`;
}

/** Icon + wordmark — same as site Header Logo (Inter bold, w-8 icon, gap-2, text-xl). */
const EMAIL_BRAND_ICON_SIZE = 32;
const EMAIL_BRAND_ICON_RADIUS = 8;
const EMAIL_BRAND_FONT_SIZE = 20;
const EMAIL_BRAND_GAP = 8;
const EMAIL_BRAND_FONT =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export function buildEmailLogoHeaderBlock(
  logoUrls: { light: string; dark: string },
  brandName: string
): string {
  const icon = EMAIL_BRAND_ICON_SIZE;
  const radius = EMAIL_BRAND_ICON_RADIUS;
  const imgStyle = `display:block;width:${icon}px;height:${icon}px;max-width:${icon}px;max-height:${icon}px;border:0;border-radius:${radius}px;-webkit-border-radius:${radius}px;object-fit:cover;object-position:center;`;
  const clipStyle = `width:${icon}px;height:${icon}px;padding:0;line-height:0;font-size:0;border-radius:${radius}px;-webkit-border-radius:${radius}px;overflow:hidden;`;
  const darkBlockHidden = `display:none;max-height:0;max-width:0;width:0;height:0;overflow:hidden;opacity:0;visibility:hidden;mso-hide:all;border-collapse:collapse;`;

  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td valign="middle" style="padding-right:${EMAIL_BRAND_GAP}px;line-height:0;font-size:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-logo-block-light" style="border-collapse:collapse;">
                      <tr>
                        <td class="email-logo-icon-clip" style="${clipStyle}">
                          <img class="email-logo-light" src="${logoUrls.light}" alt="" width="${icon}" height="${icon}" style="${imgStyle}" />
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-logo-block-dark" style="${darkBlockHidden}">
                      <tr>
                        <td class="email-logo-icon-clip" style="${clipStyle}">
                          <img class="email-logo-dark" src="${logoUrls.dark}" alt="" width="${icon}" height="${icon}" style="${imgStyle}" />
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" class="email-brand-name" style="font-family:${EMAIL_BRAND_FONT};font-size:${EMAIL_BRAND_FONT_SIZE}px;font-weight:700;line-height:1;letter-spacing:-0.01em;white-space:nowrap;">
                    ${escapeHtml(brandName)}
                  </td>
                </tr>
              </table>`;
}

export function buildBookingConfirmationEmail(
  data: BookingConfirmationEmailData,
  options?: { logoUrl?: string; siteOrigin?: string; allowLocalhostAssets?: boolean }
): BookingConfirmationEmailResult {
  const documentBrand = resolveBookingEmailDocumentBrand(data, options?.siteOrigin);
  const assetOriginOpts: EmailAssetOriginOptions = {
    allowLocalhost: options?.allowLocalhostAssets,
    brand: documentBrand,
  };
  const siteOrigin = options?.siteOrigin || getEmailSiteOrigin(undefined, assetOriginOpts);
  const brandName = getDocumentBrandLabel(documentBrand);
  const contact = BRAND_CONTACT[documentBrand];
  const c = EMAIL_COLORS;
  const logoUrls = options?.logoUrl
    ? { light: options.logoUrl, dark: options.logoUrl }
    : getEmailLogoUrls(siteOrigin, documentBrand, assetOriginOpts);
  const whatsappIconUrl = getEmailWhatsappIconUrl(siteOrigin, documentBrand, assetOriginOpts);
  const phoneIconUrl = getEmailPhoneIconUrl(siteOrigin, documentBrand, assetOriginOpts);

  const headerLogoBlock = buildEmailLogoHeaderBlock(
    logoUrls,
    getDocumentBrandLabel(documentBrand)
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
    '#f0fdf4',
    'whatsapp'
  );

  const callButton = compactActionButton(
    `tel:${contact.phoneTel}`,
    phoneIconUrl,
    'Call us',
    c.border,
    c.heading,
    '#fafafa',
    'call'
  );

  const footerContactLine = `${preventAutoLinkText(contact.phoneDisplay)} &middot; ${preventAutoLinkText(contact.email)}`;
  const footerWebsiteLine = preventAutoLinkText(contact.website);

  const html = `<!DOCTYPE html>
<html lang="en" style="color-scheme:light dark;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no, date=no, email=no, address=no">
  <title>${escapeHtml(brandName)} — Booking Confirmed</title>
  ${buildEmailForceLightHead()}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body ${buildEmailForceLightBodyAttrs(`background-color:${c.pageBg};font-family:${EMAIL_FONT};-webkit-text-size-adjust:100%;`)}>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(brandName)} booking ${escapeHtml(jobNumber)} confirmed for ${escapeHtml(customerName)}.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-page" bgcolor="${EMAIL_PAGE_BG}" style="background-color:${c.pageBg};font-family:${EMAIL_FONT};">
    <tr>
      <td align="center" style="${EMAIL_LAYOUT.outerCellPadding}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-card" bgcolor="${EMAIL_CARD_BG}" style="${EMAIL_LAYOUT.cardTableBase}background-color:${c.cardBg};font-family:${EMAIL_FONT};">

          <tr>
            <td align="center" class="email-force-light-header" bgcolor="${EMAIL_CARD_BG}" style="${EMAIL_LAYOUT.headerPadding};background-color:${c.headerBg};border-bottom:1px solid ${c.border};text-align:center;">
              ${headerLogoBlock}
            </td>
          </tr>

          <tr>
            <td align="center" class="email-force-light-body email-surface-body" bgcolor="${EMAIL_CARD_BG}" style="${EMAIL_LAYOUT.heroBodyPadding};text-align:center;background-color:${c.cardBg};">
              ${buildSuccessIconBlock()}
              <p class="email-force-light-muted" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.4px;text-align:center;">Service booking</p>
              <h1 class="email-force-light-heading" style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.2;font-weight:700;text-align:center;letter-spacing:-0.03em;">Booking Confirmed</h1>
              <p class="email-body-text" style="margin:0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.6;text-align:center;font-weight:400;">
                Hi <strong class="email-text-strong" style="font-weight:600;">${escapeHtml(customerName)}</strong>, your appointment with ${escapeHtml(brandName)} is confirmed.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" class="email-surface-body" style="${EMAIL_LAYOUT.sectionPadding('8px', '24px')};text-align:center;background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td class="email-badge" style="border:1px solid ${c.border};border-radius:999px;padding:9px 20px;font-family:${EMAIL_FONT};font-size:13px;font-weight:500;text-align:center;">
                    Ref&nbsp;<strong class="email-text-strong" style="font-weight:700;letter-spacing:-0.02em;">${escapeHtml(jobNumber)}</strong>&nbsp;&middot;&nbsp;<span class="email-badge-success" style="font-weight:600;">Confirmed</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="email-surface-body" style="${EMAIL_LAYOUT.sectionPadding('0', '22px')};background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-details" style="background-color:${c.detailsBg};border:1px solid ${c.border};border-radius:12px;border-left:3px solid ${c.heading};">
                <tr>
                  <td style="padding:16px 18px 8px;">
                    <p class="email-details-title" style="margin:0;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;letter-spacing:-0.01em;">Appointment details</p>
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
            <td class="email-surface-body" style="${EMAIL_LAYOUT.sectionPadding('0', '8px')};background-color:${c.cardBg};">
              <p class="email-section-label" style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;text-align:center;">Need help?</p>
            </td>
          </tr>

          <tr>
            <td class="email-surface-body" style="${EMAIL_LAYOUT.sectionPadding('0', '22px')};background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" style="width:50%;padding-right:6px;vertical-align:top;">${whatsappButton}</td>
                  <td width="50%" style="width:50%;padding-left:6px;vertical-align:top;">${callButton}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="email-surface-body" style="${EMAIL_LAYOUT.sectionPadding('0', '26px')};background-color:${c.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-info-box" style="background-color:${c.footerBg};border:1px solid ${c.border};border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p class="email-details-title" style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;text-align:center;">What happens next</p>
                    ${nextStepRow(1, 'Technician calls you within 30 minutes')}
                    ${nextStepRow(2, 'Visit at your scheduled time slot')}
                    ${nextStepRow(3, 'Service completed as requested', true)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" class="email-force-light-footer email-surface-footer" bgcolor="${EMAIL_FOOTER_BG}" style="${EMAIL_LAYOUT.footerPadding};background-color:${c.footerBg};border-top:1px solid ${c.border};text-align:center;">
              <p class="email-details-title" style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;text-align:center;">${escapeHtml(brandName)}</p>
              <p class="email-footer-muted" style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;text-align:center;font-weight:400;">
                <span style="text-decoration:none !important;">${footerContactLine}</span>
              </p>
              <p class="email-footer-muted" style="margin:0;font-family:${EMAIL_FONT};font-size:11px;text-align:center;font-weight:400;">
                <span style="text-decoration:none !important;">${footerWebsiteLine}</span>
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
