import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  buildBookingConfirmationEmail,
  getEmailLogoUrl,
  getEmailPhoneIconUrl,
  getEmailWhatsappIconUrl,
  SAMPLE_BOOKING_CONFIRMATION_EMAIL,
  type BookingConfirmationEmailData,
  type BookingConfirmationEmailResult,
} from '@/lib/booking-confirmation-email';

export type AdminEmailTemplateType =
  | 'booking_confirmation'
  | 'amc_document'
  | 'invoice'
  | 'quotation'
  | 'service_reminder'
  | 'general';

export interface AdminDocumentEmailData {
  documentBrand: DocumentBrand;
  customerName: string;
  documentRef: string;
  amount: string;
  dueDate: string;
  message: string;
  customSubject: string;
}

export interface AdminEmailBuildOptions {
  siteOrigin?: string;
  attachmentNames?: string[];
}

export interface AdminEmailTemplateMeta {
  label: string;
  description: string;
  showDocumentRef: boolean;
  showAmount: boolean;
  showDueDate: boolean;
  showCustomSubject: boolean;
}

export const ADMIN_EMAIL_TEMPLATE_META: Record<AdminEmailTemplateType, AdminEmailTemplateMeta> = {
  booking_confirmation: {
    label: 'Booking confirmation',
    description: 'Sent automatically after a customer books online.',
    showDocumentRef: false,
    showAmount: false,
    showDueDate: false,
    showCustomSubject: false,
  },
  amc_document: {
    label: 'AMC agreement',
    description: 'Send an AMC PDF or agreement to the customer.',
    showDocumentRef: true,
    showAmount: true,
    showDueDate: true,
    showCustomSubject: false,
  },
  invoice: {
    label: 'Tax invoice',
    description: 'Send an invoice PDF with payment details.',
    showDocumentRef: true,
    showAmount: true,
    showDueDate: true,
    showCustomSubject: false,
  },
  quotation: {
    label: 'Quotation',
    description: 'Send a quotation PDF to the customer.',
    showDocumentRef: true,
    showAmount: true,
    showDueDate: true,
    showCustomSubject: false,
  },
  service_reminder: {
    label: 'Service reminder',
    description: 'Remind customers their RO service is due.',
    showDocumentRef: false,
    showAmount: false,
    showDueDate: true,
    showCustomSubject: false,
  },
  general: {
    label: 'General email',
    description: 'Free-form message with optional attachments.',
    showDocumentRef: false,
    showAmount: false,
    showDueDate: false,
    showCustomSubject: true,
  },
};

export const SAMPLE_ADMIN_DOCUMENT_EMAIL: AdminDocumentEmailData = {
  documentBrand: 'hydrogenro',
  customerName: 'Rahul Sharma',
  documentRef: 'AMC-2026-0018',
  amount: '₹4,500',
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  message:
    'Please find the attached document for your reference. Contact us on WhatsApp or phone if you have any questions.',
  customSubject: 'Message from Hydrogen RO',
};

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

const C = {
  pageBg: '#f3f3f4',
  cardBg: '#ffffff',
  footerBg: '#fafafa',
  heading: '#0a0a0a',
  body: '#525252',
  label: '#737373',
  border: '#e5e5e5',
  detailsBg: '#fafafa',
  headerTagline: '#737373',
  cardShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function preventAutoLinkText(text: string): string {
  return escapeHtml(text)
    .replace(/@/g, '&#8203;@')
    .replace(/\./g, '&#8203;.')
    .replace(/\//g, ' &#8203;/&#8203; ');
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${C.border};`;
  return `
    <tr>
      <td style="padding:11px 0;${border}font-family:${EMAIL_FONT};font-size:11px;color:${C.label};width:34%;vertical-align:top;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;">${escapeHtml(label)}</td>
      <td style="padding:11px 0 11px 12px;${border}font-family:${EMAIL_FONT};font-size:14px;color:${C.heading};font-weight:600;vertical-align:top;line-height:1.45;">${escapeHtml(value)}</td>
    </tr>`;
}

function actionButton(
  href: string,
  iconUrl: string,
  label: string,
  borderColor: string,
  textColor: string,
  bgColor: string
): string {
  return `
    <a href="${href}" style="display:block;background-color:${bgColor};color:${textColor};text-decoration:none;border-radius:10px;padding:12px 10px;border:1px solid ${borderColor};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="padding-right:7px;line-height:0;">
            <img src="${iconUrl}" width="18" height="18" alt="" style="display:block;width:18px;height:18px;border:0;" />
          </td>
          <td valign="middle" style="font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${textColor};">${escapeHtml(label)}</td>
        </tr>
      </table>
    </a>`;
}

function attachmentNoticeBlock(names: string[]): string {
  if (!names.length) return '';
  const items = names.map((n) => `<li style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;color:${C.body};">${escapeHtml(n)}</li>`).join('');
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.6px;">Attachments included</p>
                    <ul style="margin:0;padding-left:18px;">${items}</ul>
                  </td>
                </tr>
              </table>`;
}

function templateHeadline(type: AdminEmailTemplateType): string {
  switch (type) {
    case 'amc_document':
      return 'AMC Agreement';
    case 'invoice':
      return 'Tax Invoice';
    case 'quotation':
      return 'Quotation';
    case 'service_reminder':
      return 'Service Reminder';
    default:
      return 'Message';
  }
}

function templateEyebrow(type: AdminEmailTemplateType): string {
  switch (type) {
    case 'amc_document':
      return 'Annual maintenance';
    case 'invoice':
      return 'Billing';
    case 'quotation':
      return 'Estimate';
    case 'service_reminder':
      return 'Maintenance';
    default:
      return 'Customer update';
  }
}

function buildSubject(
  type: AdminEmailTemplateType,
  brandLabel: string,
  data: AdminDocumentEmailData
): string {
  const ref = data.documentRef?.trim();
  switch (type) {
    case 'amc_document':
      return ref ? `AMC Agreement — ${brandLabel} (${ref})` : `AMC Agreement — ${brandLabel}`;
    case 'invoice':
      return ref ? `Tax Invoice — ${brandLabel} (${ref})` : `Tax Invoice — ${brandLabel}`;
    case 'quotation':
      return ref ? `Quotation — ${brandLabel} (${ref})` : `Quotation — ${brandLabel}`;
    case 'service_reminder':
      return `RO Service Reminder — ${brandLabel}`;
    case 'general':
      return data.customSubject.trim() || `Message from ${brandLabel}`;
    default:
      return `Message from ${brandLabel}`;
  }
}

function buildDetailsRows(
  type: AdminEmailTemplateType,
  data: AdminDocumentEmailData,
  meta: AdminEmailTemplateMeta
): string {
  const rows: string[] = [];
  if (meta.showDocumentRef && data.documentRef.trim()) {
    const refLabel =
      type === 'invoice' ? 'Invoice no.' : type === 'quotation' ? 'Quote no.' : 'Reference';
    rows.push(detailRow(refLabel, data.documentRef.trim()));
  }
  if (meta.showAmount && data.amount.trim()) {
    rows.push(detailRow('Amount', data.amount.trim()));
  }
  if (meta.showDueDate && data.dueDate.trim()) {
    const dueLabel = type === 'service_reminder' ? 'Suggested date' : 'Valid / due date';
    rows.push(detailRow(dueLabel, formatDisplayDate(data.dueDate.trim()), true));
  }
  if (!rows.length) return '';
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.detailsBg};border:1px solid ${C.border};border-radius:12px;border-left:3px solid ${C.heading};margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px 6px;">
                    <p style="margin:0;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${C.heading};">Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 16px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${rows.join('')}
                    </table>
                  </td>
                </tr>
              </table>`;
}

function buildAdminDocumentEmail(
  type: AdminEmailTemplateType,
  data: AdminDocumentEmailData,
  options?: AdminEmailBuildOptions
): BookingConfirmationEmailResult {
  const siteOrigin = options?.siteOrigin;
  const brand = data.documentBrand;
  const brandName = getDocumentBrandLabel(brand);
  const contact = BRAND_CONTACT[brand];
  const logoUrl = getEmailLogoUrl(siteOrigin, brand);
  const whatsappIconUrl = getEmailWhatsappIconUrl(siteOrigin);
  const phoneIconUrl = getEmailPhoneIconUrl(siteOrigin);
  const customerName = data.customerName.trim() || 'Customer';
  const message = data.message.trim();
  const headline = templateHeadline(type);
  const eyebrow = templateEyebrow(type);
  const meta = ADMIN_EMAIL_TEMPLATE_META[type];
  const subject = buildSubject(type, brandName, data);
  const detailsBlock = buildDetailsRows(type, data, meta);
  const attachmentBlock = attachmentNoticeBlock(options?.attachmentNames || []);

  const whatsappButton = actionButton(
    `https://wa.me/${contact.whatsapp}`,
    whatsappIconUrl,
    'WhatsApp',
    '#86efac',
    '#15803d',
    '#f0fdf4'
  );
  const callButton = actionButton(
    `tel:${contact.phoneTel}`,
    phoneIconUrl,
    'Call us',
    C.border,
    C.heading,
    '#fafafa'
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, email=no, address=no">
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${C.pageBg};font-family:${EMAIL_FONT};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.pageBg};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:${C.cardBg};border:1px solid ${C.border};border-radius:14px;overflow:hidden;box-shadow:${C.cardShadow};">
          <tr>
            <td align="center" style="padding:28px 28px 22px;border-bottom:1px solid ${C.border};">
              <img src="${logoUrl}" alt="${escapeHtml(brandName)}" width="200" height="52" style="display:block;margin:0 auto;height:52px;width:auto;max-width:200px;border:0;" />
              <p style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:12px;color:${C.headerTagline};">${escapeHtml(contact.tagline)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;text-align:center;">
              <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;color:${C.label};text-transform:uppercase;letter-spacing:1.2px;">${escapeHtml(eyebrow)}</p>
              <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:24px;font-weight:700;color:${C.heading};letter-spacing:-0.03em;">${escapeHtml(headline)}</h1>
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.6;color:${C.body};">
                Hi <strong style="color:${C.heading};">${escapeHtml(customerName)}</strong>,
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;">
              ${attachmentBlock}
              ${detailsBlock}
              <p style="margin:0 0 20px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;color:${C.body};white-space:pre-wrap;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
              <p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;color:${C.label};text-transform:uppercase;letter-spacing:0.8px;text-align:center;">Need help?</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" style="padding-right:6px;vertical-align:top;">${whatsappButton}</td>
                  <td width="50%" style="padding-left:6px;vertical-align:top;">${callButton}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 24px 22px;background-color:${C.footerBg};border-top:1px solid ${C.border};">
              <p style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${C.heading};">${escapeHtml(brandName)}</p>
              <p style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:12px;color:${C.label};">${preventAutoLinkText(contact.phoneDisplay)} &middot; ${preventAutoLinkText(contact.email)}</p>
              <p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;color:${C.label};">${preventAutoLinkText(contact.website)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    subject,
    '',
    `Hi ${customerName},`,
    '',
    message,
    '',
    ...(options?.attachmentNames?.length
      ? ['Attachments:', ...options.attachmentNames.map((n) => `- ${n}`), '']
      : []),
    `WhatsApp: https://wa.me/${contact.whatsapp}`,
    `Phone: ${contact.phoneDisplay}`,
    `Email: ${contact.email}`,
    '',
    brandName,
  ];

  return { subject, html, text: textLines.join('\n') };
}

export function buildAdminEmail(
  templateType: AdminEmailTemplateType,
  bookingData: BookingConfirmationEmailData,
  documentData: AdminDocumentEmailData,
  options?: AdminEmailBuildOptions
): BookingConfirmationEmailResult {
  if (templateType === 'booking_confirmation') {
    return buildBookingConfirmationEmail(bookingData, {
      siteOrigin: options?.siteOrigin,
    });
  }
  return buildAdminDocumentEmail(templateType, documentData, options);
}

export function getDefaultDocumentMessage(type: AdminEmailTemplateType): string {
  switch (type) {
    case 'amc_document':
      return 'Please find your Annual Maintenance Contract attached. Review the terms and let us know if you have any questions.';
    case 'invoice':
      return 'Please find your tax invoice attached. Payment details are included in the document.';
    case 'quotation':
      return 'Please find our quotation attached. Contact us to confirm or if you need any changes.';
    case 'service_reminder':
      return 'This is a friendly reminder that your RO water purifier is due for service. Regular maintenance keeps your water safe and your purifier running smoothly.';
    case 'general':
      return 'Thank you for choosing us for your RO water purifier needs.';
    default:
      return SAMPLE_ADMIN_DOCUMENT_EMAIL.message;
  }
}

export { SAMPLE_BOOKING_CONFIRMATION_EMAIL };
