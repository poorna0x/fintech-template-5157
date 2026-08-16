import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { resolveBookingCta, bookingCtaBookUrl } from '@/lib/whatsappBookingCtaTemplates';
import { resolveWaTemplateName } from '@/lib/whatsappTemplateResolve';
import {
  resolveColdAmcExpiry,
  resolveColdMissedCall,
  resolveColdPartsReady,
  resolveColdTechDelayed,
  resolveColdVisitCancelled,
} from '@/lib/whatsappUtilityTemplates';
import {
  buildPendingPaymentLetterBodyParams,
  pendingPaymentTemplateFallbackNames,
  resolvePendingPaymentLetterTemplateName,
  resolvePendingPaymentOverdueTemplateName,
} from '@/lib/pendingPaymentReminder';
import { waBrandBookingUrl, waLabeledLink, waLabeledValue } from '@/lib/whatsappMessageFormat';
import { brandLetterClosingLines } from '@/lib/whatsappBrandContact';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

export type WhatsAppQuickReplyContext = {
  customerName?: string;
  brand?: DocumentBrand;
  /** Lead source label — Quick customer / Tools flows. */
  leadSource?: string;
  /** When true, ask templates use generic "Water Filter Service" (no Eleven/Hydrogen). */
  skipBrandLabel?: boolean;
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
  /** Pick brand-specific Meta name at send time (e.g. svc_wfs_hello_hro). */
  resolveTemplateName?: (ctx: WhatsAppQuickReplyContext) => string;
  /** When true, one-click send is blocked until ctx.amount is set */
  needsAmount?: boolean;
};

export type WhatsAppQuickTemplateSend = {
  templateName: string;
  language: string;
  bodyParams: string[];
};

function cleanName(ctx: WhatsAppQuickReplyContext): string {
  return whatsappGreetingName(ctx.customerName, 'there');
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

/** {{2}} for ask templates — brand Water Filter Service, or generic if skipBrandLabel. */
export function waterFilterServiceFromLabel(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'Water Filter Service';
  return `${getDocumentBrandLabel(ctx.brand)} Water Filter Service`;
}

/** Cold hello — Hydrogen / Eleven / generic Water Filter Service. */
export function resolveWfsHelloTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_hello_v3';
  return ctx.brand === 'elevenro' ? 'svc_wfs_hello_ero_v2' : 'svc_wfs_hello_hro_v2';
}

/** Short cold hello — “hi from … Water Filter Service”. */
export function resolveWfsSimpleHiTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_hi_v3';
  return ctx.brand === 'elevenro' ? 'svc_wfs_hi_ero_v2' : 'svc_wfs_hi_hro_v2';
}

/** Minimal cold hello — “Just Hi”. */
export function resolveWfsJustHiTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_just_hi_v3';
  return ctx.brand === 'elevenro' ? 'svc_wfs_just_hi_ero_v3' : 'svc_wfs_just_hi_hro_v3';
}

/** @deprecated Prefer resolveWfsHelloTemplateName — “Hi from” templates removed. */
export function resolveWfsHiFromTemplateName(ctx: WhatsAppQuickReplyContext): string {
  return resolveWfsHelloTemplateName(ctx);
}

export function wfsJustHiFallbackNames(): string[] {
  return [
    'svc_wfs_just_hi_v3',
    'svc_wfs_just_hi_hro_v3',
    'svc_wfs_just_hi_ero_v3',
    'svc_hello',
    'svc_smoke_update',
  ];
}

export function wfsHiFromFallbackNames(): string[] {
  return wfsHelloFallbackNames();
}

export function isWfsGreetingTemplateName(name: string): boolean {
  return /^(svc_wfs_hello|svc_wfs_hi|svc_wfs_just_hi|svc_wfs_hi_from)/i.test(String(name || '').trim());
}

export function wfsGreetingFallbackNames(): string[] {
  return [
    ...wfsJustHiFallbackNames(),
    ...wfsHiFromFallbackNames(),
    ...wfsHelloFallbackNames(),
  ];
}

export function wfsSimpleHiFallbackNames(): string[] {
  return ['svc_wfs_hi_hro_v2', 'svc_wfs_hi_ero_v2', 'svc_wfs_hello_v3'];
}

export function wfsHelloFallbackNames(): string[] {
  return [
    ...wfsSimpleHiFallbackNames(),
    'svc_wfs_hello_hro_v2',
    'svc_wfs_hello_ero_v2',
    'svc_wfs_hello_v3',
    'svc_hello',
    'svc_smoke_update',
  ];
}

/** Cold collect info (location + photo) — brand variants. */
export function resolveWfsCollectTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_collect';
  return ctx.brand === 'elevenro' ? 'svc_wfs_collect_ero' : 'svc_wfs_collect_hro';
}

export function wfsCollectFallbackNames(): string[] {
  return [
    'svc_wfs_collect',
    'svc_wfs_collect_hro',
    'svc_wfs_collect_ero',
    ...askLocationTemplateFallbackNames(),
    'svc_smoke_update',
  ];
}

/** Ask name option 1 (short) — prefer UTILITY v2 where Meta flagged “Hi from”. */
export function resolveWfsAskNameTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_ask_name_simple_v2';
  return ctx.brand === 'elevenro'
    ? 'svc_wfs_ask_name_simple_ero_v2'
    : 'svc_wfs_ask_name_simple_hro_v2';
}

/** Longer ask-name copy (option 2) — UTILITY v2 (avoid “Hi from”). */
export function resolveWfsAskNameLongTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_ask_name_v2';
  return ctx.brand === 'elevenro' ? 'svc_wfs_ask_name_ero_v2' : 'svc_wfs_ask_name_hro_v2';
}

export function askNameTemplateFallbackNames(): string[] {
  // Prefer UTILITY v2 only — Meta reclassifies “Hi from …” *_v1 as MARKETING
  return [
    'svc_wfs_ask_name_simple_hro_v2',
    'svc_wfs_ask_name_simple_ero_v2',
    'svc_wfs_ask_name_simple_v2',
    'svc_wfs_ask_name_hro_v2',
    'svc_wfs_ask_name_ero_v2',
    'svc_wfs_ask_name_v2',
  ];
}

export function isAskNameTemplateName(name: string): boolean {
  return /^svc_wfs_ask_name(_simple)?(_(hro|ero))?(_v\d+)?$/i.test(String(name || '').trim());
}

/** Cold ask location — plain UTILITY (no Share location QR). Reply → Send location once. */
export function resolveWfsAskLocTemplateName(_ctx: WhatsAppQuickReplyContext): string {
  return 'svc_ask_location';
}

/** Shorter cold ask location — same no-QR path. */
export function resolveWfsAskLocSimpleTemplateName(_ctx: WhatsAppQuickReplyContext): string {
  return 'svc_ask_location';
}

export function isAskLocationTemplateName(name: string): boolean {
  const n = String(name || '').trim();
  if (/ask_loc_flat_photo/i.test(n)) return false;
  return n === 'svc_ask_location' || /^svc_wfs_ask_loc/i.test(n);
}

export function askLocationTemplateFallbackNames(): string[] {
  return [
    'svc_ask_location',
    'svc_wfs_ask_loc_from_v1',
    'svc_wfs_ask_loc_from_hro_v1',
    'svc_wfs_ask_loc_from_ero_v1',
    'svc_wfs_ask_loc_v3',
    'svc_wfs_ask_loc_hro_v3',
    'svc_wfs_ask_loc_ero_v3',
    'svc_wfs_ask_loc_simple_v3',
    'svc_wfs_ask_loc_simple_hro_v3',
    'svc_wfs_ask_loc_simple_ero_v3',
  ];
}

export function resolveWfsAskLocFlatPhotoTemplateName(ctx: WhatsAppQuickReplyContext): string {
  if (ctx.skipBrandLabel || !ctx.brand) return 'svc_wfs_ask_loc_flat_photo_v1';
  return ctx.brand === 'elevenro'
    ? 'svc_wfs_ask_loc_flat_photo_ero_v1'
    : 'svc_wfs_ask_loc_flat_photo_hro_v1';
}

export function askLocFlatPhotoFallbackNames(): string[] {
  return [
    'svc_wfs_ask_loc_flat_photo_hro_v1',
    'svc_wfs_ask_loc_flat_photo_ero_v1',
    'svc_wfs_ask_loc_flat_photo_v1',
    ...askLocationTemplateFallbackNames(),
  ];
}

function waterFilterServiceOrInstallFromLabel(ctx: WhatsAppQuickReplyContext): string {
  return `${waterFilterServiceFromLabel(ctx)} or Installation`;
}

export function wfsAskLocFlatPhotoText(ctx: WhatsAppQuickReplyContext): string {
  return [
    `Hi ${cleanName(ctx)}, 👋`,
    '',
    `from ${waterFilterServiceOrInstallFromLabel(ctx)}.`,
    '',
    'Please share all of these on this chat:',
    '1) Your Google Maps location pin',
    '2) Your flat / house number',
    '3) A photo of the front of the purifier',
  ].join('\n');
}

function brandInfo(ctx: WhatsAppQuickReplyContext) {
  return getCompanyInfoForBrand(ctx.brand || 'hydrogenro');
}

/** Free-form snippets — use inside the 24h customer-service window. */
export const WHATSAPP_QUICK_TEXT_REPLIES: WhatsAppQuickTextReply[] = [
  // —— Ask (one-tap send) ——
  {
    id: 'wfs_just_hi',
    label: 'Just Hi',
    group: 'common',
    instant: true,
    text: (ctx) => `Hi ${cleanName(ctx)}. Please reply on this chat.`,
  },
  {
    id: 'wfs_hello',
    label: 'WFS Hi',
    group: 'common',
    instant: true,
    text: (ctx) => {
      const who = waterFilterServiceFromLabel(ctx);
      return `Hi ${cleanName(ctx)}, this is ${who}. Please reply on this chat if you need help with your water purifier.`;
    },
  },
  {
    id: 'wfs_collect',
    label: 'WFS collect info',
    group: 'request',
    instant: true,
    text: (ctx) => {
      const who = waterFilterServiceFromLabel(ctx);
      return [
        `Hi ${cleanName(ctx)}, this is ${who}.`,
        'For serving you better we need certain information from you — such as your location and a photo of your purifier.',
        'Please share your location here on this chat; we will guide you step by step.',
        '',
        'Tap Send location below when the button appears.',
      ].join('\n');
    },
  },
  {
    id: 'share_location',
    label: 'Ask location',
    group: 'request',
    instant: true,
    text: (ctx) => {
      const who = waterFilterServiceFromLabel(ctx);
      return [
        `Hi ${cleanName(ctx)}, 👋`,
        '',
        `from ${who}.`,
        '',
        '📍 To serve you better we need your exact location. Please share your Google Maps location pin on this chat.',
        '',
        'Tap Send location below 👇',
      ].join('\n');
    },
  },
  {
    id: 'share_location_lead',
    label: 'Ask loc (lead)',
    group: 'request',
    instant: true,
    text: (ctx) => {
      const ls = String(ctx.leadSource || '').trim();
      const brandShort =
        ctx.skipBrandLabel || !ctx.brand
          ? ''
          : ctx.brand === 'elevenro'
            ? 'Eleven RO'
            : 'Hydrogen RO';
      const lines = [`Hi ${cleanName(ctx)}, 👋`, ''];
      if (ls && brandShort) {
        lines.push(`from ${ls} - ${brandShort} Water Filter Service.`, '');
      } else if (ls) {
        lines.push(`from ${ls} - Water Filter Service.`, '');
      } else if (brandShort) {
        lines.push(`from ${brandShort} Water Filter Service.`, '');
      } else {
        lines.push('from Water Filter Service.', '');
      }
      lines.push(
        '📍 To serve you better we need your exact location. Please share your Google Maps location pin on this chat.',
        '',
        'Tap Send location below when the button appears.'
      );
      return lines.join('\n');
    },
  },
  {
    id: 'share_flat',
    label: 'Ask flat no',
    group: 'request',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, please reply with your building / flat / house number (e.g. Flat 302, Block B).\n\nIf you don’t have one, tap Skip below.`,
  },
  {
    id: 'ask_name',
    label: 'Ask name',
    group: 'request',
    instant: true,
    text: (ctx) => {
      const who = waterFilterServiceFromLabel(ctx);
      return [
        `This is ${who}. 👋`,
        '',
        'Please share your full name on this chat so we can continue your water purifier service request.',
      ].join('\n');
    },
  },
  {
    id: 'ask_name_long',
    label: 'Ask name (long)',
    group: 'request',
    instant: true,
    text: (ctx) => {
      const who = waterFilterServiceFromLabel(ctx);
      return [
        `This is ${who}. 👋`,
        '',
        'Please reply with your full name on this chat so we can continue your water purifier service request.',
      ].join('\n');
    },
  },
  {
    id: 'share_photo',
    label: 'Ask photo',
    group: 'request',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, please send a clear photo of your water purifier (label / unit) on this chat so we can assist better.`,
  },
  {
    id: 'share_loc_photo',
    label: 'Ask loc+flat+photo',
    group: 'request',
    instant: true,
    text: (ctx) => wfsAskLocFlatPhotoText(ctx),
  },
  {
    id: 'share_model',
    label: 'Ask model',
    group: 'request',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, please share your purifier brand & model (a photo of the sticker/label helps) so we can bring the right spares.`,
  },
  {
    id: 'ask_preferred_time',
    label: 'Ask time',
    group: 'request',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, what date and time works for your service visit? (We usually visit between 9:00 AM and 5:00 PM.)`,
  },
  {
    id: 'ask_issue',
    label: 'Ask issue',
    group: 'request',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, please briefly describe the issue with your purifier (e.g. no water, low flow, leakage, taste/smell).`,
  },
  // —— Common / service ——
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
    id: 'working_on_it',
    label: 'Checking',
    group: 'common',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, we're checking this and will update you shortly on this chat.`,
  },
  {
    id: 'callback_later',
    label: 'Call back',
    group: 'common',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, thank you for your message. Our team will call you back shortly. For urgent RO issues, reply URGENT on this chat.`,
  },
  {
    id: 'missed_call',
    label: 'Missed call',
    group: 'common',
    instant: true,
    text: (ctx) => {
      const info = brandInfo(ctx);
      const label = getDocumentBrandLabel(ctx.brand || 'hydrogenro');
      return `Hi ${cleanName(ctx)}, this is ${label}. We received your incoming call and could not answer. We will return your call to continue your water purifier service. Reply here if you need to add any details. Or call us on ${info.phone.split('&')[0].trim()}.`;
    },
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
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, our technician is slightly delayed but still on the way. Sorry for the inconvenience — we'll update you on this chat.`,
  },
  {
    id: 'confirm_visit',
    label: 'Confirm visit',
    group: 'service',
    instant: true,
    text: (ctx) => {
      const when = String(ctx.whenLabel || '').trim() || 'your scheduled slot';
      return `Hi ${cleanName(ctx)}, confirming your ${brandLabel(ctx)} service visit for ${when}. Reply YES to confirm or tell us if you need to reschedule.`;
    },
  },
  {
    id: 'visit_done',
    label: 'Visit done',
    group: 'service',
    instant: true,
    text: (ctx) =>
      `Hi ${cleanName(ctx)}, thank you — your service visit is complete. If anything needs attention, just reply on this chat.`,
  },
  {
    id: 'visit_confirmed_text',
    label: 'Visit confirmed',
    group: 'service',
    instant: true,
    text: (ctx) => {
      const when = String(ctx.whenLabel || '').trim() || 'your scheduled slot';
      const ref = String(ctx.jobRef || '').trim();
      const brand = ctx.brand || 'hydrogenro';
      const brandName = brandLabel(ctx);
      return [
        `Hi ${cleanName(ctx)}, 👋`,
        `This is an update from ${brandName} regarding your service booking. ✅`,
        '',
        `📋 Booking: ${ref || 'your booking'}`,
        `📅 Confirmed for: ${when}`,
        '',
        ...brandLetterClosingLines(brand, { skipChatHint: true, includeTextUs: false }),
        '',
        '💬 Reply on this chat if you need to change the date or time.',
      ].join('\n');
    },
  },
  {
    id: 'booking_cancelled_text',
    label: 'Booking cancelled',
    group: 'service',
    instant: true,
    text: (ctx) => {
      const when = String(ctx.whenLabel || '').trim() || 'your scheduled visit';
      const brand = ctx.brand || 'hydrogenro';
      return [
        `Hi ${cleanName(ctx)},`,
        `This is an update from ${brandLabel(ctx)} regarding your water purifier service booking.`,
        '',
        `Your booking for ${when} has been cancelled.`,
        '',
        ...brandLetterClosingLines(brand, { includeTextUs: false }),
        '',
        'Reply on this chat if you need any help.',
      ].join('\n');
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
];

export function quickTextRepliesByGroup(group: WhatsAppQuickReplyGroup) {
  return WHATSAPP_QUICK_TEXT_REPLIES.filter((r) => r.group === group);
}

/** Approved Meta UTILITY templates — one tap when 24h window is closed. */
export const WHATSAPP_QUICK_TEMPLATE_REPLIES: WhatsAppQuickTemplateReply[] = [
  {
    id: 'tpl_wfs_just_hi',
    label: 'Just Hi',
    group: 'common',
    templateName: 'svc_wfs_just_hi_hro',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
    resolveTemplateName: (ctx) => resolveWfsJustHiTemplateName(ctx),
  },
  {
    id: 'tpl_wfs_hello',
    label: 'WFS Hi',
    group: 'common',
    templateName: 'svc_wfs_hello_hro',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
    resolveTemplateName: (ctx) => resolveWfsHelloTemplateName(ctx),
  },
  {
    id: 'tpl_wfs_collect',
    label: 'WFS collect',
    group: 'request',
    templateName: 'svc_wfs_collect_hro',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
    resolveTemplateName: (ctx) => resolveWfsCollectTemplateName(ctx),
  },
  {
    id: 'tpl_hello',
    label: 'Hello',
    group: 'common',
    templateName: 'svc_hello',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
  },
  {
    id: 'tpl_ask_location',
    label: 'Ask location',
    group: 'request',
    templateName: 'svc_ask_location',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx), waterFilterServiceFromLabel(ctx)],
    resolveTemplateName: (ctx) => resolveWfsAskLocTemplateName(ctx),
  },
  {
    id: 'tpl_ask_loc_flat_photo',
    label: 'Ask loc+flat+photo',
    group: 'request',
    templateName: 'svc_wfs_ask_loc_flat_photo_hro_v1',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx)],
    resolveTemplateName: (ctx) => resolveWfsAskLocFlatPhotoTemplateName(ctx),
  },
  {
    id: 'tpl_ask_photo',
    label: 'Ask photo',
    group: 'request',
    templateName: 'svc_ask_photo',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx), waterFilterServiceFromLabel(ctx)],
  },
  {
    id: 'tpl_ask_flat',
    label: 'Ask flat no',
    group: 'request',
    templateName: 'svc_ask_flat',
    language: 'en',
    bodyParams: (ctx) => [cleanName(ctx), waterFilterServiceFromLabel(ctx)],
  },
  {
    id: 'tpl_ask_name',
    label: 'Ask name',
    group: 'request',
    templateName: 'svc_wfs_ask_name_simple_hro_v2',
    language: 'en',
    bodyParams: () => [],
    resolveTemplateName: (ctx) => resolveWfsAskNameTemplateName(ctx),
  },
  {
    id: 'tpl_ask_name_long',
    label: 'Ask name (long)',
    group: 'request',
    templateName: 'svc_wfs_ask_name_hro_v2',
    language: 'en',
    bodyParams: () => [],
    resolveTemplateName: (ctx) => resolveWfsAskNameLongTemplateName(ctx),
  },
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
    templateName: 'svc_balance_due_letter_hro_v9',
    language: 'en',
    resolveTemplateName: (ctx) =>
      resolvePendingPaymentLetterTemplateName(ctx.brand || 'hydrogenro', { withPayButton: true }),
    bodyParams: (ctx) =>
      buildPendingPaymentLetterBodyParams(
        cleanName(ctx),
        cleanAmount(ctx) || '0',
        ctx.whenLabel || null,
        ctx.jobRef || null
      ),
    needsAmount: true,
  },
  {
    id: 'tpl_payment_overdue',
    label: 'Payment overdue',
    group: 'payment',
    templateName: 'svc_payment_overdue_notice_hro_v3',
    language: 'en',
    resolveTemplateName: (ctx) =>
      resolvePendingPaymentOverdueTemplateName(
        (ctx.brand === 'elevenro' ? 'elevenro' : 'hydrogenro') as 'hydrogenro' | 'elevenro'
      ),
    bodyParams: (ctx) =>
      buildPendingPaymentLetterBodyParams(
        cleanName(ctx),
        cleanAmount(ctx) || '0',
        ctx.whenLabel || null,
        ctx.jobRef || null
      ),
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
  {
    id: 'tpl_missed_call',
    label: 'Missed call',
    group: 'common',
    templateName: 'svc_missed_call',
    language: 'en',
    bodyParams: (ctx) => resolveColdMissedCall(cleanName(ctx), ctx.brand).bodyParams,
  },
];

/** Hello / open-chat UTILITY — prefers short WFS hi, then full WFS hello, then svc_hello. */
export function buildQuickHelloTemplate(
  ctx: WhatsAppQuickReplyContext,
  approvedTemplateNames?: Set<string> | null
): WhatsAppQuickTemplateSend {
  const approved = approvedTemplateNames;
  const hasSimple =
    !approved?.size || wfsSimpleHiFallbackNames().some((n) => approved.has(n));
  if (hasSimple) {
    return {
      templateName: resolveWfsSimpleHiTemplateName(ctx),
      language: 'en',
      bodyParams: [cleanName(ctx)],
    };
  }
  const hasWfs =
    !approved?.size || wfsHelloFallbackNames().some((n) => approved.has(n));
  if (hasWfs) {
    return {
      templateName: resolveWfsHelloTemplateName(ctx),
      language: 'en',
      bodyParams: [cleanName(ctx)],
    };
  }
  const preferHello = !approved?.size || approved.has('svc_hello');
  return {
    templateName: preferHello ? 'svc_hello' : 'svc_smoke_update',
    language: 'en',
    bodyParams: [cleanName(ctx)],
  };
}

export function buildQuickWfsSimpleHiTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  return {
    templateName: resolveWfsSimpleHiTemplateName(ctx),
    language: 'en',
    bodyParams: [cleanName(ctx)],
  };
}

export function buildQuickWfsCollectTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  return {
    templateName: resolveWfsCollectTemplateName(ctx),
    language: 'en',
    bodyParams: [cleanName(ctx)],
  };
}

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

/** Missed-call UTILITY (svc_missed_call). */
export function buildQuickMissedCallTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const cold = resolveColdMissedCall(cleanName(ctx), ctx.brand);
  return {
    templateName: cold.name,
    language: cold.languageCode,
    bodyParams: cold.bodyParams,
  };
}

/** Brand booking confirmed (Call + Website v2). */
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

/** Booking / visit cancelled (Call + Website + Book v2). */
export function buildQuickBookingCancelledTemplate(
  ctx: WhatsAppQuickReplyContext
): WhatsAppQuickTemplateSend {
  const brand = ctx.brand || 'hydrogenro';
  const cold = resolveColdVisitCancelled(
    brand,
    cleanName(ctx),
    ctx.whenLabel || 'your scheduled visit'
  );
  return {
    templateName: cold.name,
    language: cold.languageCode,
    bodyParams: cold.bodyParams,
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
  const rawName = reply.resolveTemplateName?.(ctx) ?? reply.templateName;
  return {
    templateName: resolveWaTemplateName(rawName),
    language: reply.language,
    bodyParams: reply.bodyParams(ctx),
  };
}

export function filterQuickTemplatesByApproved(
  replies: WhatsAppQuickTemplateReply[],
  approvedNames: Set<string> | null | undefined
): WhatsAppQuickTemplateReply[] {
  if (!approvedNames || approvedNames.size === 0) return replies;
  return replies.filter((r) => {
    if (r.id === 'tpl_wfs_just_hi') {
      return wfsJustHiFallbackNames().some((n) => approvedNames.has(resolveWaTemplateName(n)));
    }
    if (r.id === 'tpl_wfs_hello') {
      return wfsHelloFallbackNames().some((n) => approvedNames.has(resolveWaTemplateName(n)));
    }
    if (r.id === 'tpl_wfs_collect') {
      return wfsCollectFallbackNames().some((n) => approvedNames.has(resolveWaTemplateName(n)));
    }
    if (r.id === 'tpl_ask_location') {
      return askLocationTemplateFallbackNames().some((n) =>
        approvedNames.has(resolveWaTemplateName(n))
      );
    }
    if (r.id === 'tpl_ask_loc_flat_photo') {
      return askLocFlatPhotoFallbackNames().some((n) =>
        approvedNames.has(resolveWaTemplateName(n))
      );
    }
    if (r.id === 'tpl_ask_name') {
      return askNameTemplateFallbackNames().some((n) =>
        approvedNames.has(resolveWaTemplateName(n))
      );
    }
    if (r.id === 'tpl_ask_name_long') {
      return [
        'svc_wfs_ask_name_hro_v2',
        'svc_wfs_ask_name_ero_v2',
        'svc_wfs_ask_name_v2',
        'svc_wfs_ask_name_hro_v1',
        'svc_wfs_ask_name_ero_v1',
        'svc_wfs_ask_name_v1',
      ].some((n) => approvedNames.has(resolveWaTemplateName(n)));
    }
    if (r.id === 'tpl_balance_due') {
      return (['hydrogenro', 'elevenro'] as const).some((brand) =>
        pendingPaymentTemplateFallbackNames(brand).some((n) =>
          approvedNames.has(resolveWaTemplateName(n))
        )
      );
    }
    const name = r.resolveTemplateName
      ? resolveWaTemplateName(r.resolveTemplateName({ brand: 'hydrogenro', customerName: 'Customer' }))
      : resolveWaTemplateName(r.templateName);
    return approvedNames.has(name) || approvedNames.has(resolveWaTemplateName(r.templateName));
  });
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
