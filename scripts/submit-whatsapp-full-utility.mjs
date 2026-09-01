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
 *   node scripts/submit-whatsapp-full-utility.mjs --preview-md  # write docs/whatsapp-cold-template-previews.md
 *   node scripts/submit-whatsapp-full-utility.mjs --submit       # submit missing only
   *   node scripts/submit-whatsapp-full-utility.mjs --submit --only-tech-customer-photo
 *   node scripts/submit-whatsapp-full-utility.mjs --submit --only-payment-overdue
   *   node scripts/submit-whatsapp-full-utility.mjs --submit --only-missed-call-v5
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
const previewMd = process.argv.includes('--preview-md');
const force = process.argv.includes('--force');
const deleteMarketing = process.argv.includes('--delete-marketing');
const deleteOld = process.argv.includes('--delete-old');

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
  'missed_call_callback_ero_cta_v3',
  'missed_call_callback_hro_cta_v3',
  // WFS hello/hi flagged MARKETING by Meta — delete and resubmit as _v2 with neutral wording
  'svc_wfs_hello_ero',
  'svc_wfs_hello_hro',
  'svc_wfs_hi_hro',
  'svc_wfs_hi_ero',
  'svc_wfs_hi_from_ero',
  // Generic + just_hi / hi_from still flagged MARKETING — delete and resubmit as _v3
  'svc_wfs_hello',
  'svc_wfs_hi',
  'svc_wfs_hi_from',
  'svc_wfs_hi_from_hro',
  'svc_wfs_hi_from_ero_v2',
  'svc_wfs_just_hi',
  'svc_wfs_just_hi_ero',
  'svc_wfs_just_hi_hro',
  // Ask-name “Hi from …” flagged MARKETING
  'svc_wfs_ask_name_v1',
  'svc_wfs_ask_name_simple_ero_v1',
  'svc_wfs_ask_name_hro_v1',
  'svc_wfs_ask_name_ero_v1',
  'svc_wfs_ask_name_simple_hro_v1',
  'svc_wfs_ask_name_simple_v1', // “Hi from Water Filter Service”
];

/** Old drafts replaced by newer UTILITY copy (ask-loc-from, This is… ask-name, hello v2). */
const SUPERSEDED_DELETE_NAMES = [
  'svc_wfs_ask_loc',
  'svc_wfs_ask_loc_ero',
  'svc_wfs_ask_loc_hro',
  'svc_wfs_ask_loc_simple',
  'svc_wfs_ask_loc_simple_ero',
  'svc_wfs_ask_loc_simple_hro',
  'svc_wfs_hi_from_v3',
  'svc_wfs_hi_from_hro_v3',
  'svc_wfs_hi_from_ero_v3',
  'svc_wfs_hi_v3', // “hi from” generic — keep branded _hro/_ero_v2
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

/** Meta app id (from system-user token) — used to upload DOCUMENT header samples. */
const META_APP_ID = process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || '1728855588331996';

let cachedSamplePdfHandle = '';
let cachedSampleImageHandle = '';

/** Tiny valid PDF bytes for Meta template DOCUMENT header examples. */
function samplePdfBytes() {
  return Buffer.from(
    '%PDF-1.1\n1 0 obj<<>>endobj\n2 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 100 700 Td (Preview sample) Tj ET\nendstream\nendobj\n3 0 obj<< /Type /Page /Parent 4 0 R /Contents 2 0 R >>endobj\n4 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>endobj\n5 0 obj<< /Type /Catalog /Pages 4 0 R >>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<< /Size 6 /Root 5 0 R >>\nstartxref\n0\n%%EOF\n'
  );
}

/** Minimal 1×1 JPEG for Meta IMAGE header examples. */
function sampleJpegBytes() {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
    'base64'
  );
}

/**
 * Meta rejects public PDF URLs for DOCUMENT header examples — upload via App Uploads API.
 * Returns a handle like `4:…` for components[].example.header_handle.
 */
async function uploadTemplateSamplePdfHandle(token) {
  if (cachedSamplePdfHandle) return cachedSamplePdfHandle;
  const pdf = samplePdfBytes();
  const start = await fetch(`https://graph.facebook.com/${GRAPH}/${META_APP_ID}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_length: pdf.length,
      file_type: 'application/pdf',
      file_name: 'doc-accept-preview-sample.pdf',
    }),
  });
  const startJ = await start.json().catch(() => ({}));
  if (!start.ok || !startJ.id) {
    throw new Error(`Sample PDF upload session failed: ${JSON.stringify(startJ)}`);
  }
  const up = await fetch(`https://graph.facebook.com/${GRAPH}/${startJ.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: pdf,
  });
  const upJ = await up.json().catch(() => ({}));
  if (!up.ok || !upJ.h) {
    throw new Error(`Sample PDF upload failed: ${JSON.stringify(upJ)}`);
  }
  cachedSamplePdfHandle = upJ.h;
  return cachedSamplePdfHandle;
}

async function uploadTemplateSampleImageHandle(token) {
  if (cachedSampleImageHandle) return cachedSampleImageHandle;
  const jpeg = sampleJpegBytes();
  const start = await fetch(`https://graph.facebook.com/${GRAPH}/${META_APP_ID}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_length: jpeg.length,
      file_type: 'image/jpeg',
      file_name: 'balance-due-header-sample.jpg',
    }),
  });
  const startJ = await start.json().catch(() => ({}));
  if (!start.ok || !startJ.id) {
    throw new Error(`Sample image upload session failed: ${JSON.stringify(startJ)}`);
  }
  const up = await fetch(`https://graph.facebook.com/${GRAPH}/${startJ.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: jpeg,
  });
  const upJ = await up.json().catch(() => ({}));
  if (!up.ok || !upJ.h) {
    throw new Error(`Sample image upload failed: ${JSON.stringify(upJ)}`);
  }
  cachedSampleImageHandle = upJ.h;
  return cachedSampleImageHandle;
}

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
    skipSubmit: true,
  },
  {
    name: 'svc_missed_call_v2',
    body: 'Hi {{1}}, sorry we missed your call — our team was busy. Please reply on this chat to request a callback and we will call you back shortly.',
    examples: ['Rahul'],
    noButtons: true,
    skipSubmit: true,
  },
  {
    name: 'svc_missed_call_v3',
    body: 'Hi {{1}}, we received your incoming call and could not answer. We will return your call to continue your water purifier service. Reply on this chat if you need to add any details.',
    examples: ['Rahul'],
    noButtons: true,
    lockCategory: true,
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

/** Water Filter Service — cold hello. Reply → greeting menu.
 * svc_wfs_hello_ero was MARKETING-flagged → deleted, resubmit as _ero_v2 with neutral wording.
 */
const WFS_HELLO_TEMPLATES = [
  {
    // was svc_wfs_hello_hro (MARKETING-flagged) — neutral service-account framing
    name: 'svc_wfs_hello_hro_v2',
    body: 'Hi {{1}}, this is a message about your Hydrogen RO water purifier service account. Please reply on this chat if you need assistance.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    // was svc_wfs_hello_ero (MARKETING-flagged) — neutral service-account framing
    name: 'svc_wfs_hello_ero_v2',
    body: 'Hi {{1}}, this is a message about your Eleven RO water purifier service account. Please reply on this chat if you need assistance.',
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

/** Short cold hello — svc_wfs_hi_hro and _ero were MARKETING-flagged → resubmit as _v2. */
const WFS_SIMPLE_HI_TEMPLATES = [
  {
    name: 'svc_wfs_hi_hro_v2',
    body: 'Hi {{1}}, this is a message about your Hydrogen RO water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_ero_v2',
    body: 'Hi {{1}}, this is a message about your Eleven RO water purifier service account. Please reply on this chat.',
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

/** Minimal cold hello — “Just Hi”. Reply → greeting menu. */
const WFS_JUST_HI_TEMPLATES = [
  {
    name: 'svc_wfs_just_hi_hro',
    body: 'Hi {{1}}. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_just_hi_ero',
    body: 'Hi {{1}}. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_just_hi',
    body: 'Hi {{1}}. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
];

/** Minimal “hi from … Water Filter Service” only (no extra line). Reply → greeting menu. */
const WFS_HI_FROM_TEMPLATES = [
  {
    name: 'svc_wfs_hi_from_hro',
    body: 'Hi {{1}}, hi from Hydrogen RO Water Filter Service.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    // was svc_wfs_hi_from_ero (MARKETING-flagged) — ends with period, no CTA line
    name: 'svc_wfs_hi_from_ero_v2',
    body: 'Hi {{1}}, this is a message from Eleven RO Water Filter Service.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_from',
    body: 'Hi {{1}}, hi from Water Filter Service.',
    examples: ['Rahul'],
    noButtons: true,
  },
];

/**
 * WFS greetings re-flagged MARKETING (generic hello/hi, just_hi, hi_from) → _v3 UTILITY wording.
 * Branded hello/hi _v2 stay as-is (already UTILITY PENDING).
 */
const WFS_V3_UTILITY_TEMPLATES = [
  {
    name: 'svc_wfs_hello_v3',
    body: 'Hi {{1}}, this is a message about your water purifier service account. Please reply on this chat if you need assistance.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_v3',
    body: 'Hi {{1}}, this is a message about your water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_just_hi_hro_v3',
    body: 'Hi {{1}}, this is an update regarding your Hydrogen RO water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_just_hi_ero_v3',
    body: 'Hi {{1}}, this is an update regarding your Eleven RO water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_just_hi_v3',
    body: 'Hi {{1}}, this is an update regarding your water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_from_hro_v3',
    body: 'Hi {{1}}, this is a message about your Hydrogen RO water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_from_ero_v3',
    body: 'Hi {{1}}, this is a message about your Eleven RO water purifier service account. Please reply on this chat.',
    examples: ['Rahul'],
    noButtons: true,
  },
  {
    name: 'svc_wfs_hi_from_v3',
    body: 'Hi {{1}}, this is a message about your water purifier service account. Please reply on this chat.',
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

/**
 * Ask customer name — UTILITY wording (avoid “Hi from” — Meta MARKETING).
 * No body variables (name unknown). Brand-specific + generic.
 */
const WFS_ASK_NAME_TEMPLATES = [
  {
    // was svc_wfs_ask_name_hro_v1 (MARKETING)
    name: 'svc_wfs_ask_name_hro_v2',
    body: [
      'This is Hydrogen RO Water Filter Service. 👋',
      '',
      'Please reply with your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
    examples: [],
    noButtons: true,
  },
  {
    // was svc_wfs_ask_name_ero_v1 (MARKETING)
    name: 'svc_wfs_ask_name_ero_v2',
    body: [
      'This is Eleven RO Water Filter Service. 👋',
      '',
      'Please reply with your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
    examples: [],
    noButtons: true,
  },
  {
    // was svc_wfs_ask_name_v1 (MARKETING) — service-account framing
    name: 'svc_wfs_ask_name_v2',
    body: [
      'This is Water Filter Service. 👋',
      '',
      'Please reply with your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
    examples: [],
    noButtons: true,
  },
];

/**
 * Ask name option 1 (short). Prefer when approved.
 * ERO simple v1 was MARKETING → _simple_ero_v2 with UTILITY wording.
 */
const WFS_ASK_NAME_SIMPLE_TEMPLATES = [
  {
    // was svc_wfs_ask_name_simple_hro_v1 (MARKETING)
    name: 'svc_wfs_ask_name_simple_hro_v2',
    body: [
      'This is Hydrogen RO Water Filter Service. 👋',
      '',
      'Please share your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
    examples: [],
    noButtons: true,
  },
  {
    // was svc_wfs_ask_name_simple_ero_v1 (MARKETING)
    name: 'svc_wfs_ask_name_simple_ero_v2',
    body: [
      'This is Eleven RO Water Filter Service. 👋',
      '',
      'Please share your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
    examples: [],
    noButtons: true,
  },
  // svc_wfs_ask_name_simple_v1 (“Hi from…”) → MARKETING; do not resubmit — use _v2
  {
    name: 'svc_wfs_ask_name_simple_v2',
    body: [
      'This is Water Filter Service. 👋',
      '',
      'Please share your full name on this chat so we can continue your water purifier service request.',
    ].join('\n'),
    examples: [],
    noButtons: true,
  },
];

/** Ask location — full copy + Call us + Text us (cold, legacy). Reply → Send location button. */
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

/** Shorter ask location + Call us + Text us (legacy). */
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
 * Ask location v3 — Call us + QUICK_REPLY "Share location" (no Website) + light emojis.
 * (v2 deleted during emoji refresh; Meta held those names in delete-pending.)
 */
const WFS_ASK_LOC_V2_TEMPLATES = [
  {
    name: 'svc_wfs_ask_loc_hro_v3',
    body: [
      'Hi {{1}}, 👋',
      'This is Hydrogen RO Water Filter Service.',
      '',
      '📍 Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_ero_v3',
    body: [
      'Hi {{1}}, 👋',
      'This is Eleven RO Water Filter Service.',
      '',
      '📍 Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_v3',
    body: [
      'Hi {{1}}, 👋',
      'This is Water Filter Service.',
      '',
      '📍 Please share your Google Maps location pin on this chat so we can continue your water filter service request.',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
];

const WFS_ASK_LOC_SIMPLE_V2_TEMPLATES = [
  {
    name: 'svc_wfs_ask_loc_simple_hro_v3',
    body: [
      'Hi {{1}}, 👋',
      '📍 Please share your Google Maps location pin on this chat.',
      '— Hydrogen RO Water Filter Service',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_simple_ero_v3',
    body: [
      'Hi {{1}}, 👋',
      '📍 Please share your Google Maps location pin on this chat.',
      '— Eleven RO Water Filter Service',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_simple_v3',
    body: [
      'Hi {{1}}, 👋',
      '📍 Please share your Google Maps location pin on this chat.',
      '— Water Filter Service',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
];

/**
 * Ask location “from Water Filter Service” — matches Quick customer / WFS intro style.
 * Call us + Share location CTA + light emojis. Generic + both brands.
 */
const WFS_ASK_LOC_FROM_TEMPLATES = [
  {
    name: 'svc_wfs_ask_loc_from_v1',
    body: [
      'Hi {{1}}, 👋',
      '',
      'from Water Filter Service.',
      '',
      '📍 To serve you better we need your exact location. Please share your Google Maps location pin on this chat.',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_from_hro_v1',
    body: [
      'Hi {{1}}, 👋',
      '',
      'from Hydrogen RO Water Filter Service.',
      '',
      '📍 To serve you better we need your exact location. Please share your Google Maps location pin on this chat.',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_from_ero_v1',
    body: [
      'Hi {{1}}, 👋',
      '',
      'from Eleven RO Water Filter Service.',
      '',
      '📍 To serve you better we need your exact location. Please share your Google Maps location pin on this chat.',
      '',
      'Tap Share location below 👇',
    ].join('\n'),
    examples: ['Rahul'],
  },
];

/**
 * Ask location + flat/house no + front photo of purifier.
 * Call us + Share location QR. Generic + both brands.
 */
const WFS_ASK_LOC_FLAT_PHOTO_TEMPLATES = [
  {
    name: 'svc_wfs_ask_loc_flat_photo_v1',
    body: [
      'Hi {{1}}, 👋',
      '',
      'from Water Filter Service or Installation.',
      '',
      'Please share all of these on this chat:',
      '1) Your Google Maps location pin',
      '2) Your flat / house number',
      '3) A photo of the front of the purifier',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_flat_photo_hro_v1',
    body: [
      'Hi {{1}}, 👋',
      '',
      'from Hydrogen RO Water Filter Service or Installation.',
      '',
      'Please share all of these on this chat:',
      '1) Your Google Maps location pin',
      '2) Your flat / house number',
      '3) A photo of the front of the purifier',
    ].join('\n'),
    examples: ['Rahul'],
  },
  {
    name: 'svc_wfs_ask_loc_flat_photo_ero_v1',
    body: [
      'Hi {{1}}, 👋',
      '',
      'from Eleven RO Water Filter Service or Installation.',
      '',
      'Please share all of these on this chat:',
      '1) Your Google Maps location pin',
      '2) Your flat / house number',
      '3) A photo of the front of the purifier',
    ].join('\n'),
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

/** Customer called us — UTILITY callback (no emoji / Book / Call me back — those went MARKETING). */
function buildMissedCallCallbackV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      lockCategory: true,
      name: `missed_call_callback_${suffix}_cta_v4`,
      body: [
        `Hi {{1}}, this is ${b.label}.`,
        `We received your incoming call and could not answer.`,
        `We will return your call to continue your water purifier service.`,
        `Reply on this chat if you need to add any details before we call.`,
      ].join('\n'),
      examples: ['Rahul'],
    });
  }
  return out;
}

/** v5: last service date + Call us. Same UTILITY lock as v4. */
function buildMissedCallCallbackV5Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      lockCategory: true,
      name: `missed_call_callback_${suffix}_cta_v5`,
      body: [
        `Hi {{1}}, this is ${b.label}.`,
        `Sorry we missed your call. We will get back to you shortly.`,
        `Last service date: {{2}}.`,
        `Tap Call us if you need us now, or reply on this chat.`,
      ].join('\n'),
      examples: ['Rahul', '12 Aug 2026'],
    });
  }
  return out;
}

const MISSED_CALL_CALLBACK_V4_TEMPLATES = buildMissedCallCallbackV4Templates();
const MISSED_CALL_CALLBACK_V5_TEMPLATES = buildMissedCallCallbackV5Templates();

function letterFooterBlock(brand, callPhone) {
  const chatUrl = `https://wa.me/${String(callPhone || brand.phone).replace(/\D/g, '')}`;
  return [
    `Thank you for choosing ${brand.label}.`,
    `Call:\n${brand.phone}`,
    `Email:\n${brand.email}`,
    `Website:\n${brand.webHost}`,
    `Text us:\n${chatUrl}`,
  ].join('\n');
}

/** Call / Email / Website — each value on the next line (no Text us / wa.me). */
function letterFooterBlockNoTextUs(brand) {
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
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlock(b, callPhone);
    const chatUrl = `https://wa.me/${callPhone.replace(/\D/g, '')}`;
    const base = { callPhone, chatUrl, websiteUrl: b.website };
    out.push({
      ...base,
      name: `svc_job_done_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your completed water purifier service.\n\nAmount collected: INR {{2}}\nInvoice / Job: {{3}}\n\n${footer}\n\nReply on this chat if you need any help.`,
      examples: ['Rahul', '1500', 'RO2608121234'],
    });
    out.push({
      ...base,
      name: `svc_balance_due_letter_${suffix}_v3`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your pending payment for water purifier service.\n\nAmount pending: INR {{2}}\nDue date: {{3}}\nInvoice / Job: {{4}}\n\n${footer}\n\nTap Pay now below or reply on this chat if you have already paid.`,
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

/**
 * Booking cancelled letter v5 — notice only (no "Reply BOOK to reschedule").
 * Footer: Call / Email / Website only (no Text us / wa.me).
 * (v4 name stuck in Meta delete; use v5.)
 */
function buildBookingCancelledLetterV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_booking_cancelled_letter_${suffix}_v5`,
      body: [
        `Hi {{1}},`,
        `This is an update from ${b.label} regarding your water purifier service booking.`,
        ``,
        `Your booking for {{2}} has been cancelled.`,
        ``,
        footer,
        ``,
        `Reply on this chat if you need any help.`,
      ].join('\n'),
      examples: ['Rahul', 'Tue 12 Aug, 2:00 PM'],
    });
  }
  return out;
}

const BOOKING_CANCELLED_LETTER_V4_TEMPLATES = buildBookingCancelledLetterV4Templates();

/**
 * Booking confirmed letter v4 — light emojis + Call/Email/Website footer (no Text us).
 * Buttons: Call us + Website. Both brands.
 */
function buildBookingConfirmedLetterV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_booking_confirmed_letter_${suffix}_v4`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your service booking. ✅`,
        ``,
        `📋 Booking: {{2}}`,
        `📅 Confirmed for: {{3}}`,
        ``,
        footer,
        ``,
        `💬 Reply on this chat if you need to change the date or time.`,
      ].join('\n'),
      examples: ['Rahul', 'RO2608121234', 'Tue 12 Aug, 2:00 PM'],
    });
  }
  return out;
}

const BOOKING_CONFIRMED_LETTER_V4_TEMPLATES = buildBookingConfirmedLetterV4Templates();

/**
 * Service-due letter v4 — Call us + Website + QUICK_REPLY "Book now".
 * Tapping Book now hits the webhook → booking bot asks date/time → creates job
 * (existing customer fast path). URL "Book online" cannot do that.
 */
function buildServiceDueLetterV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_service_due_letter_${suffix}_v4`,
      body: [
        `Hi {{1}},`,
        `This is an update from ${b.label} regarding your water purifier service schedule.`,
        ``,
        `Service due around: {{2}}`,
        ``,
        `Tap Book now below (or reply BOOK) to schedule a visit — we will ask for your preferred date and time.`,
        ``,
        footer,
      ].join('\n'),
      examples: ['Rahul', 'Tue 12 Aug 2026'],
    });
  }
  return out;
}

const SERVICE_DUE_LETTER_V4_TEMPLATES = buildServiceDueLetterV4Templates();

/**
 * Job-done letter v4 — light emojis + Call/Email/Website each on its own line (no Text us).
 * Buttons: Call us + Website (letterPayload).
 */
function buildJobDoneLetterV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_job_done_letter_${suffix}_v4`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your completed water purifier service. ✅`,
        ``,
        `💰 Amount collected: INR {{2}}`,
        `🧾 Invoice / Job: {{3}}`,
        ``,
        footer,
        ``,
        `💬 Reply on this chat if you need any help.`,
      ].join('\n'),
      examples: ['Rahul', '2500', 'INV-2026-0815'],
    });
  }
  return out;
}

const JOB_DONE_LETTER_V4_TEMPLATES = buildJobDoneLetterV4Templates();

/**
 * Job-done letter v5 — Call us + Review us (dynamic /review/{{1}}).
 * Website stays in the body footer. Both brands.
 */
function buildJobDoneLetterV5Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      reviewUrl: `${b.website}/review/{{1}}`,
      name: `svc_job_done_letter_${suffix}_v5`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your completed water purifier service. ✅`,
        ``,
        `💰 Amount collected: INR {{2}}`,
        `🧾 Invoice / Job: {{3}}`,
        ``,
        footer,
        ``,
        `💬 Reply on this chat if you need any help.`,
        ``,
        `Tap Review us below if you have a minute.`,
      ].join('\n'),
      examples: ['Rahul', '2500', 'INV-2026-0815'],
    });
  }
  return out;
}

const JOB_DONE_LETTER_V5_TEMPLATES = buildJobDoneLetterV5Templates();

/**
 * Inbox ask-review — Call us + Review us for the last completed job.
 */
function buildAskReviewTemplates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      websiteUrl: b.website,
      reviewUrl: `${b.website}/review/{{1}}`,
      name: `svc_ask_review_${suffix}_v1`,
      body: [
        `Hi {{1}}, 👋`,
        `Thank you for your recent water purifier service visit with ${b.label}.`,
        ``,
        `Tap Review us below to rate this visit. It takes less than a minute.`,
        ``,
        `💬 Reply on this chat if you need any help.`,
      ].join('\n'),
      examples: ['Rahul'],
    });
  }
  return out;
}

const ASK_REVIEW_TEMPLATES = buildAskReviewTemplates();

/**
 * Job-done letter — same copy as letter style, NO buttons (body only).
 * Footer: Call / Email / Website only (no wa.me — safer for UTILITY).
 */
function buildJobDoneLetterPlainTemplates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_job_done_letter_${suffix}_plain_v1`,
      body: [
        `Hi {{1}},`,
        `This is an update from ${b.label} regarding your completed water purifier service.`,
        ``,
        `Amount collected: INR {{2}}`,
        `Invoice / Job: {{3}}`,
        ``,
        footer,
        ``,
        `Reply on this chat if you need any help.`,
      ].join('\n'),
      examples: ['Rahul', '1500', 'RO2608121234'],
    });
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_job_done_letter_${suffix}_plain_v2`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your completed water purifier service. ✅`,
        ``,
        `💰 Amount collected: INR {{2}}`,
        `🧾 Invoice / Job: {{3}}`,
        ``,
        footer,
        ``,
        `💬 Reply on this chat if you need any help.`,
      ].join('\n'),
      examples: ['Rahul', '2500', 'INV-2026-0815'],
    });
  }
  return out;
}

const JOB_DONE_LETTER_PLAIN_TEMPLATES = buildJobDoneLetterPlainTemplates();

/** Balance-due letter v4 — Call us + Pay now (UPI short link /p/{{1}}). */
function buildBalanceDueLetterV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlock(b, callPhone);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v4`,
      body: `Hi {{1}},\nThis is an update from ${b.label} regarding your pending payment for water purifier service.\n\nAmount pending: INR {{2}}\nDue date: {{3}}\nInvoice / Job: {{4}}\n\n${footer}\n\nTap Pay now below or reply on this chat if you have already paid.`,
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V4_TEMPLATES = buildBalanceDueLetterV4Templates();

/**
 * Balance-due letter v5 — same as v4 (Call us + Pay now) but NO Text us / wa.me in body
 * (Meta MARKETING risk + cleaner copy). Both Eleven + Hydrogen.
 */
function buildBalanceDueLetterV5Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v5`,
      body: [
        `Hi {{1}},`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service.`,
        ``,
        `Amount pending: INR {{2}}`,
        `Due date: {{3}}`,
        `Invoice / Job: {{4}}`,
        ``,
        footer,
        ``,
        `Tap Pay now below or reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V5_TEMPLATES = buildBalanceDueLetterV5Templates();

/**
 * Balance-due letter v6 — same as v5 (Call us + Pay now, no Text us) + light emojis.
 */
function buildBalanceDueLetterV6Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v6`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service. 💧`,
        ``,
        `💰 Amount pending: INR {{2}}`,
        `📅 Due date: {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        footer,
        ``,
        `💳 Tap Pay now below or reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V6_TEMPLATES = buildBalanceDueLetterV6Templates();

/**
 * Balance-due letter with IMAGE header (UPI QR) — Call us + Pay now.
 * Body tells customer to scan/tap the QR (WhatsApp Pay / GPay / PhonePe) or Pay now.
 * CRM attaches the QR JPEG/PNG at send time via headerImage.
 */
function buildBalanceDueLetterImgTemplates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      imageHeader: true,
      name: `svc_balance_due_letter_${suffix}_img_v2`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service. 💧`,
        ``,
        `💰 Amount pending: INR {{2}}`,
        `📅 Due date: {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        `📱 Scan or tap the UPI QR above to pay directly (GPay / PhonePe / WhatsApp Pay).`,
        `Or tap Pay now below.`,
        ``,
        footer,
        ``,
        `Reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_IMG_TEMPLATES = buildBalanceDueLetterImgTemplates();

/** Call / Email / Website — no thank-you (v7 / img_v3). */
function letterFooterBlockContactOnly(brand) {
  return [
    `Call:\n${brand.phone}`,
    `Email:\n${brand.email}`,
    `Website:\n${brand.webHost}`,
  ].join('\n');
}

/** Call only — no thank-you / email / website (v8 / img_v4). */
function letterFooterBlockCallOnly(brand) {
  return `Call:\n${brand.phone}`;
}

/** Balance-due v7 — kept for Meta fallbacks (has email/website). */
function buildBalanceDueLetterV7Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockContactOnly(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v7`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service. 💧`,
        ``,
        `💰 Amount pending: INR {{2}}`,
        `📅 Due date: {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        footer,
        ``,
        `💳 Tap Pay now below or reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V7_TEMPLATES = buildBalanceDueLetterV7Templates();

function buildBalanceDueLetterImgV3Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockContactOnly(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      imageHeader: true,
      name: `svc_balance_due_letter_${suffix}_img_v3`,
      body: [
        `Hi {{1}}, 👋`,
        `Pending payment for your water purifier service — ${b.label}. 💧`,
        ``,
        `💰 Amount: INR {{2}}`,
        `📅 Due: {{3}}`,
        `🧾 Ref: {{4}}`,
        ``,
        `📱 Scan the QR above, or tap Pay now below.`,
        ``,
        footer,
        ``,
        `Reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_IMG_V3_TEMPLATES = buildBalanceDueLetterImgV3Templates();

/**
 * Balance-due letter v8 — Call us + Pay now; Call only in body (no email / website).
 */
function buildBalanceDueLetterV8Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockCallOnly(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v8`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service. 💧`,
        ``,
        `💰 Amount pending: INR {{2}}`,
        `📅 Due date: {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        footer,
        ``,
        `💳 Tap Pay now below or reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V8_TEMPLATES = buildBalanceDueLetterV8Templates();

/**
 * Balance-due IMAGE header v4 — lean QR + Pay now; Call only (no email / website).
 */
function buildBalanceDueLetterImgV4Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockCallOnly(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      imageHeader: true,
      name: `svc_balance_due_letter_${suffix}_img_v4`,
      body: [
        `Hi {{1}}, 👋`,
        `Pending payment for your water purifier service — ${b.label}. 💧`,
        ``,
        `💰 Amount: INR {{2}}`,
        `📅 Due: {{3}}`,
        `🧾 Ref: {{4}}`,
        ``,
        `📱 Scan the QR above, or tap Pay now below.`,
        ``,
        footer,
        ``,
        `Reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_IMG_V4_TEMPLATES = buildBalanceDueLetterImgV4Templates();

/**
 * Balance-due letter v9 — Call us + Pay now buttons only; no Call/Email/Website in body.
 */
function buildBalanceDueLetterV9Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v9`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service. 💧`,
        ``,
        `💰 Amount pending: INR {{2}}`,
        `📅 Due date: {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        `💳 Tap Pay now below or reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V9_TEMPLATES = buildBalanceDueLetterV9Templates();

/**
 * Balance-due letter v10 — Call us + Pay now + Review us.
 */
function buildBalanceDueLetterV10Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      reviewUrl: `${b.website}/review/{{1}}`,
      name: `svc_balance_due_letter_${suffix}_v10`,
      body: [
        `Hi {{1}}, 👋`,
        `This is an update from ${b.label} regarding your pending payment for water purifier service. 💧`,
        ``,
        `💰 Amount pending: INR {{2}}`,
        `📅 Due date: {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        `💳 Tap Pay now below or reply on this chat if you have already paid.`,
        ``,
        `Tap Review us below if you have a minute.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_V10_TEMPLATES = buildBalanceDueLetterV10Templates();

/**
 * Balance-due IMAGE header v5 — lean QR + Pay now; no Call/Email/Website in body.
 */
function buildBalanceDueLetterImgV5Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      imageHeader: true,
      name: `svc_balance_due_letter_${suffix}_img_v5`,
      body: [
        `Hi {{1}}, 👋`,
        `Pending payment for your water purifier service — ${b.label}. 💧`,
        ``,
        `💰 Amount: INR {{2}}`,
        `📅 Due: {{3}}`,
        `🧾 Ref: {{4}}`,
        ``,
        `📱 Scan the QR above, or tap Pay now below.`,
        ``,
        `Reply on this chat if you have already paid.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const BALANCE_DUE_LETTER_IMG_V5_TEMPLATES = buildBalanceDueLetterImgV5Templates();

/**
 * Payment overdue — still unpaid after due date (customer delayed / not clearing).
 * Prior promise / warranty / agreements void; advance will not be returned.
 * Buttons: Call us + Pay now.
 */
function buildPaymentOverdueNoticeV3Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    out.push({
      callPhone,
      websiteUrl: b.website,
      payUrl: `${b.website}/p/{{1}}`,
      name: `svc_payment_overdue_notice_${suffix}_v3`,
      body: [
        `Hi {{1}}, 👋`,
        `This is a payment notice from ${b.label} — the balance for your water purifier service is still unpaid. 💧`,
        ``,
        `💰 Amount still unpaid: INR {{2}}`,
        `📅 Due date (passed): {{3}}`,
        `🧾 Invoice / Job: {{4}}`,
        ``,
        `The promised payment date has passed and this amount remains unpaid. Any earlier promise, warranty, AMC or service agreement, or extension linked to this visit is no longer valid because payment was not completed. Any advance already paid will not be returned.`,
        ``,
        `Tap Pay now below to clear dues. If you need any help, reply on this chat.`,
      ].join('\n'),
      examples: ['Rahul', '500', '15 Aug 2026', 'RO2608121234'],
    });
  }
  return out;
}

const PAYMENT_OVERDUE_NOTICE_V1_TEMPLATES = buildPaymentOverdueNoticeV3Templates();

/**
 * Technician-only: forward a customer payment photo when the 24h session is closed.
 * IMAGE header + "{{1}}" name. No customer-facing buttons.
 */
const TECH_CUSTOMER_PHOTO_TEMPLATES = [
  {
    name: 'svc_tech_customer_photo_v1',
    body: 'This photo was shared by {{1}} on WhatsApp.',
    examples: ['Rahul'],
    imageHeader: true,
  },
];

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
  { slug: 'bill', line: 'Your service bill is attached.', label: 'service bill' },
  { slug: 'invoice', line: 'Your tax invoice is attached.', label: 'tax invoice' },
  { slug: 'amc', line: 'Your AMC agreement is attached.', label: 'AMC agreement' },
  { slug: 'quotation', line: 'Your quotation is attached.', label: 'quotation' },
  { slug: 'warranty', line: 'Your warranty card is attached.', label: 'warranty card' },
  { slug: 'receipt', line: 'Your payment receipt is attached.', label: 'payment receipt' },
  { slug: 'generic', line: 'Your document is attached.', label: 'document' },
  { slug: 'salary', line: 'Your salary slip is attached.', label: 'salary slip' },
];

function buildDocPdfV2Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlock(b, callPhone);
    const chatUrl = `https://wa.me/${callPhone.replace(/\D/g, '')}`;
    for (const kind of DOC_PDF_ATTACHED_LINES) {
      out.push({
        name: `svc_doc_${kind.slug}_${suffix}_v2`,
        callPhone,
        chatUrl,
        websiteUrl: b.website,
        body: `Hi {{1}},\n${kind.line}\n\n${footer}\n\nReply on this chat if you need any help.`,
        examples: ['Rahul'],
      });
    }
  }
  return out;
}

const DOC_PDF_V2_TEMPLATES = buildDocPdfV2Templates();

/**
 * Direct PDF send (no Accept / preview) — letter style + light emojis.
 * {{1}} name, {{2}} document label (AMC agreement, tax invoice, …).
 * DOCUMENT header + Call us + Website. Both brands.
 */
function buildDocDirectLetterTemplates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_doc_direct_${suffix}_v1`,
      body: [
        `Hi {{1}}, 👋`,
        `📄 Your {{2}} from ${b.label} is attached.`,
        ``,
        `💬 Reply on this chat if you need any help.`,
        ``,
        footer,
      ].join('\n'),
      examples: ['Rahul', 'AMC agreement'],
    });
  }
  return out;
}

const DOC_DIRECT_LETTER_TEMPLATES = buildDocDirectLetterTemplates();

/**
 * Per-doc-type direct PDF v3 — letter style + emojis (no Accept). Fixed copy per kind.
 * Prefer these when approved; else svc_doc_direct_*_v1; else v2.
 */
function buildDocPdfV3Templates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    for (const kind of DOC_PDF_ATTACHED_LINES) {
      out.push({
        name: `svc_doc_${kind.slug}_${suffix}_v3`,
        callPhone,
        websiteUrl: b.website,
        body: [
          `Hi {{1}}, 👋`,
          `📄 Your ${kind.label} from ${b.label} is attached.`,
          ``,
          `💬 Reply on this chat if you need any help.`,
          ``,
          footer,
        ].join('\n'),
        examples: ['Rahul'],
      });
    }
  }
  return out;
}

const DOC_PDF_V3_TEMPLATES = buildDocPdfV3Templates();

/**
 * Preview PDF → Accept → original PDF (DOCUMENT header). WhatsApp-only I Accept QR.
 * v6 rejected INCORRECT_CATEGORY. v7/v8 pending Meta approval (Call + I Accept).
 * Do not use v1–v4 (web /c/ Accept URL — not used).
 */
function buildDocAcceptPreviewTemplates() {
  const out = [];
  for (const [suffix, b] of Object.entries(LETTER_BRANDS)) {
    const callPhone = suffix === 'hro' ? CALL_PHONE_HYDROGEN : CALL_PHONE_ELEVEN;
    const footer = letterFooterBlockNoTextUs(b);
    out.push({
      callPhone,
      websiteUrl: b.website,
      name: `svc_doc_accept_preview_${suffix}_v8`,
      body: [
        `Hi {{1}},`,
        ``,
        `Your PREVIEW {{2}} from ${b.label} is attached. This file is for review only — not the final original document.`,
        ``,
        `By tapping I Accept you confirm you have read and agree to the terms and conditions in this PDF, and you request ${b.label} to send the original {{2}} on this WhatsApp chat.`,
        ``,
        `Reply on this chat if you need any help.`,
        ``,
        footer,
      ].join('\n'),
      examples: ['Rahul', 'AMC agreement'],
    });
  }
  return out;
}

const DOC_ACCEPT_PREVIEW_TEMPLATES = buildDocAcceptPreviewTemplates();

/** UTILITY schedule / callback CTAs — Call us (brand phone) + Book online. */
const BOOKING_TEMPLATES = [
  {
    name: 'existing_service_schedule_ero_cta_v3',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.',
    examples: ['Rahul'],
  },
  {
    name: 'unregistered_number_service_ero_cta_v2',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.',
    examples: ['there'],
  },
  {
    name: 'missed_call_callback_ero_cta_v2',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.',
    examples: ['Rahul'],
  },
  {
    name: 'reschedule_visit_ero_cta_v2',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, your Eleven RO visit is set for {{2}}. To reschedule, reply on this chat or use Call / Book online below.',
    examples: ['Rahul', 'Mon 12 Aug, 10:00 AM'],
  },
  {
    name: 'existing_service_schedule_hro_cta_v3',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.',
    examples: ['Rahul'],
  },
  {
    name: 'unregistered_number_service_hro_cta_v2',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.',
    examples: ['there'],
  },
  {
    name: 'missed_call_callback_hro_cta_v2',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.',
    examples: ['Rahul'],
  },
  {
    name: 'reschedule_visit_hro_cta_v2',
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
  const bodyComp = { type: 'BODY', text: t.body };
  if (Array.isArray(t.examples) && t.examples.length > 0) {
    bodyComp.example = { body_text: [t.examples] };
  }
  components.push(bodyComp);
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
    allow_category_change: t.lockCategory === true ? false : true,
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

function websiteUrlForTemplate(name) {
  if (/_hro/i.test(String(name || ''))) return 'https://hydrogenro.com';
  if (/_ero/i.test(String(name || ''))) return 'https://elevenro.com';
  return null;
}

function balanceDueLetterPayload(t) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  const payUrl = t.payUrl || `${(t.websiteUrl || websiteUrlForTemplate(t.name) || 'https://hydrogenro.com').replace(/\/$/, '')}/p/{{1}}`;
  const buttons = [
    { type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone },
    { type: 'URL', text: 'Pay now', url: payUrl, example: ['pay123456'] },
  ];
  if (t.reviewUrl) {
    buttons.push({
      type: 'URL',
      text: 'Review us',
      url: t.reviewUrl,
      example: ['a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
    });
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

function balanceDueLetterImagePayloadSync(t, headerHandle = '') {
  const base = balanceDueLetterPayload(t);
  if (!headerHandle) return base;
  return {
    ...base,
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: [headerHandle] },
      },
      ...base.components,
    ],
  };
}

async function balanceDueLetterImagePayload(t, token = '') {
  const headerHandle = token ? await uploadTemplateSampleImageHandle(token) : '';
  return balanceDueLetterImagePayloadSync(t, headerHandle);
}

function techCustomerPhotoPayloadSync(t, headerHandle = '') {
  const components = [];
  if (headerHandle) {
    components.push({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: [headerHandle] },
    });
  }
  components.push({
    type: 'BODY',
    text: t.body,
    example: { body_text: [t.examples] },
  });
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components,
  };
}

async function techCustomerPhotoPayload(t, token = '') {
  const headerHandle = token ? await uploadTemplateSampleImageHandle(token) : '';
  return techCustomerPhotoPayloadSync(t, headerHandle);
}

function letterPayload(t) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  const websiteUrl = t.websiteUrl || websiteUrlForTemplate(t.name);
  const buttons = [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone }];
  if (t.reviewUrl) {
    buttons.push({
      type: 'URL',
      text: 'Review us',
      url: t.reviewUrl,
      example: ['a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
    });
  } else if (websiteUrl) {
    buttons.push({ type: 'URL', text: 'Website', url: websiteUrl });
  }
  // Meta blocks wa.me on template URL buttons — Text us stays in the body footer.
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

/** Body-only UTILITY (no Call / URL / quick-reply buttons). */
function bodyOnlyPayload(t) {
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
    ],
  };
}

/** Missed-call v4: Call us only. lock UTILITY (Meta moved v3 to MARKETING). */
function missedCallCallbackV4Payload(t) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: false,
    components: [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.examples] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone }],
      },
    ],
  };
}

/** Service-due: Call us + Website + Book now (quick reply → booking bot). */
function serviceDueBookNowPayload(t) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  const websiteUrl = t.websiteUrl || websiteUrlForTemplate(t.name);
  const buttons = [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone }];
  if (websiteUrl) {
    buttons.push({ type: 'URL', text: 'Website', url: websiteUrl });
  }
  buttons.push({ type: 'QUICK_REPLY', text: 'Book now' });
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

/** Ask location v2: Call us + Share location (quick reply → bot Send location). No Website. */
function askLocShareLocationPayload(t) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
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
        buttons: [
          { type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone },
          { type: 'QUICK_REPLY', text: 'Share location' },
        ],
      },
    ],
  };
}

function docPdfPayloadSync(t, headerHandle = SAMPLE_PDF) {
  const websiteUrl = t.websiteUrl || websiteUrlForTemplate(t.name);
  const buttons = [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: t.callPhone }];
  if (websiteUrl) {
    buttons.push({ type: 'URL', text: 'Website', url: websiteUrl });
  }
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'HEADER',
        format: 'DOCUMENT',
        example: { header_handle: [headerHandle] },
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

async function docPdfPayload(t, token = '') {
  const headerHandle = token ? await uploadTemplateSamplePdfHandle(token) : SAMPLE_PDF;
  return docPdfPayloadSync(t, headerHandle);
}

/** Preview PDF + I Accept quick reply → original PDF on same chat (no web Accept URL). */
function docAcceptPreviewPayloadSync(t, headerHandle = SAMPLE_PDF) {
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  const buttons = [
    { type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone },
    { type: 'QUICK_REPLY', text: 'I Accept' },
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
        example: { header_handle: [headerHandle] },
      },
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

async function docAcceptPreviewPayload(t, token) {
  const headerHandle = token ? await uploadTemplateSamplePdfHandle(token) : SAMPLE_PDF;
  return docAcceptPreviewPayloadSync(t, headerHandle);
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
  const callPhone = t.callPhone || callPhoneForTemplate(t.name);
  const buttons = [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: callPhone }];
  if (t.bookUrl) {
    buttons.push({ type: 'URL', text: 'Book online', url: t.bookUrl });
  } else if (t.websiteUrl) {
    buttons.push({ type: 'URL', text: 'Website', url: t.websiteUrl });
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

function fillTemplateBody(body, examples) {
  let out = String(body || '');
  (examples || []).forEach((ex, i) => {
    out = out.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), String(ex ?? ''));
  });
  return out;
}

function brandLabelFromName(name) {
  if (/_ero/i.test(String(name || ''))) return 'Eleven RO';
  if (/_hro/i.test(String(name || ''))) return 'Hydrogen RO';
  return 'Shared';
}

function buttonsPreview(payload) {
  const btns = payload.components?.find((c) => c.type === 'BUTTONS')?.buttons || [];
  if (!btns.length) return '_No buttons_';
  return btns
    .map((b) => {
      if (b.type === 'PHONE_NUMBER') return `**Call us** → \`${b.phone_number}\``;
      if (b.type === 'QUICK_REPLY') return `Quick reply: **${b.text}**`;
      if (b.type === 'URL') {
        const url = String(b.url || '').replace('{{1}}', /\/c\//.test(b.url || '') ? 'Ab3xY9kLmN2pQ8rT' : 'pay123456');
        return `**${b.text || 'Link'}** → ${url}`;
      }
      return String(b.type);
    })
    .join(' · ');
}

function headerPreview(payload) {
  const h = payload.components?.find((c) => c.type === 'HEADER');
  if (!h) return null;
  if (h.format === 'DOCUMENT') return '📎 **PDF attached** (document header — bill / invoice / AMC / etc.)';
  if (h.format === 'IMAGE') return '🖼️ **Image attached** (QR / receipt / photo header)';
  return h.format;
}

function collectAllTemplatePreviewEntries() {
  const entries = [];
  const push = (group, t, payloadFn) => {
    const payload = payloadFn(t);
    entries.push({
      group,
      name: payload.name || t.name,
      brand: brandLabelFromName(t.name),
      body: fillTemplateBody(t.body, t.examples),
      header: headerPreview(payload),
      buttons: buttonsPreview(payload),
      examples: t.examples,
    });
  };

  for (const t of CORE_TEMPLATES) {
    if (t.skipSubmit) continue;
    push('Core UTILITY', t, corePayload);
  }
  for (const t of BOOKING_TEMPLATES) push('Booking CTA', t, bookingPayload);
  for (const t of MISSED_CALL_CALLBACK_V4_TEMPLATES) {
    push('Missed call v4', t, missedCallCallbackV4Payload);
  }
  for (const t of MISSED_CALL_CALLBACK_V5_TEMPLATES) {
    push('Missed call v5', t, missedCallCallbackV4Payload);
  }
  for (const t of SERVICE_DUE_CTA_TEMPLATES) push('Service due CTA', t, bookingPayload);
  for (const t of BOOKING_STATUS_V2_TEMPLATES) push('Booking confirm / cancel v2', t, bookingPayload);
  for (const t of JOB_DONE_V2_TEMPLATES) push('Job done v2', t, jobDonePayload);
  for (const t of JOB_DONE_V3_TEMPLATES) push('Job done v3', t, jobDonePayload);
  for (const t of LETTER_V3_TEMPLATES) push('Letter format v3', t, letterPayload);
  for (const t of JOB_DONE_LETTER_V4_TEMPLATES) {
    push('Job done letter v4 (emoji)', t, letterPayload);
  }
  for (const t of JOB_DONE_LETTER_V5_TEMPLATES) {
    push('Job done letter v5 (Review us)', t, letterPayload);
  }
  for (const t of ASK_REVIEW_TEMPLATES) {
    push('Ask review (last completed job)', t, letterPayload);
  }
  for (const t of BOOKING_CONFIRMED_LETTER_V4_TEMPLATES) {
    push('Booking confirmed letter v4 (emoji)', t, letterPayload);
  }
  for (const t of BOOKING_CANCELLED_LETTER_V4_TEMPLATES) {
    push('Booking cancelled letter v4 (no BOOK)', t, letterPayload);
  }
  for (const t of SERVICE_DUE_LETTER_V4_TEMPLATES) {
    push('Service due letter v4 (Book now)', t, serviceDueBookNowPayload);
  }
  for (const t of JOB_DONE_LETTER_PLAIN_TEMPLATES) {
    push('Job done letter (no buttons)', t, bodyOnlyPayload);
  }
  for (const t of BALANCE_DUE_LETTER_V4_TEMPLATES) push('Balance due letter v4 (Pay now)', t, balanceDueLetterPayload);
  for (const t of BALANCE_DUE_LETTER_V5_TEMPLATES) {
    push('Balance due letter v5 (Pay now, no Text us)', t, balanceDueLetterPayload);
  }
  for (const t of BALANCE_DUE_LETTER_V6_TEMPLATES) {
    push('Balance due letter v6 (Pay now + emoji)', t, balanceDueLetterPayload);
  }
  for (const t of BALANCE_DUE_LETTER_V7_TEMPLATES) {
    push('Balance due letter v7 (Pay now, no thank-you)', t, balanceDueLetterPayload);
  }
  for (const t of BALANCE_DUE_LETTER_V8_TEMPLATES) {
    push('Balance due letter v8 (Pay now, Call only)', t, balanceDueLetterPayload);
  }
  for (const t of BALANCE_DUE_LETTER_V9_TEMPLATES) {
    push('Balance due letter v9 (Pay now, no contact footer)', t, balanceDueLetterPayload);
  }
  for (const t of BALANCE_DUE_LETTER_V10_TEMPLATES) {
    push('Balance due letter v10 (Pay now + Review us)', t, balanceDueLetterPayload);
  }
  for (const t of PAYMENT_OVERDUE_NOTICE_V1_TEMPLATES) {
    push('Payment overdue notice v1 (Pay now)', t, balanceDueLetterPayload);
  }
  for (const t of BALANCE_DUE_LETTER_IMG_TEMPLATES) {
    push('Balance due letter IMAGE header (Pay now)', t, (x) =>
      balanceDueLetterImagePayloadSync(x, 'SAMPLE_IMAGE_HANDLE')
    );
  }
  for (const t of BALANCE_DUE_LETTER_IMG_V3_TEMPLATES) {
    push('Balance due letter IMAGE v3 (lean + Pay now)', t, (x) =>
      balanceDueLetterImagePayloadSync(x, 'SAMPLE_IMAGE_HANDLE')
    );
  }
  for (const t of BALANCE_DUE_LETTER_IMG_V4_TEMPLATES) {
    push('Balance due letter IMAGE v4 (Call only + Pay now)', t, (x) =>
      balanceDueLetterImagePayloadSync(x, 'SAMPLE_IMAGE_HANDLE')
    );
  }
  for (const t of BALANCE_DUE_LETTER_IMG_V5_TEMPLATES) {
    push('Balance due letter IMAGE v5 (no contact footer + Pay now)', t, (x) =>
      balanceDueLetterImagePayloadSync(x, 'SAMPLE_IMAGE_HANDLE')
    );
  }
  for (const t of TECH_CUSTOMER_PHOTO_TEMPLATES) {
    push('Technician customer photo IMAGE', t, (x) =>
      techCustomerPhotoPayloadSync(x, 'SAMPLE_IMAGE_HANDLE')
    );
  }
  for (const t of EXISTING_CUSTOMER_BOOK_CTA_TEMPLATES) push('Existing customer book', t, bookOnlyPayload);
  for (const t of SERVICE_DUE_BOOK_CTA_TEMPLATES) push('Service due book CTA', t, bookOnlyPayload);
  for (const t of WFS_HELLO_TEMPLATES) push('WFS hello', t, corePayload);
  for (const t of WFS_SIMPLE_HI_TEMPLATES) push('WFS simple hi', t, corePayload);
  for (const t of WFS_JUST_HI_TEMPLATES) push('WFS just hi', t, corePayload);
  // skip WFS_HI_FROM — superseded by hello / “This is …” (MARKETING-prone)
  for (const t of WFS_V3_UTILITY_TEMPLATES) push('WFS greeting v3', t, corePayload);
  for (const t of WFS_COLLECT_TEMPLATES) push('WFS collect info', t, corePayload);
  for (const t of WFS_ASK_NAME_TEMPLATES) push('WFS ask name', t, corePayload);
  for (const t of WFS_ASK_NAME_SIMPLE_TEMPLATES) push('WFS ask name (short)', t, corePayload);
  // skip legacy ask-loc / ask-loc-simple (no version) — prefer ask_loc_from + v3
  for (const t of WFS_ASK_LOC_FROM_TEMPLATES) {
    push('WFS ask location from WFS (Share location)', t, askLocShareLocationPayload);
  }
  for (const t of WFS_ASK_LOC_FLAT_PHOTO_TEMPLATES) {
    push('WFS ask loc + flat + photo (Share location)', t, askLocShareLocationPayload);
  }
  for (const t of WFS_ASK_LOC_V2_TEMPLATES) {
    push('WFS ask location v3 (Share location)', t, askLocShareLocationPayload);
  }
  for (const t of WFS_ASK_LOC_SIMPLE_V2_TEMPLATES) {
    push('WFS ask location short v3 (Share location)', t, askLocShareLocationPayload);
  }
  for (const t of DOC_PDF_V2_TEMPLATES) push('Cold PDF v2', t, docPdfPayloadSync);
  for (const t of DOC_DIRECT_LETTER_TEMPLATES) {
    push('Direct PDF letter (any doc, no Accept)', t, docPdfPayloadSync);
  }
  for (const t of DOC_PDF_V3_TEMPLATES) {
    push('Cold PDF v3 (letter + emoji, no Accept)', t, docPdfPayloadSync);
  }
  for (const t of DOC_ACCEPT_PREVIEW_TEMPLATES) {
    // Preview MD does not need a live Meta media handle.
    push('Doc accept preview (Accept → original)', t, (x) => docAcceptPreviewPayloadSync(x));
  }

  return entries.sort((a, b) => {
    const bg = a.brand.localeCompare(b.brand);
    if (bg) return bg;
    const gg = a.group.localeCompare(b.group);
    if (gg) return gg;
    return a.name.localeCompare(b.name);
  });
}

async function writeColdTemplatePreviewMarkdown(token) {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const outPath = resolve(
    root,
    process.argv.find((a, i) => process.argv[i - 1] === '--preview-md-out') ||
      'docs/whatsapp-cold-template-previews.md'
  );
  mkdirSync(dirname(outPath), { recursive: true });

  const entries = collectAllTemplatePreviewEntries();
  const byName = token ? new Map((await listTemplates(token)).map((t) => [t.name, t])) : new Map();
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  const lines = [
    '# WhatsApp cold templates — live preview (Eleven RO & Hydrogen RO)',
    '',
    `Generated: **${now} IST** · WABA \`${WABA_ID}\``,
    '',
    'How to read this doc:',
    '- **Message** = what the customer sees in WhatsApp (sample vars filled: Rahul, amounts, dates).',
    '- **Buttons** = Meta template quick-action row under the message (cold / outside 24h window only).',
    '- **Text us** appears in the *message body* on letter/PDF templates (Meta blocks `wa.me` on URL buttons).',
    '- **24h window open** → CRM sends free-form text instead; wording matches these templates.',
    '',
    '| Call us (voice) | Eleven RO | Hydrogen RO |',
    '|---|---|---|',
    '| Main line | 9880693311 | 8884944288 |',
    '| Website | elevenro.com | hydrogenro.com |',
    '| Pay now link | elevenro.com/p/{code} | hydrogenro.com/p/{code} |',
    '| Accept link | elevenro.com/c/{token} | hydrogenro.com/c/{token} |',
    '',
    '---',
    '',
  ];

  let lastBrand = '';
  let lastGroup = '';
  for (const e of entries) {
    if (e.brand !== lastBrand) {
      lastBrand = e.brand;
      lastGroup = '';
      lines.push(`## ${e.brand}`);
      lines.push('');
    }
    if (e.group !== lastGroup) {
      lastGroup = e.group;
      lines.push(`### ${e.group}`);
      lines.push('');
    }

    const meta = byName.get(e.name);
    const statusBadge = meta
      ? `\`${meta.status}\` ${meta.category || ''}`
      : '_not on WABA yet_';

    lines.push(`#### \`${e.name}\``);
    lines.push('');
    lines.push(`Meta status: ${statusBadge}`);
    lines.push('');
    if (e.header) {
      lines.push(e.header);
      lines.push('');
    }
    lines.push('**Message**');
    lines.push('');
    lines.push('```');
    lines.push(e.body);
    lines.push('```');
    lines.push('');
    lines.push(`**Buttons:** ${e.buttons}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Wrote ${entries.length} template previews → ${outPath}`);
}

async function main() {
  console.log(`WABA ${WABA_ID}`);
  console.log(`Call us — Eleven RO: ${CALL_PHONE_ELEVEN} · Hydrogen RO: ${CALL_PHONE_HYDROGEN}`);
  const token = await resolveToken();
  if (previewMd) {
    if (!token) {
      console.error('Missing WHATSAPP_ACCESS_TOKEN (needed for Meta status labels)');
      process.exit(1);
    }
    await writeColdTemplatePreviewMarkdown(token);
    return;
  }
  if (!token && (doSubmit || statusOnly)) {
    console.error('Missing WHATSAPP_ACCESS_TOKEN');
    process.exit(1);
  }

  const all = token ? await listTemplates(token) : [];
  const byName = new Map(all.map((t) => [t.name, t]));

  if ((deleteMarketing || deleteOld) && token) {
    console.log('\nDeleting MARKETING / superseded templates…\n');
    const liveMarketing = deleteMarketing
      ? all
          .filter((t) => String(t.category || '').toUpperCase() === 'MARKETING')
          .map((t) => t.name)
      : [];
    const toDelete = [
      ...new Set([
        ...(deleteMarketing ? MARKETING_DELETE_NAMES : []),
        ...(deleteOld || deleteMarketing ? SUPERSEDED_DELETE_NAMES : []),
        ...liveMarketing,
      ]),
    ];
    for (const name of toDelete) {
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
  for (const t of MISSED_CALL_CALLBACK_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: missedCallCallbackV4Payload(t) });
  }
  for (const t of MISSED_CALL_CALLBACK_V5_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: missedCallCallbackV4Payload(t) });
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
  for (const t of JOB_DONE_LETTER_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of JOB_DONE_LETTER_V5_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of ASK_REVIEW_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of BOOKING_CONFIRMED_LETTER_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of BOOKING_CANCELLED_LETTER_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: letterPayload(t) });
  }
  for (const t of SERVICE_DUE_LETTER_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: serviceDueBookNowPayload(t) });
  }
  for (const t of JOB_DONE_LETTER_PLAIN_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: bodyOnlyPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V5_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V6_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V7_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V8_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V9_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_V10_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of PAYMENT_OVERDUE_NOTICE_V1_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: balanceDueLetterPayload(t) });
  }
  for (const t of BALANCE_DUE_LETTER_IMG_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({
      label: t.name,
      payload: await balanceDueLetterImagePayload(t, doSubmit ? token : ''),
    });
  }
  for (const t of BALANCE_DUE_LETTER_IMG_V3_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({
      label: t.name,
      payload: await balanceDueLetterImagePayload(t, doSubmit ? token : ''),
    });
  }
  for (const t of BALANCE_DUE_LETTER_IMG_V4_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({
      label: t.name,
      payload: await balanceDueLetterImagePayload(t, doSubmit ? token : ''),
    });
  }
  for (const t of BALANCE_DUE_LETTER_IMG_V5_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({
      label: t.name,
      payload: await balanceDueLetterImagePayload(t, doSubmit ? token : ''),
    });
  }
  for (const t of TECH_CUSTOMER_PHOTO_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({
      label: t.name,
      payload: await techCustomerPhotoPayload(t, doSubmit ? token : ''),
    });
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
  for (const t of WFS_JUST_HI_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of WFS_HI_FROM_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of WFS_V3_UTILITY_TEMPLATES) {
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
  for (const t of WFS_ASK_NAME_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: corePayload(t) });
  }
  for (const t of WFS_ASK_NAME_SIMPLE_TEMPLATES) {
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
  for (const t of WFS_ASK_LOC_V2_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: askLocShareLocationPayload(t) });
  }
  for (const t of WFS_ASK_LOC_SIMPLE_V2_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: askLocShareLocationPayload(t) });
  }
  for (const t of WFS_ASK_LOC_FROM_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: askLocShareLocationPayload(t) });
  }
  for (const t of WFS_ASK_LOC_FLAT_PHOTO_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: askLocShareLocationPayload(t) });
  }
  for (const t of DOC_PDF_V2_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: await docPdfPayload(t, doSubmit ? token : '') });
  }
  for (const t of DOC_DIRECT_LETTER_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: await docPdfPayload(t, doSubmit ? token : '') });
  }
  for (const t of DOC_PDF_V3_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({ label: t.name, payload: await docPdfPayload(t, doSubmit ? token : '') });
  }
  for (const t of DOC_ACCEPT_PREVIEW_TEMPLATES) {
    const skip = shouldSkip(t.name, byName);
    if (skip) {
      console.log(`SKIP ${t.name} — ${skip}`);
      continue;
    }
    queue.push({
      label: t.name,
      payload: await docAcceptPreviewPayload(t, doSubmit ? token : ''),
    });
  }

  const onlyMissedCallV4 =
    process.argv.includes('--only-missed-call-v4') ||
    process.argv.includes('--only-missed-call-v3');
  if (onlyMissedCallV4) {
    const keep = new Set([
      ...MISSED_CALL_CALLBACK_V4_TEMPLATES.map((t) => t.name),
      'svc_missed_call_v3',
    ]);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyMissedCallV5 = process.argv.includes('--only-missed-call-v5');
  if (onlyMissedCallV5) {
    const keep = new Set(MISSED_CALL_CALLBACK_V5_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyDocAccept = process.argv.includes('--only-doc-accept');
  if (onlyDocAccept) {
    const keep = new Set(DOC_ACCEPT_PREVIEW_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyDocDirect = process.argv.includes('--only-doc-direct');
  if (onlyDocDirect) {
    const keep = new Set([
      ...DOC_DIRECT_LETTER_TEMPLATES.map((t) => t.name),
      ...DOC_PDF_V3_TEMPLATES.map((t) => t.name),
    ]);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlySalarySlip = process.argv.includes('--only-salary-slip');
  if (onlySalarySlip) {
    const keep = new Set(
      [...DOC_PDF_V3_TEMPLATES, ...DOC_PDF_V2_TEMPLATES]
        .filter((t) => /svc_doc_salary_/i.test(t.name))
        .map((t) => t.name)
    );
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyJobDonePlain = process.argv.includes('--only-job-done-plain');
  if (onlyJobDonePlain) {
    const keep = new Set(JOB_DONE_LETTER_PLAIN_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyJobDoneLetterV4 = process.argv.includes('--only-job-done-letter-v4');
  if (onlyJobDoneLetterV4) {
    const keep = new Set([
      ...JOB_DONE_LETTER_V4_TEMPLATES.map((t) => t.name),
      ...JOB_DONE_LETTER_PLAIN_TEMPLATES.filter((t) => /_plain_v2$/i.test(t.name)).map((t) => t.name),
    ]);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyJobReviewCta = process.argv.includes('--only-job-review-cta');
  if (onlyJobReviewCta) {
    const keep = new Set([
      ...JOB_DONE_LETTER_V5_TEMPLATES.map((t) => t.name),
      ...BALANCE_DUE_LETTER_V10_TEMPLATES.map((t) => t.name),
      ...ASK_REVIEW_TEMPLATES.map((t) => t.name),
    ]);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyAskReview = process.argv.includes('--only-ask-review');
  if (onlyAskReview) {
    const keep = new Set(ASK_REVIEW_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyServiceDueBookNow = process.argv.includes('--only-service-due-book-now');
  if (onlyServiceDueBookNow) {
    const keep = new Set(SERVICE_DUE_LETTER_V4_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBalanceDueV5 = process.argv.includes('--only-balance-due-v5');
  if (onlyBalanceDueV5) {
    const keep = new Set(BALANCE_DUE_LETTER_V5_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBalanceDueV6 = process.argv.includes('--only-balance-due-v6');
  if (onlyBalanceDueV6) {
    const keep = new Set(BALANCE_DUE_LETTER_V6_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBalanceDueV7 = process.argv.includes('--only-balance-due-v7');
  if (onlyBalanceDueV7) {
    const keep = new Set(BALANCE_DUE_LETTER_V7_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBalanceDueImg = process.argv.includes('--only-balance-due-img');
  if (onlyBalanceDueImg) {
    const keep = new Set(BALANCE_DUE_LETTER_IMG_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBalanceDueImgV3 = process.argv.includes('--only-balance-due-img-v3');
  if (onlyBalanceDueImgV3) {
    const keep = new Set(BALANCE_DUE_LETTER_IMG_V3_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBalanceDueLean = process.argv.includes('--only-balance-due-lean');
  if (onlyBalanceDueLean) {
    const keep = new Set([
      ...BALANCE_DUE_LETTER_V9_TEMPLATES.map((t) => t.name),
      ...BALANCE_DUE_LETTER_IMG_V5_TEMPLATES.map((t) => t.name),
    ]);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyPaymentOverdue = process.argv.includes('--only-payment-overdue');
  if (onlyPaymentOverdue) {
    const keep = new Set(PAYMENT_OVERDUE_NOTICE_V1_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyTechCustomerPhoto = process.argv.includes('--only-tech-customer-photo');
  if (onlyTechCustomerPhoto) {
    const keep = new Set(TECH_CUSTOMER_PHOTO_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyAskLocShare = process.argv.includes('--only-ask-loc-share');
  if (onlyAskLocShare) {
    const keep = new Set([
      ...WFS_ASK_LOC_V2_TEMPLATES.map((t) => t.name),
      ...WFS_ASK_LOC_SIMPLE_V2_TEMPLATES.map((t) => t.name),
    ]);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyAskLocFrom = process.argv.includes('--only-ask-loc-from');
  if (onlyAskLocFrom) {
    const keep = new Set(WFS_ASK_LOC_FROM_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyAskLocFlatPhoto = process.argv.includes('--only-ask-loc-flat-photo');
  if (onlyAskLocFlatPhoto) {
    const keep = new Set(WFS_ASK_LOC_FLAT_PHOTO_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyAskName = process.argv.includes('--only-ask-name');
  if (onlyAskName) {
    const keep = new Set(WFS_ASK_NAME_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyAskNameSimple = process.argv.includes('--only-ask-name-simple');
  if (onlyAskNameSimple) {
    const keep = new Set(WFS_ASK_NAME_SIMPLE_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBookingConfirmedV4 = process.argv.includes('--only-booking-confirmed-v4');
  if (onlyBookingConfirmedV4) {
    const keep = new Set(BOOKING_CONFIRMED_LETTER_V4_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBookingCancelledV4 = process.argv.includes('--only-booking-cancelled-v4');
  if (onlyBookingCancelledV4) {
    const keep = new Set(BOOKING_CANCELLED_LETTER_V4_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
  }

  const onlyBookingCtaV3 = process.argv.includes('--only-booking-cta-v3');
  if (onlyBookingCtaV3) {
    const keep = new Set(BOOKING_TEMPLATES.map((t) => t.name));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (!keep.has(queue[i].label)) queue.splice(i, 1);
    }
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
