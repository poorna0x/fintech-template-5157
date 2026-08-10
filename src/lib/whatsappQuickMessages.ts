import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { resolveBookingCta, bookingCtaBookUrl } from '@/lib/whatsappBookingCtaTemplates';
import { resolveWaTemplateName } from '@/lib/whatsappTemplateResolve';
import {
  resolveColdAmcExpiry,
  resolveColdPartsReady,
  resolveColdTechDelayed,
} from '@/lib/whatsappUtilityTemplates';
import { waBrandBookingUrl, waLabeledLink, waLabeledValue } from '@/lib/whatsappMessageFormat';

export type WhatsAppQuickReplyContext = {
  customerName?: string;
  brand?: DocumentBrand;
  technicianName?: string;
  amount?: number | string;
  whenLabel?: string;
  jobRef?: string;
};

export type WhatsAppQuickReplyGroup = 'common' | 'request' | 'service' | 'payment';

export type WhatsAppQuickTextReply = {
  id: string;
  label: string;
  group: WhatsAppQuickReplyGroup;
  /** When true, tap sends immediately (inbox) instead of inserting into draft */
  instant?: boolean;
  text: (ctx: WhatsAppQuickReplyContext) => string;
};

export type WhatsAppQuickTemplateReply = {
  id: string;
  label: string;
  group: WhatsAppQuickReplyGroup;
  /** Meta template name (resolved via aliases at send time) */
  templateName: string;
  language: string;
  bodyParams: (ctx: WhatsAppQuickReplyContext) => string[];
  /** When true, one-click send is blocked until ctx.amount is set */
  needsAmount?: boolean;
};

export type WhatsAppQuickTemplateSend = {
  templateName: string;
  language: string;
  bodyParams: string[];
};

function cleanName(ctx: WhatsAppQuickReplyContext): string {
  return String(ctx.customerName || 'Customer').trim() || 'Customer';
}

function cleanAmount(ctx: WhatsAppQuickReplyContext): string {
  const raw = ctx.amount;
  if (raw == null || raw === '') return '';
  return (
    String(raw)
      .replace(/[^\d.]/g, '')
      .replace(/\.0+$/, '') || ''
  );
}

function brandLabel(ctx: WhatsAppQuickReplyContext): string {
  return getDocumentBrandLabel(ctx.brand || 'hydrogenro');
}

function brandInfo(ctx: WhatsAppQuickReplyContext) {
  return getCompanyInfoForBrand(ctx.brand || 'hydrogenro');
}

/** Free-form snippets — use inside the 24h customer-service window. */
export const WHATSAPP_QUICK_TEXT_REPLIES: WhatsAppQuickTextReply[] = [
  {
    id: 'thanks',
    label: 'Thanks',
    group: 'common',
    text: (ctx) => {
      const name = cleanName(ctx);
      const brand = brandLabel(ctx);
      return `Hi ${name},\n\nThank you for contacting ${brand}. How can we help you today?`;
    },
  },
  {
    id: 'thanks_send',
    label: 'Send thanks',
    group: 'common',
    instant: true,
    text: (ctx) => {
      const name = cleanName(ctx);
      const brand = brandLabel(ctx);
      return `Hi ${name}, thank you for contacting ${brand}. We'll assist you shortly on this chat.`;
    },
  },
  {
    id: 'received',
    label: 'Got your msg',
    group: 'common',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, we have received your message and will reply shortly on this chat.`,
  },
  {
    id: 'on_way',
    label: 'On the way',
    group: 'service',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, our technician is on the way to your location for the service visit.`,
  },
  {
    id: 'running_late',
    label: 'Running late',
    group: 'service',
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, our technician is slightly delayed but still on the way. Sorry for the inconvenience — we'll update you on this chat.`,
  },
  {
    id: 'confirm_visit',
    label: 'Confirm visit',
    group: 'service',
    text: (ctx) => {
      const when = String(ctx.whenLabel || '').trim() || 'your scheduled slot';
      return `Hi ${cleanName(ctx)}, confirming your ${brandLabel(ctx)} service visit for ${when}. Reply YES to confirm or tell us if you need to reschedule.`;
    },
  },
  {
    id: 'all_good',
    label: 'All OK?',
    group: 'service',
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, hope your water purifier is working fine after the recent service. Reply on this chat if you notice any issue — we're happy to help.`,
  },
  {
    id: 'share_location',
    label: 'Ask location',
    group: 'request',
    instant: true,
    text: () =>
      'Please share your Google Maps location pin on this chat so our technician can reach you easily.',
  },
  {
    id: 'share_photo',
    label: 'Ask photo',
    group: 'request',
    instant: true,
    text: () =>
      'Please share a clear photo of your water purifier (or the issue) on this chat so we can assist better.',
  },
  {
    id: 'share_model',
    label: 'Ask model',
    group: 'request',
    text: () =>
      'Please share your purifier brand & model (photo of the sticker/label helps) so we can bring the right spares.',
  },
  {
    id: 'book_online',
    label: 'Book link',
    group: 'service',
    text: (ctx) => {
      const info = brandInfo(ctx);
      const bookUrl = waBrandBookingUrl(info.website);
      return [
        `Hi ${cleanName(ctx)},`,
        '',
        `You can book your next ${brandLabel(ctx)} service here:`,
        waLabeledLink('📅', 'Book online', bookUrl),
        '',
        'Or reply on this chat with your preferred date & time.',
      ].join('\n');
    },
  },
  {
    id: 'spare_parts',
    label: 'Parts ordered',
    group: 'service',
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, we have ordered the required spare parts for your purifier. We'll update you when the technician visit is scheduled.`,
  },
  {
    id: 'pay_pending',
    label: 'Pay reminder',
    group: 'payment',
    text: (ctx) => {
      const info = brandInfo(ctx);
      const amt = cleanAmount(ctx);
      const lines = [
        `Hi ${cleanName(ctx)},`,
        '',
        amt
          ? `Friendly reminder: ₹${Number(amt).toLocaleString('en-IN')} is pending for your recent service.`
          : 'Friendly reminder: a payment is pending for your recent service.',
        '',
        'Reply on this chat and we will share payment details / UPI link.',
        waLabeledValue('📞', 'Phone', info.phone.split('&')[0].trim()),
      ];
      return lines.join('\n');
    },
  },
  {
    id: 'missed_call',
    label: 'Missed call',
    group: 'common',
    text: (ctx) => {
      const info = brandInfo(ctx);
      return `Hi ${cleanName(ctx)}, sorry we missed your call. Please reply on this chat or call us on ${info.phone.split('&')[0].trim()}.`;
    },
  },
  {
    id: 'callback_later',
    label: 'Call back',
    group: 'common',
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, thank you for your message. Our team will call you back shortly. For urgent RO issues, reply URGENT on this chat.`,
  },
  {
    id: 'working_on_it',
    label: 'Checking',
    group: 'common',
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, we're checking this and will update you shortly on this chat.`,
  },
];

/** Approved Meta UTILITY templates — one tap when 24h window is closed. */
export const WHATSAPP_QUICK_TEMPLATE_REPLIES: WhatsAppQuickTemplateReply[] = [
  {
    id: 'tpl_update',
    label: 'Service update',
    group: 'common',
    templateName: 'svc_smoke_update',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
  },
  {
    id: 'tpl_service_request',
    label: 'Service request',
    group: 'service',
    templateName: 'svc_service_request',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
  },
  {
    id: 'tpl_visit_reminder',
    label: 'Visit reminder',
    group: 'service',
    templateName: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (ctx) => [
      cleanName(ctx),
      String(ctx.whenLabel || '').trim() || 'your upcoming service visit',
    ],
  },
  {
    id: 'tpl_tech_assigned',
    label: 'Tech assigned',
    group: 'service',
    templateName: 'svc_tech_assigned',
    language: 'en',
    bodyParams: (ctx) => [
      cleanName(ctx),
      String(ctx.technicianName || '').trim() || 'our technician',
    ],
  },
  {
    id: 'tpl_job_done',
    label: 'Job done',
    group: 'service',
    templateName: 'svc_job_done',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx), cleanAmount(ctx) || '0'],
    needsAmount: true,
  },
  {
    id: 'tpl_balance_due',
    label: 'Balance due',
    group: 'payment',
    templateName: 'svc_balance_due',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx), cleanAmount(ctx) || '0'],
    needsAmount: true,
  },
  {
    id: 'tpl_payment_received',
    label: 'Payment thanks',
    group: 'payment',
    templateName: 'svc_payment_received',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx), cleanAmount(ctx) || '0'],
    needsAmount: true,
  },
  {
    id: 'tpl_amc_expiry',
    label: 'AMC expiry',
    group: 'service',
    templateName: 'svc_amc_expiry_notice',
    language: 'en',
    bodyParams: (ctx) => resolveColdAmcExpiry(cleanName(ctx), ctx.whenLabel || 'soon').bodyParams,
  },
  {
    id: 'tpl_parts_ready',
    label: 'Parts ready',
    group: 'service',
    templateName: 'svc_parts_ready',
    language: 'en',
    bodyParams: (ctx) => resolveColdPartsReady(cleanName(ctx)).bodyParams,
  },
  {
    id: 'tpl_tech_delayed',
    label: 'Tech delayed',
    group: 'service',
    templateName: 'svc_tech_delayed',
    language: 'en',
    bodyParams: (ctx) =>
      resolveColdTechDelayed(cleanName(ctx), ctx.whenLabel || 'your scheduled visit').bodyParams,
  },
];

/** Brand booking CTA — existing customer schedule (UTILITY). */
export function buildQuickBookVisitTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const brand = ctx.brand || 'hydrogenro';
  const cta = resolveBookingCta('book_existing_customer', brand, cleanName(ctx));
  return {
    templateName: resolveWaTemplateName(cta.name),
    language: cta.language,
    bodyParams: cta.bodyParams,
  };
}

/** Missed-call callback CTA (UTILITY). */
export function buildQuickMissedCallTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const brand = ctx.brand || 'hydrogenro';
  const cta = resolveBookingCta('missed_call_book', brand, cleanName(ctx));
  return {
    templateName: resolveWaTemplateName(cta.name),
    language: cta.language,
    bodyParams: cta.bodyParams,
  };
}

/** Brand booking confirmed (phone-only UTILITY). */
export function buildQuickBookingConfirmedTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const brand = ctx.brand || 'hydrogenro';
  const cta = resolveBookingCta(
    'booking_confirmed',
    brand,
    cleanName(ctx),
    ctx.jobRef || 'your booking',
    ctx.whenLabel || 'the scheduled time'
  );
  return {
    templateName: resolveWaTemplateName(cta.name),
    language: cta.language,
    bodyParams: cta.bodyParams,
  };
}

/** Reschedule visit CTA (UTILITY). */
export function buildQuickRescheduleTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const brand = ctx.brand || 'hydrogenro';
  const cta = resolveBookingCta(
    'reschedule_visit',
    brand,
    cleanName(ctx),
    ctx.whenLabel || 'your scheduled visit'
  );
  return {
    templateName: resolveWaTemplateName(cta.name),
    language: cta.language,
    bodyParams: cta.bodyParams,
  };
}

/** Unregistered number registration CTA (UTILITY). */
export function buildQuickUnregisteredTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const brand = ctx.brand || 'hydrogenro';
  const cta = resolveBookingCta('book_new_customer', brand, cleanName(ctx) || 'there');
  return {
    templateName: resolveWaTemplateName(cta.name),
    language: cta.language,
    bodyParams: cta.bodyParams,
  };
}

export function quickReplyBookingUrl(ctx: WhatsAppQuickReplyContext): string {
  const brand = ctx.brand || 'hydrogenro';
  return bookingCtaBookUrl(brand);
}

export function buildQuickTemplateSend(
  reply: WhatsAppQuickTemplateReply,
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  return {
    templateName: resolveWaTemplateName(reply.templateName),
    language: reply.language,
    bodyParams: reply.bodyParams(ctx),
  };
}

export function filterQuickTemplatesByApproved(
  replies: WhatsAppQuickTemplateReply[],
  approvedNames: Set<string> | null | undefined
): WhatsAppQuickTemplateReply[] {
  if (!approvedNames || approvedNames.size === 0) return replies;
  return replies.filter((r) => approvedNames.has(resolveWaTemplateName(r.templateName)));
}

export function isQuickTemplateReady(
  reply: WhatsAppQuickTemplateReply,
  ctx: WhatsAppQuickReplyContext
): boolean {
  if (!reply.needsAmount) return true;
  return Boolean(cleanAmount(ctx));
}

export function approvedTemplateNameSet(
  templates: Array<{ name: string }> | null | undefined
): Set<string> {
  return new Set((templates || []).map((t) => String(t.name || '').trim()).filter(Boolean));
}
