import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { buildJobCompletionLine } from '@/lib/job-completion-message';
import {
  buildBookingConfirmationEmail,
  buildEmailLogoHeaderBlock,
  getEmailLogoUrls,
  getEmailPhoneIconUrl,
  getEmailWhatsappIconUrl,
  SAMPLE_BOOKING_CONFIRMATION_EMAIL,
  type BookingConfirmationEmailData,
  type BookingConfirmationEmailResult,
} from '@/lib/booking-confirmation-email';
import {
  buildEmailForceLightHead,
  buildEmailForceLightBodyAttrs,
  EMAIL_PAGE_BG,
  EMAIL_CARD_BG,
  EMAIL_FOOTER_BG,
} from '@/lib/email-force-light-html';

export type AdminEmailTemplateType =
  | 'booking_confirmation'
  | 'amc_document'
  | 'warranty_document'
  | 'invoice'
  | 'quotation'
  | 'service_reminder'
  | 'job_completion'
  | 'general';

export interface AdminDocumentEmailData {
  documentBrand: DocumentBrand;
  customerName: string;
  documentRef: string;
  amount: string;
  dueDate: string;
  message: string;
  customSubject: string;
  /** job_completion template — rebuilds the completion line when the message is edited. */
  completionServiceType?: string;
  completionServiceSubType?: string;
}

export interface AdminEmailBuildOptions {
  siteOrigin?: string;
  attachmentNames?: string[];
  /** CRM iframe preview — load images from localhost /public instead of production. */
  allowLocalhostAssets?: boolean;
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
  warranty_document: {
    label: 'Warranty card',
    description: 'Send a warranty card PDF to the customer.',
    showDocumentRef: true,
    showAmount: false,
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
  job_completion: {
    label: 'Service completed',
    description: 'Confirmation after a job is completed — same message as the WhatsApp completion send.',
    showDocumentRef: true,
    showAmount: true,
    showDueDate: false,
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

export function createEmptyBookingForm(brand: DocumentBrand = 'elevenro'): BookingConfirmationEmailData {
  return {
    customerName: '',
    jobNumber: '',
    serviceType: '',
    serviceSubType: '',
    brand: '',
    model: '',
    scheduledDate: '',
    scheduledTimeSlot: 'FIRST_HALF',
    serviceAddress: '',
    phone: '',
    email: '',
    documentBrand: brand,
  };
}

export function createEmptyDocumentForm(brand: DocumentBrand = 'elevenro'): AdminDocumentEmailData {
  return {
    documentBrand: brand,
    customerName: '',
    documentRef: '',
    amount: '',
    dueDate: '',
    message: '',
    customSubject: '',
  };
}

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
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#bbf7d0',
  successText: '#15803d',
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
      <td class="email-detail-label" style="padding:11px 0;${border}font-family:${EMAIL_FONT};font-size:11px;width:34%;vertical-align:top;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;">${escapeHtml(label)}</td>
      <td class="email-detail-value" style="padding:11px 0 11px 12px;${border}font-family:${EMAIL_FONT};font-size:14px;font-weight:600;vertical-align:top;line-height:1.45;">${escapeHtml(value)}</td>
    </tr>`;
}

function actionButton(
  href: string,
  iconUrl: string,
  label: string,
  borderColor: string,
  textColor: string,
  bgColor: string,
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
          <td valign="middle" class="email-action-btn-label" style="font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${textColor};">${escapeHtml(label)}</td>
        </tr>
      </table>
    </a>`;
}

function formatCollectedAmountDisplay(amount: string): string {
  const trimmed = amount.trim();
  if (!trimmed) return '';
  if (trimmed.includes('₹')) return trimmed;
  const n = parseFloat(trimmed.replace(/[^\d.-]/g, ''));
  if (Number.isFinite(n) && n > 0) return `₹${n.toLocaleString('en-IN')}`;
  return trimmed;
}

function buildJobCompletionEmailBody(
  data: AdminDocumentEmailData,
  brand: DocumentBrand
): string {
  const brandName = getDocumentBrandLabel(brand);

  const completionLine =
    buildJobCompletionLine(data.completionServiceType || '', data.completionServiceSubType || '') ||
    'Your service has been completed successfully.';

  const messageLines = data.message
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const headline = messageLines[0] || completionLine;
  const note =
    messageLines.slice(1).join(' ') ||
    `Thank you for choosing ${brandName}. We appreciate your trust and hope you're satisfied with our work.`;

  const jobRef = data.documentRef.trim();
  const amountDisplay = formatCollectedAmountDisplay(data.amount);

  const jobRefBlock = jobRef
    ? `<p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;line-height:1.4;text-transform:uppercase;letter-spacing:0.6px;opacity:0.75;">Job reference</p>
                    <p style="margin:4px 0 0;font-family:${EMAIL_FONT};font-size:14px;font-weight:600;line-height:1.4;">${escapeHtml(jobRef)}</p>`
    : '';

  const amountBlock = amountDisplay
    ? `<p style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;line-height:1.4;text-transform:uppercase;letter-spacing:0.6px;opacity:0.75;">Amount collected</p>
                    <p style="margin:4px 0 0;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;line-height:1.3;">${escapeHtml(amountDisplay)}</p>`
    : '';

  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;">
                <tr>
                  <td align="center" valign="middle" width="52" height="52" class="email-success-icon" style="width:52px;height:52px;background-color:${C.successBg};border-radius:999px;font-family:${EMAIL_FONT};font-size:26px;font-weight:700;color:${C.success};line-height:52px;text-align:center;">
                    &#10003;
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-success-panel" style="background-color:${C.successBg};border:1px solid ${C.successBorder};border-radius:12px;margin-bottom:18px;">
                <tr>
                  <td style="padding:18px 20px;text-align:center;">
                    <p style="margin:0;font-family:${EMAIL_FONT};font-size:17px;font-weight:600;line-height:1.45;">${escapeHtml(headline)}</p>
                    ${jobRefBlock}
                    ${amountBlock}
                  </td>
                </tr>
              </table>
              <p class="email-body-text" style="margin:0 0 20px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;text-align:center;">${escapeHtml(note)}</p>`;
}

function attachmentNoticeBlock(names: string[]): string {
  if (!names.length) return '';
  const items = names.map((n) => `<li style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;">${escapeHtml(n)}</li>`).join('');
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-attachment-notice" style="border-radius:10px;margin-top:20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;">Attachments included</p>
                    <ul style="margin:0;padding-left:18px;">${items}</ul>
                  </td>
                </tr>
              </table>`;
}

function templateHeadline(type: AdminEmailTemplateType): string {
  switch (type) {
    case 'amc_document':
      return 'AMC Agreement';
    case 'warranty_document':
      return 'Warranty Card';
    case 'invoice':
      return 'Tax Invoice';
    case 'quotation':
      return 'Quotation';
    case 'service_reminder':
      return 'Service Reminder';
    case 'job_completion':
      return 'Service Completed';
    default:
      return 'Message';
  }
}

function templateEyebrow(type: AdminEmailTemplateType): string {
  switch (type) {
    case 'amc_document':
      return 'Annual maintenance';
    case 'warranty_document':
      return 'Your coverage';
    case 'invoice':
      return 'Billing';
    case 'quotation':
      return 'Estimate';
    case 'service_reminder':
      return 'Maintenance';
    case 'job_completion':
      return 'Job completion';
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
    case 'warranty_document':
      return ref ? `Warranty Card — ${brandLabel} (${ref})` : `Warranty Card — ${brandLabel}`;
    case 'invoice':
      return ref ? `Tax Invoice — ${brandLabel} (${ref})` : `Tax Invoice — ${brandLabel}`;
    case 'quotation':
      return ref ? `Quotation — ${brandLabel} (${ref})` : `Quotation — ${brandLabel}`;
    case 'service_reminder':
      return `RO Service Reminder — ${brandLabel}`;
    case 'job_completion':
      return ref ? `Service Completed — ${brandLabel} (${ref})` : `Service Completed — ${brandLabel}`;
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
      type === 'invoice'
        ? 'Invoice no.'
        : type === 'quotation'
          ? 'Quote no.'
          : type === 'job_completion'
            ? 'Job no.'
            : type === 'warranty_document'
              ? 'Card no.'
              : 'Reference';
    rows.push(detailRow(refLabel, data.documentRef.trim()));
  }
  if (meta.showAmount && data.amount.trim()) {
    rows.push(detailRow('Amount', data.amount.trim()));
  }
  if (meta.showDueDate && data.dueDate.trim()) {
    const dueLabel =
      type === 'service_reminder'
        ? 'Suggested date'
        : type === 'warranty_document'
          ? 'Latest coverage until'
          : 'Valid / due date';
    rows.push(detailRow(dueLabel, formatDisplayDate(data.dueDate.trim()), true));
  }
  if (!rows.length) return '';
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-details" style="background-color:${C.detailsBg};border:1px solid ${C.border};border-radius:12px;border-left:3px solid ${C.heading};margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px 6px;">
                    <p class="email-details-title" style="margin:0;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;">Details</p>
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
  const brand = data.documentBrand;
  const assetOriginOpts = { allowLocalhost: options?.allowLocalhostAssets, brand };
  const siteOrigin = options?.siteOrigin;
  const brandName = getDocumentBrandLabel(brand);
  const contact = BRAND_CONTACT[brand];
  const logoUrls = getEmailLogoUrls(siteOrigin, brand, assetOriginOpts);
  const whatsappIconUrl = getEmailWhatsappIconUrl(siteOrigin, brand, assetOriginOpts);
  const phoneIconUrl = getEmailPhoneIconUrl(siteOrigin, brand, assetOriginOpts);
  const customerName = data.customerName.trim() || 'Customer';
  const message = data.message.trim();
  const headline = templateHeadline(type);
  const eyebrow = templateEyebrow(type);
  const meta = ADMIN_EMAIL_TEMPLATE_META[type];
  const subject = buildSubject(type, brandName, data);
  const detailsBlock =
    type === 'job_completion' ? '' : buildDetailsRows(type, data, meta);
  const attachmentBlock = attachmentNoticeBlock(options?.attachmentNames || []);
  const messageBlock =
    type === 'job_completion'
      ? buildJobCompletionEmailBody(data, brand)
      : `<p class="email-body-text" style="margin:0 0 20px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;

  const whatsappButton = actionButton(
    `https://wa.me/${contact.whatsapp}`,
    whatsappIconUrl,
    'WhatsApp',
    '#86efac',
    '#15803d',
    '#f0fdf4',
    'whatsapp'
  );
  const callButton = actionButton(
    `tel:${contact.phoneTel}`,
    phoneIconUrl,
    'Call us',
    C.border,
    C.heading,
    '#fafafa',
    'call'
  );

  const html = `<!DOCTYPE html>
<html lang="en" style="color-scheme:light dark;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, email=no, address=no">
  <title>${escapeHtml(subject)}</title>
  ${buildEmailForceLightHead()}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body ${buildEmailForceLightBodyAttrs(`background-color:${C.pageBg};font-family:${EMAIL_FONT};`)}>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-page" bgcolor="${EMAIL_PAGE_BG}" style="background-color:${C.pageBg};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-force-light-card" bgcolor="${EMAIL_CARD_BG}" style="max-width:560px;background-color:${C.cardBg};border:1px solid ${C.border};border-radius:14px;overflow:hidden;box-shadow:${C.cardShadow};">
          <tr>
            <td align="center" class="email-force-light-header" bgcolor="${EMAIL_CARD_BG}" style="padding:28px 28px 22px;background-color:${C.cardBg};border-bottom:1px solid ${C.border};">
              ${buildEmailLogoHeaderBlock(logoUrls, brandName)}
            </td>
          </tr>
          <tr>
            <td class="email-force-light-body" bgcolor="${EMAIL_CARD_BG}" style="padding:28px 28px 8px;text-align:center;background-color:${C.cardBg};">
              <p class="email-force-light-muted" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;">${escapeHtml(eyebrow)}</p>
              <h1 class="email-force-light-heading" style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:24px;font-weight:700;letter-spacing:-0.03em;">${escapeHtml(headline)}</h1>
              <p class="email-body-text" style="margin:0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.6;">
                Hi <strong class="email-text-strong">${escapeHtml(customerName)}</strong>,
              </p>
            </td>
          </tr>
          <tr>
            <td class="email-force-light-body" bgcolor="${EMAIL_CARD_BG}" style="padding:8px 28px 24px;background-color:${C.cardBg};">
              ${type === 'job_completion' ? messageBlock : `${detailsBlock}${messageBlock}`}
              <p class="email-section-label" style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;text-align:center;">Need help?</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" style="padding-right:6px;vertical-align:top;">${whatsappButton}</td>
                  <td width="50%" style="padding-left:6px;vertical-align:top;">${callButton}</td>
                </tr>
              </table>
              ${attachmentBlock}
            </td>
          </tr>
          <tr>
            <td align="center" class="email-force-light-footer" bgcolor="${EMAIL_FOOTER_BG}" style="padding:18px 24px 22px;background-color:${C.footerBg};border-top:1px solid ${C.border};">
              <p class="email-details-title" style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;text-align:center;">${escapeHtml(brandName)}</p>
              <p class="email-footer-muted" style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:12px;text-align:center;">${preventAutoLinkText(contact.phoneDisplay)} &middot; ${preventAutoLinkText(contact.email)}</p>
              <p class="email-footer-muted" style="margin:0;font-family:${EMAIL_FONT};font-size:11px;text-align:center;">${preventAutoLinkText(contact.website)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines =
    type === 'job_completion'
      ? [
          subject,
          '',
          `Hi ${customerName},`,
          '',
          buildJobCompletionLine(data.completionServiceType || '', data.completionServiceSubType || '') ||
            message.split('\n')[0]?.trim() ||
            'Your service has been completed successfully.',
          ...(data.documentRef.trim() ? [`Job reference: ${data.documentRef.trim()}`] : []),
          ...(data.amount.trim()
            ? [`Amount collected: ${formatCollectedAmountDisplay(data.amount)}`]
            : []),
          '',
          message.split('\n').slice(1).join(' ').trim() ||
            `Thank you for choosing ${brandName}. We appreciate your trust.`,
          '',
          `WhatsApp: https://wa.me/${contact.whatsapp}`,
          `Phone: ${contact.phoneDisplay}`,
          `Email: ${contact.email}`,
          '',
          brandName,
        ]
      : [
          subject,
          '',
          `Hi ${customerName},`,
          '',
          message,
          '',
          `WhatsApp: https://wa.me/${contact.whatsapp}`,
          `Phone: ${contact.phoneDisplay}`,
          `Email: ${contact.email}`,
          ...(options?.attachmentNames?.length
            ? ['', 'Attachments:', ...options.attachmentNames.map((n) => `- ${n}`)]
            : []),
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
      allowLocalhostAssets: options?.allowLocalhostAssets,
    });
  }
  return buildAdminDocumentEmail(templateType, documentData, options);
}

export function getDefaultDocumentMessage(type: AdminEmailTemplateType): string {
  switch (type) {
    case 'amc_document':
      return 'Please find your Annual Maintenance Contract attached. Review the terms and let us know if you have any questions.';
    case 'warranty_document':
      return 'Please find your RO warranty card attached. Keep it safe and present it when you need warranty service.';
    case 'invoice':
      return 'Please find your tax invoice attached. Payment details are included in the document.';
    case 'quotation':
      return 'Please find our quotation attached. Contact us to confirm or if you need any changes.';
    case 'service_reminder':
      return 'This is a friendly reminder that your RO water purifier is due for service. Regular maintenance keeps your water safe and your purifier running smoothly.';
    case 'job_completion':
      return 'Your service has been completed successfully.\n\nThank you for choosing us. We appreciate your trust.';
    case 'general':
      return 'Thank you for choosing us for your RO water purifier needs.';
    default:
      return SAMPLE_ADMIN_DOCUMENT_EMAIL.message;
  }
}

export { SAMPLE_BOOKING_CONFIRMATION_EMAIL };
