#!/usr/bin/env node
/**
 * Submit the full HydrogenRO / Eleven RO WhatsApp UTILITY template set.
 *
 * Skips names already APPROVED on the WABA. Maps legacy code names → approved aliases
 * (svc_document_pdf → svc_doc_pdf_v2, svc_completed → svc_job_done).
 *
 * Usage:
 *   node scripts/submit-whatsapp-full-utility.mjs              # dry-run
 *   node scripts/submit-whatsapp-full-utility.mjs --status     # list all on WABA
 *   node scripts/submit-whatsapp-full-utility.mjs --submit       # submit missing only
 *   node scripts/submit-whatsapp-full-utility.mjs --submit --force  # re-submit even if pending
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  loadEnvLocal,
  resolveWhatsAppCallPhones,
  callPhoneForTemplate,
} from './whatsapp-call-phone-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

loadEnvLocal();

const WABA_ID = process.env.WHATSAPP_WABA_ID || '1854517668845707';
const GRAPH = process.env.GRAPH_VERSION || 'v21.0';
const { eleven: CALL_PHONE_ELEVEN, hydrogen: CALL_PHONE_HYDROGEN } = resolveWhatsAppCallPhones();
/** Core UTILITY templates (shared) — Eleven main line unless template name is *_hro_* */
const CALL_PHONE = CALL_PHONE_ELEVEN;
const doSubmit = process.argv.includes('--submit');
const statusOnly = process.argv.includes('--status');
const force = process.argv.includes('--force');
const deleteMarketing = process.argv.includes('--delete-marketing');

/** Meta MARKETING templates to remove (stuck review / wrong category). */
const MARKETING_DELETE_NAMES = [
  'svc_booking_menu',
  'booking_menu',
  'service_reminder_cta',
  'service_due_notice_cta',
  'customer_followup_cta',
  'customer_update_notice_cta',
  'amc_renewal',
  'quotation_ready',
  'service_bill_ready',
  'invoice_ready',
  'receipt_ready',
  'document_ready',
  'amc_document_ready',
  'warranty_ready',
  'general_notice',
  'booking_confirmed_ero_cta',
  'booking_confirmed_hro_cta',
  'book_existing_customer_cta',
  'book_existing_customer_ero_cta',
  'book_existing_customer_hro_cta',
  'book_new_customer_cta',
  'book_new_customer_ero_cta',
  'book_new_customer_hro_cta',
  'missed_call_book_cta',
  'missed_call_book_ero_cta',
  'missed_call_book_hro_cta',
  'new_customer_service_setup_ero_cta',
  'new_customer_service_setup_hro_cta',
];

/** Code name → already-approved Meta name (do not re-submit under old name). */
const APPROVED_ALIASES = {
  svc_document_pdf: 'svc_doc_pdf_v2',
  svc_completed: 'svc_job_done',
  general_notice: 'svc_smoke_update',
  crm_notice: 'svc_smoke_update',
};

const SAMPLE_PDF =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

/** Core transactional UTILITY bodies (no marketing language). */
const CORE_TEMPLATES = [
  {
    name: 'svc_service_request',
    body: 'Hi {{1}}, regarding your water purifier service account: reply on this chat to continue your service request or schedule a technician visit.',
    examples: ['Rahul'],
  },
  {
    name: 'svc_visit_reminder',
    body: 'Hi {{1}}, reminder: your water purifier service visit is scheduled for {{2}}. Reply on this chat to confirm or reschedule.',
    examples: ['Rahul', 'Tue 12 Aug, 10:00 AM'],
  },
  {
    name: 'svc_visit_confirmed',
    body: 'Hi {{1}}, your water purifier service booking {{2}} is confirmed for {{3}}. Reply on this chat if you need to change it.',
    examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
  },
  {
    name: 'svc_tech_assigned',
    body: 'Hi {{1}}, technician {{2}} has been assigned for your service visit. Reply on this chat for assistance.',
    examples: ['Rahul', 'Suresh'],
  },
  {
    name: 'svc_completed',
    aliasOf: 'svc_job_done',
    body: 'Hi {{1}}, your water purifier service has been completed. Amount collected: INR {{2}}. Reply on this chat if you need support.',
    examples: ['Rahul', '1500'],
  },
  {
    name: 'svc_payment_received',
    body: 'Hi {{1}}, we have received payment of INR {{2}} for your service. Reply on this chat for any questions.',
    examples: ['Rahul', '1500'],
  },
  {
    name: 'svc_balance_due',
    body: 'Hi {{1}}, a balance of INR {{2}} is pending for your recent service. Reply on this chat to confirm payment details.',
    examples: ['Rahul', '800'],
  },
  {
    name: 'svc_document_pdf',
    aliasOf: 'svc_doc_pdf_v2',
    documentHeader: true,
    body: 'Hi {{1}}, your {{2}} is attached. Reply on this chat if you need any help.',
    examples: ['Rahul', 'service bill'],
  },
  {
    name: 'svc_document_ready',
    skipSubmit: true,
    aliasOf: 'svc_doc_pdf_v2',
    body: 'Hi {{1}}, your {{2}} is attached. Reply on this chat if you need any help.',
    examples: ['Rahul', 'service bill'],
  },
  {
    name: 'svc_smoke_update',
    body: 'Hi {{1}}, this is an update about your water purifier service request. Please reply on this chat if you need help.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_hello',
    body: 'Hi {{1}}, hello — this is regarding your water purifier service account. Please reply on this chat if you need any assistance.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_ask_location',
    body: 'Hi {{1}}, this is {{2}}. Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
    examples: ['Rahul', 'Eleven RO Water Filter Service'],
    noButtons: true,
  },
  {
    name: 'svc_ask_photo',
    body: 'Hi {{1}}, this is {{2}}. Please send a clear photo of your water purifier on this chat so we can continue your water filter service request.',
    examples: ['Rahul', 'Eleven RO Water Filter Service'],
    noButtons: true,
  },
  {
    name: 'svc_ask_flat',
    body: 'Hi {{1}}, this is {{2}}. Please reply with your building / flat / house number on this chat, or reply Skip if you do not have one.',
    examples: ['Rahul', 'Eleven RO Water Filter Service'],
    noButtons: true,
  },
  {
    name: 'svc_missed_call',
    body: 'Hi {{1}}, we tried to reach you and could not connect. Please reply on this chat so we can assist with your water purifier service.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_amc_expiry_notice',
    body: 'Hi {{1}}, your AMC for your water purifier is due to end on {{2}}. Reply on this chat to renew or schedule a visit.',
    examples: ['Rahul', '31 Dec 2026'],
  },
  {
    name: 'svc_booking_confirmed_ero',
    body: 'Hi {{1}}, your Eleven RO water purifier service booking {{2}} is confirmed for {{3}}. Reply on this chat if you need to change the date or time.',
    examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
  },
  {
    name: 'svc_booking_confirmed_hro',
    body: 'Hi {{1}}, your Hydrogen RO water purifier service booking {{2}} is confirmed for {{3}}. Reply on this chat if you need to change the date or time.',
    examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
  },
  {
    name: 'svc_parts_ready',
    body: 'Hi {{1}}, the spare parts required for your water purifier service have arrived. Reply on this chat and we will schedule the technician visit.',
    examples: ['Rahul'],
  },
  {
    name: 'svc_tech_delayed',
    body: 'Hi {{1}}, our technician is slightly delayed for {{2}}. Sorry for the inconvenience — we will update you on this chat shortly.',
    examples: ['Rahul', 'Tue 12 Aug, 10:00 AM'],
  },
  {
    name: 'svc_visit_cancelled_ero',
    body: 'Hi {{1}}, your Eleven RO water purifier service visit scheduled for {{2}} has been cancelled. Reply on this chat if you would like to rebook.',
    examples: ['Rahul', 'Tue 12 Aug, 10:00 AM'],
  },
  {
    name: 'svc_visit_cancelled_hro',
    body: 'Hi {{1}}, your Hydrogen RO water purifier service visit scheduled for {{2}} has been cancelled. Reply on this chat if you would like to rebook.',
    examples: ['Rahul', 'Tue 12 Aug, 10:00 AM'],
  },
];

/** Water Filter Service — cold hello (reopen chat). Reply → greeting menu. */
const WFS_HELLO_TEMPLATES = [
  {
    name: 'svc_wfs_hello_hro',
    body: 'Hi {{1}}, this is Hydrogen RO Water Filter Service. Please reply on this chat if you need help with your water purifier.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hello_ero',
    body: 'Hi {{1}}, this is Eleven RO Water Filter Service. Please reply on this chat if you need help with your water purifier.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hello',
    body: 'Hi {{1}}, this is Water Filter Service. Please reply on this chat if you need help with your water purifier.',
    examples: ['Rahul'],
    noButtons: true,
  },
];

/** Short cold hello — “hi from … Water Filter Service”. Reply → greeting menu. */
const WFS_SIMPLE_HI_TEMPLATES = [
  {
    name: 'svc_wfs_hi_hro',
    body: 'Hi {{1}}, hi from Hydrogen RO Water Filter Service. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_ero',
    body: 'Hi {{1}}, hi from Eleven RO Water Filter Service. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi',
    body: 'Hi {{1}}, hi from Water Filter Service. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
];

/**
 * Water Filter Service — cold open for location + photo collection.
 * Reply → bot sends Send location button, then guides step by step.
 */
const WFS_COLLECT_TEMPLATES = [
  {
    name: 'svc_wfs_collect_hro',
    body: 'Hi {{1}}, this is Hydrogen RO Water Filter Service. For serving you better we need certain information from you — such as your location and a photo of your purifier. Please share your location here on this chat; we will guide you step by step.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_collect_ero',
    body: 'Hi {{1}}, this is Eleven RO Water Filter Service. For serving you better we need certain information from you — such as your location and a photo of your purifier. Please share your location here on this chat; we will guide you step by step.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_collect',
    body: 'Hi {{1}}, this is Water Filter Service. For serving you better we need certain information from you — such as your location and a photo of your purifier. Please share your location here on this chat; we will guide you step by step.',
    examples: ['Rahul'],
    noButtons: true,
  },
];

/** Ask location — full copy + Call us + Text us (cold). Reply → Send location button. */
const WFS_ASK_LOC_TEMPLATES = [
  {
    name: 'svc_wfs_ask_loc_hro',
    body: 'Hi {{1}}, this is Hydrogen RO Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_ero',
    body: 'Hi {{1}}, this is Eleven RO Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc',
    body: 'Hi {{1}}, this is Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
    examples: ['Rahul'],
  },
];

/** Shorter ask location + Call us + Text us. */
const WFS_ASK_LOC_SIMPLE_TEMPLATES = [
  {
    name: 'svc_wfs_ask_loc_simple_hro',
    body: 'Hi {{1}}, please share your Google Maps location pin on this chat. — Hydrogen RO Water Filter Service',
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_simple_ero',
    body: 'Hi {{1}}, please share your Google Maps location pin on this chat. — Eleven RO Water Filter Service',
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_simple',
    body: 'Hi {{1}}, please share your Google Maps location pin on this chat. — Water Filter Service',
    examples: ['Rahul'],
  },
];

/**
 * Booking confirm / cancel v2 — Call (voice) + Website (+ Book on cancel to rebook).
 * Prefer these over phone-only svc_booking_confirmed_* / svc_visit_cancelled_*.
 */
const BOOKING_STATUS_V2_TEMPLATES = [
  {
    name: 'svc_booking_confirmed_ero_v2',
    websiteUrl: 'https://elevenro.com',
    body: 'Hi {{1}}, your Eleven RO water purifier service booking {{2}} is confirmed for {{3}}. Reply on this chat if you need to change the date or time.',
    examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
  },
  {
    name: 'svc_booking_confirmed_hro_v2',
    websiteUrl: 'https://hydrogenro.com',
    body: 'Hi {{1}}, your Hydrogen RO water purifier service booking {{2}} is confirmed for {{3}}. Reply on this chat if you need to change the date or time.',
    examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
  },
  {
    name: 'svc_booking_cancelled_ero_v2',
    websiteUrl: 'https://elevenro.com',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, your Eleven RO water purifier service booking for {{2}} has been cancelled. Reply BOOK on this chat to reschedule, or use Call / Text us / Book below.',
    examples: ['Rahul', 'Tue 12 Aug, 2:00 PM'],
  },
  {
    name: 'svc_booking_cancelled_hro_v2',
    websiteUrl: 'https://hydrogenro.com',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, your Hydrogen RO water purifier service booking for {{2}} has been cancelled. Reply BOOK on this chat to reschedule, or use Call / Text us / Book below.',
    examples: ['Rahul', 'Tue 12 Aug, 2:00 PM'],
  },
];

/** Rich job-done cold (3 body vars + Call only — no Book URL; Book buttons often → MARKETING). */
const JOB_DONE_V2_TEMPLATES = [
  {
    name: 'svc_job_done_ero_v2',
    body: 'Hi {{1}}, {{2}} {{3}} Thank you for choosing us. Reply on this chat if you need any help.',
    examples: [
      'Poorna Shetty',
      'Your Water Purifier Service is completed.',
      'Amount of INR 1500 has been collected.',
    ],
  },
  {
    name: 'svc_job_done_hro_v2',
    body: 'Hi {{1}}, {{2}} {{3}} Thank you for choosing us. Reply on this chat if you need any help.',
    examples: [
      'Poorna Shetty',
      'Your Water Purifier Service is completed.',
      'Amount of INR 1500 has been collected.',
    ],
  },
];

/**
 * Job-done v3 — Call (voice main) + Website + Review.
 * Call phones: Eleven 9880693311 · Hydrogen 8884944288 (not the Cloud API WA line).
 */
const JOB_DONE_V3_TEMPLATES = [
  {
    name: 'svc_job_done_ero_v3',
    websiteUrl: 'https://elevenro.com',
    reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Eleven+RO+Anjanapura+Bengaluru',
    body: 'Hi {{1}}, {{2}} {{3}} Thank you for choosing Eleven RO. Reply on this chat if you need any help.',
    examples: [
      'Poorna Shetty',
      'Your Water Purifier Service is completed.',
      'Amount of INR 1500 has been collected.',
    ],
  },
  {
    name: 'svc_job_done_hro_v3',
    websiteUrl: 'https://hydrogenro.com',
    reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Hydrogen+RO+Seshadripuram+Bengaluru',
    body: 'Hi {{1}}, {{2}} {{3}} Thank you for choosing Hydrogen RO. Reply on this chat if you need any help.',
    examples: [
      'Poorna Shetty',
      'Your Water Purifier Service is completed.',
      'Amount of INR 1500 has been collected.',
    ],
  },
];

/** Letter UTILITY v2 — Call/Email/Website footer with label on one line, value on the next. */
const LETTER_BRANDS = {
  ero: {
    label: 'Eleven RO',
    phone: '9880693311',
    email: 'mail@elevenro.com',
    website: 'https://elevenro.com',
    webHost: 'elevenro.com',
    bookUrl: 'https://elevenro.com/book',
    reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Eleven+RO+Anjanapura+Bengaluru',
  },
  hro: {
    label: 'Hydrogen RO',
    phone: '8884944288',
    email: 'mail@hydrogenro.com',
    website: 'https://hydrogenro.com',
    webHost: 'hydrogenro.com',
    bookUrl: 'https://hydrogenro.com/book',
    reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Hydrogen+RO+Seshadripuram+Bengaluru',
  },
};

function letterFooterBlock(brand) {
  return [
    `Thank you for choosing ${brand.label}.`,
    `Call:\n${brand.phone}`,
    `Email:\n${brand.email}`,
    `Website:\n${brand.webHost}`,
  ].join('\n');
}

function buildLetterV3Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const footer = letterFooterBlock(b);
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const chatUrl = `https://wa.me/${callPhone.replace(/\D/g, '')}`;
    const base = { callPhone, chatUrl };
    out.push({
      ...base,
      name: `svc_job_done_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your completed water purifier service.\n\nAmount collected: INR {{2}}\nInvoice / Job: {{3}}\n\n${footer}\n\nReply on this chat if you need any help.`,
      examples: ['Rahul', '1500', 'RO2608121234'],
    });
    out.push({
      ...base,
      name: `svc_balance_due_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your pending payment for water purifier service.\n\nAmount pending: INR {{2}}\nDue date: {{3}}\nInvoice / Job: {{4}}\n\n${footer}\n\nReply on this chat for UPI details or if you have already paid.`,
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
    out.push({
      ...base,
      name: `svc_service_due_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your scheduled water purifier service.\n\nService due around: {{2}}\n\n${footer}\n\nReply BOOK on this chat to pick date and time — we already have your details on file.`,
      examples: ['Rahul', 'your upcoming service visit'],
    });
    out.push({
      ...base,
      websiteUrl: b.website,
      name: `svc_booking_confirmed_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your service booking.\n\nBooking: {{2}}\nConfirmed for: {{3}}\n\n${footer}\n\nReply on this chat if you need to change the date or time.`,
      examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
    });
    out.push({
      ...base,
      websiteUrl: b.website,
      name: `svc_booking_cancelled_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your water purifier service booking.\n\nYour booking for {{2}} has been cancelled.\n\n${footer}\n\nReply BOOK on this chat to reschedule.`,
      examples: ['Rahul', 'Tue 12 Aug, 2:00 PM'],
    });
  }
  return out;
}

const LETTER_V3_TEMPLATES = buildLetterV3Templates();

/** Existing-customer schedule — Book online button only (no Call). */
const EXISTING_CUSTOMER_BOOK_CTA_TEMPLATES = [
  {
    name: 'existing_service_schedule_ero_cta_v2',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. Your RO service visit is due. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.',
    examples: ['Rahul'],
  },
  {
    name: 'existing_service_schedule_hro_cta_v2',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. Your RO service visit is due. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.',
    examples: ['Rahul'],
  },
];

/**
 * Service-due reminders — Book online only (existing customers).
 * Reply BOOK seeds booking bot (date/time) via CRM seedPendingAction.
 */
const SERVICE_DUE_BOOK_CTA_TEMPLATES = [
  {
    name: 'svc_service_due_ero_cta_v2',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, your water purifier service is due around {{2}}. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.',
    examples: ['Rahul', 'Tue 12 Aug 2026'],
  },
  {
    name: 'svc_service_due_hro_cta_v2',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, your water purifier service is due around {{2}}. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.',
    examples: ['Rahul', 'Tue 12 Aug 2026'],
  },
];

/** Cold PDF — per doc type, brand footer + Call + Chat us (DOCUMENT header). */
const DOC_PDF_ATTACHED_LINES = [
  { slug: 'bill', line: 'Your service bill is attached.' },
  { slug: 'invoice', line: 'Your tax invoice is attached.' },
  { slug: 'amc', line: 'Your AMC agreement is attached.' },
  { slug: 'quotation', line: 'Your quotation is attached.' },
  { slug: 'warranty', line: 'Your warranty card is attached.' },
  { slug: 'receipt', line: 'Your payment receipt is attached.' },
  { slug: 'generic', line: 'Your document is attached.' },
];

function buildDocPdfV2Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const footer = letterFooterBlock(b);
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const chatUrl = `https://wa.me/${callPhone.replace(/\D/g, '')}`;
    for (const kind of DOC_PDF_ATTACHED_LINES) {
      out.push({
        name: `svc_doc_${kind.slug}_${suffix}_v2`,
        callPhone,
        chatUrl,
        body: `Hi {{1}},\n${kind.line}\n\n${footer}\n\nReply on this chat if you need any help.`,
        examples: ['Rahul'],
      });
    }
  }
  return out;
}

const DOC_PDF_V2_TEMPLATES = buildDocPdfV2Templates();

/** UTILITY schedule / callback CTAs — no booking_confirmed_*_cta (use svc_booking_confirmed_* phone-only). */
const BOOKING_TEMPLATES = [
  {
    name: 'existing_service_schedule_ero_cta',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.',
    examples: ['Rahul'],
  },
  {
    name: 'unregistered_number_service_ero_cta',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.',
    examples: ['there'],
  },
  {
    name: 'missed_call_callback_ero_cta',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.',
    examples: ['Rahul'],
  },
  {
    name: 'reschedule_visit_ero_cta',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, your Eleven RO visit is set for {{2}}. To reschedule, reply on this chat or use Call / Book online below.',
    examples: ['Rahul', 'Mon 12 Aug, 10:00 AM'],
  },
  {
    name: 'existing_service_schedule_hro_cta',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.',
    examples: ['Rahul'],
  },
  {
    name: 'unregistered_number_service_hro_cta',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.',
    examples: ['there'],
  },
  {
    name: 'missed_call_callback_hro_cta',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.',
    examples: ['Rahul'],
  },
  {
    name: 'reschedule_visit_hro_cta',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, your Hydrogen RO visit is set for {{2}}. To reschedule, reply on this chat or use Call / Book online below.',
    examples: ['Rahul', 'Mon 12 Aug, 10:00 AM'],
  },
];

/**
 * Service-due reminders — Call (voice) + Website + Book online.
 * Reply BOOK on chat seeds booking bot (date/time) via CRM seedPendingAction.
 */
const SERVICE_DUE_CTA_TEMPLATES = [
  {
    name: 'svc_service_due_ero_cta',
    websiteUrl: 'https://elevenro.com',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, your water purifier service is due around {{2}}. Reply BOOK on this chat to schedule a visit — we will ask for your preferred date and time. Or use Call / Website / Book below.',
    examples: ['Rahul', 'Tue 12 Aug 2026'],
  },
  {
    name: 'svc_service_due_hro_cta',
    websiteUrl: 'https://hydrogenro.com',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, your water purifier service is due around {{2}}. Reply BOOK on this chat to schedule a visit — we will ask for your preferred date and time. Or use Call / Website / Book below.',
    examples: ['Rahul', 'Tue 12 Aug 2026'],
  },
];

async function resolveToken() {
  let token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
  if (token) return token;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return '';
  const sb = createClient(url, key);
  const { data } = await sb
    .from('app_secrets')
    .select('key,value')
    .in('key', ['whatsapp_access_token', 'WHATSAPP_ACCESS_TOKEN']);
  const row = (data || []).find((r) => r.value);
  return row?.value || '';
}

async function graph(token, path, opts = {}) {
  const url = `https://graph.facebook.com/${GRAPH}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function listTemplates(token) {
  const out = [];
  let after = null;
  for (let i = 0; i < 15; i++) {
    const q = after
      ? `${WABA_ID}/message_templates?limit=100&fields=name,status,category,id&after=${after}`
      : `${WABA_ID}/message_templates?limit=100&fields=name,status,category,id`;
    const r = await graph(token, q);
    if (!r.ok) throw new Error(JSON.stringify(r.data));
    out.push(...(r.data.data || []));
    after = r.data.paging?.cursors?.after;
    if (!after || !(r.data.data || []).length) break;
  }
  return out;
}

function corePayload(t) {
  const components = [];
  if (t.documentHeader) {
    components.push({
      type: 'HEADER',
      format: 'DOCUMENT',
      example: { header_handle: [SAMPLE_PDF] },
    });
  }
  components.push({
    type: 'BODY',
    text: t.body,
    example: { body_text: [t.examples] },
  });
  if (!t.noButtons) {
    const buttons = Array.isArray(t.quickReplies) && t.quickReplies.length
      ? t.quickReplies.slice(0, 3).map((text) => ({
          type: 'QUICK_REPLY',
          text: String(text).slice(0, 25),
        }))
      : [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: CALL_PHONE }];
    components.push({ type: 'BUTTONS', buttons });
  }
  return {
    name: t.aliasOf || t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components,
  };
}

function jobDonePayload(t) {
  const callPhone = callPhoneForTemplate(t.name);
  const buttons = [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone }];
  if (t.websiteUrl) {
    buttons.push({ type: 'URL', text: 'Website', url: t.websiteUrl });
  }
  if (t.reviewUrl) {
    buttons.push({ type: 'URL', text: 'Review', url: t.reviewUrl });
  }
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.examples] },
      },
      {
        type: 'BUTTONS',
        buttons,
      },
    ],
  };
}

function letterPayload(t) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  const chatUrl =
    t.chatUrl || `https://wa.me/${String(callPhone).replace(/\D/g, '')}`;
  const buttons = [
    { type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone },
  ];
  if (t.websiteUrl) {
    buttons.push({ type: 'URL', text: 'Website', url: t.websiteUrl });
  }
  buttons.push({ type: 'URL', text: 'Text us', url: chatUrl });
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.examples] },
      },
      { type: 'BUTTONS', buttons },
    ],
  };
}

function docPdfPayload(t) {
  const buttons = [
    { type: 'PHONE_NUMBER', text: 'Call us', phone_number: t.callPhone },
    { type: 'URL', text: 'Text us', url: t.chatUrl },
  ];
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'HEADER',
        format: 'DOCUMENT',
        example: { header_handle: [SAMPLE_PDF] },
      },
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.examples] },
      },
      { type: 'BUTTONS', buttons },
    ],
  };
}

function bookOnlyPayload(t) {
  const buttons = [];
  if (t.bookUrl) {
    buttons.push({ type: 'URL', text: 'Book online', url: t.bookUrl });
  }
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.examples] },
      },
      ...(buttons.length ? [{ type: 'BUTTONS', buttons }] : []),
    ],
  };
}

function bookingPayload(t) {
  const callPhone = callPhoneForTemplate(t.name);
  const chatUrl = `https://wa.me/${String(callPhone).replace(/\D/g, '')}`;
  const buttons = [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone }];
  if (t.bookUrl) {
    buttons.push({ type: 'URL', text: 'Text us', url: chatUrl });
    buttons.push({ type: 'URL', text: 'Book online', url: t.bookUrl });
  } else {
    if (t.websiteUrl) {
      buttons.push({ type: 'URL', text: 'Website', url: t.websiteUrl });
    }
    buttons.push({ type: 'URL', text: 'Text us', url: chatUrl });
  }
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.examples] },
      },
      {
        type: 'BUTTONS',
        buttons,
      },
    ],
  };
}

function isApproved(name, byName) {
  if (byName.has(name) && byName.get(name).status === 'APPROVED') return true;
  const alias = APPROVED_ALIASES[name];
  if (alias && byName.has(alias) && byName.get(alias).status === 'APPROVED') return true;
  return false;
}

function shouldSkip(name, byName) {
  if (isApproved(name, byName)) return 'APPROVED';
  if (!force && byName.has(name) && byName.get(name).status === 'PENDING') return 'PENDING';
  return null;
}

async function submitOne(token, payload) {
  return graph(token, `${encodeURIComponent(WABA_ID)}/message_templates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function deleteByName(token, name) {
  return graph(
    token,
    `${encodeURIComponent(WABA_ID)}/message_templates?name=${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
}

async function main() {
  console.log(`WABA ${WABA_ID}`);
  console.log(`Call us — Eleven RO: ${CALL_PHONE_ELEVEN} · Hydrogen RO: ${CALL_PHONE_HYDROGEN}`);
  const token = await resolveToken();
  if (!token && (doSubmit || statusOnly)) {
    console.error('Missing WHATSAPP_ACCESS_TOKEN');
    process.exit(1);
  }

  const all = token ? await listTemplates(token) : [];
  const byName = new Map(all.map((t) => [t.name, t]));

  if (deleteMarketing && token) {
    console.log('\nDeleting MARKETING / blocked templates…\n');
    for (const name of MARKETING_DELETE_NAMES) {
      const row = byName.get(name);
      if (!row) {
        console.log(`SKIP delete ${name} — not on WABA`);
        continue;
      }
      const r = await deleteByName(token, name);
      console.log(
        r.ok ? 'DELETED' : 'FAIL',
        name,
        row.status,
        row.category || '',
        r.ok ? '' : JSON.stringify(r.data)
      );
      await new Promise((res) => setTimeout(res, 500));
    }
    if (!doSubmit && !statusOnly) return;
  }

  if (statusOnly) {
    const counts = {};
    for (const t of all) counts[t.status] = (counts[t.status] || 0) + 1;
    console.log('Status counts:', counts);
    for (const t of all.sort((a, b) => String(a.name).localeCompare(b.name))) {
      console.log(`  ${String(t.status).padEnd(10)} ${String(t.category || '').padEnd(10)} ${t.name}`);
    }
    return;
  }

  const queue = [];
  for (const t of CORE_TEMPLATES) {
    const metaName = t.aliasOf || t.name;
    if (t.skipSubmit) {
      console.log(`SKIP ${t.name} — use ${metaName} instead (marketing-prone legacy name)`);
      continue;
    }
    const skip = shouldSkip(metaName, byName) || shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name}${t.aliasOf ? ` (→ ${t.aliasOf})` : ''} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of BOOKING_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: bookingPayload(t) });
  }
  for (const t of SERVICE_DUE_CTA_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: bookingPayload(t) });
  }
  for (const t of BOOKING_STATUS_V2_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: bookingPayload(t) });
  }
  for (const t of JOB_DONE_V2_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: jobDonePayload(t) });
  }
  for (const t of JOB_DONE_V3_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: jobDonePayload(t) });
  }
  for (const t of LETTER_V3_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of EXISTING_CUSTOMER_BOOK_CTA_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: bookOnlyPayload(t) });
  }
  for (const t of SERVICE_DUE_BOOK_CTA_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: bookOnlyPayload(t) });
  }
  for (const t of WFS_HELLO_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of WFS_SIMPLE_HI_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of WFS_COLLECT_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of WFS_ASK_LOC_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of WFS_ASK_LOC_SIMPLE_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of DOC_PDF_V2_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: docPdfPayload(t) });
  }

  console.log(`\n${doSubmit ? 'Submitting' : 'Would submit'} ${queue.length} template(s)\n`);
  for (const item of queue) {
    console.log(`• ${item.label} → ${item.payload.name}`);
    console.log(`  ${item.payload.components.find((c) => c.type === 'BODY')?.text || ''}`);
    if (!doSubmit) {
      console.log('');
      continue;
    }
    const result = await submitOne(token, item.payload);
    console.log(result.ok ? '  OK' : '  FAIL', result.status, JSON.stringify(result.data));
    console.log('');
    await new Promise((r) => setTimeout(r, 700));
  }

  if (!doSubmit) {
    console.log('Dry-run. Submit with: node scripts/submit-whatsapp-full-utility.mjs --submit');
  } else {
    console.log('Done. Recheck: node scripts/submit-whatsapp-full-utility.mjs --status');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
