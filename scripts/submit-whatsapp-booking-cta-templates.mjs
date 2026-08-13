#!/usr/bin/env node
/**
 * Dual-brand booking CTA templates (Eleven RO + Hydrogen RO) on one WABA.
 *
 * Utility fixes:
 *   existing_service_schedule_{ero|hro}_cta     (was book_existing_* → MARKETING)
 *   missed_call_callback_{ero|hro}_cta          (was missed_call_book_* → MARKETING)
 *   unregistered_number_service_{ero|hro}_cta   (was new_customer_service_setup_* → MARKETING)
 *
 *   node scripts/submit-whatsapp-booking-cta-templates.mjs --submit
 *   node scripts/submit-whatsapp-booking-cta-templates.mjs --submit --only-existing
 *   node scripts/submit-whatsapp-booking-cta-templates.mjs --submit --only-missed-call
 *   node scripts/submit-whatsapp-booking-cta-templates.mjs --submit --only-new-customer
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadEnvLocal,
  resolveWhatsAppCallPhones,
  callPhoneForTemplate,
} from './whatsapp-call-phone-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnvLocal();

const WABA_ID = process.env.WHATSAPP_WABA_ID || '1854517668845707';
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
const GRAPH = process.env.GRAPH_VERSION || 'v21.0';
const doSubmit = process.argv.includes('--submit');
const onlyExisting = process.argv.includes('--only-existing');
const onlyMissedCall = process.argv.includes('--only-missed-call');
const onlyNewCustomer = process.argv.includes('--only-new-customer');
const { eleven: CALL_PHONE_ELEVEN, hydrogen: CALL_PHONE_HYDROGEN } = resolveWhatsAppCallPhones();

const DELETE_BY_FLAG = {
  existing: [
    'book_existing_customer_cta',
    'book_existing_customer_ero_cta',
    'book_existing_customer_hro_cta',
    'existing_service_schedule_ero_cta',
    'existing_service_schedule_hro_cta',
  ],
  missed: [
    'missed_call_book_cta',
    'missed_call_book_ero_cta',
    'missed_call_book_hro_cta',
    'missed_call_callback_ero_cta',
    'missed_call_callback_hro_cta',
  ],
  newCustomer: [
    'book_new_customer_cta',
    'book_new_customer_ero_cta',
    'book_new_customer_hro_cta',
    'new_customer_service_setup_ero_cta',
    'new_customer_service_setup_hro_cta',
    'unregistered_number_service_ero_cta',
    'unregistered_number_service_hro_cta',
  ],
};

const ALL_TEMPLATES = [
  {
    name: 'existing_service_schedule_ero_cta',
    kind: 'existing',
    brand: 'Eleven RO',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.',
    examples: ['Rahul'],
  },
  {
    name: 'unregistered_number_service_ero_cta',
    kind: 'newCustomer',
    brand: 'Eleven RO',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.',
    examples: ['there'],
  },
  {
    name: 'missed_call_callback_ero_cta',
    kind: 'missed',
    brand: 'Eleven RO',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, this is Eleven RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.',
    examples: ['Rahul'],
  },
  {
    name: 'reschedule_visit_ero_cta',
    kind: 'other',
    brand: 'Eleven RO',
    bookUrl: 'https://elevenro.com/book',
    body: 'Hi {{1}}, your Eleven RO visit is set for {{2}}. To reschedule, reply on this chat or use Call / Book online below.',
    examples: ['Rahul', 'Mon 12 Aug, 10:00 AM'],
  },
  {
    name: 'existing_service_schedule_hro_cta',
    kind: 'existing',
    brand: 'Hydrogen RO',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.',
    examples: ['Rahul'],
  },
  {
    name: 'unregistered_number_service_hro_cta',
    kind: 'newCustomer',
    brand: 'Hydrogen RO',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.',
    examples: ['there'],
  },
  {
    name: 'missed_call_callback_hro_cta',
    kind: 'missed',
    brand: 'Hydrogen RO',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, this is Hydrogen RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.',
    examples: ['Rahul'],
  },
  {
    name: 'reschedule_visit_hro_cta',
    kind: 'other',
    brand: 'Hydrogen RO',
    bookUrl: 'https://hydrogenro.com/book',
    body: 'Hi {{1}}, your Hydrogen RO visit is set for {{2}}. To reschedule, reply on this chat or use Call / Book online below.',
    examples: ['Rahul', 'Mon 12 Aug, 10:00 AM'],
  },
];

let TEMPLATES = ALL_TEMPLATES;
let DELETE_NAMES = [
  ...DELETE_BY_FLAG.existing,
  ...DELETE_BY_FLAG.missed,
  ...DELETE_BY_FLAG.newCustomer,
  'booking_confirmed_ero_cta',
  'booking_confirmed_hro_cta',
  'svc_booking_menu',
  'booking_menu',
  'service_reminder_cta',
  'service_due_notice_cta',
  'customer_followup_cta',
  'customer_update_notice_cta',
  'amc_renewal',
];
if (onlyExisting) {
  TEMPLATES = ALL_TEMPLATES.filter((t) => t.kind === 'existing');
  DELETE_NAMES = DELETE_BY_FLAG.existing;
} else if (onlyMissedCall) {
  TEMPLATES = ALL_TEMPLATES.filter((t) => t.kind === 'missed');
  DELETE_NAMES = DELETE_BY_FLAG.missed;
} else if (onlyNewCustomer) {
  TEMPLATES = ALL_TEMPLATES.filter((t) => t.kind === 'newCustomer');
  DELETE_NAMES = DELETE_BY_FLAG.newCustomer;
}

function payloadFor(t) {
  const callPhone = callPhoneForTemplate(t.name, t.brand);
  return {
    name: t.name,
    language: 'en',
    category: 'UTILITY',
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
          { type: 'URL', text: 'Book online', url: t.bookUrl },
        ],
      },
    ],
  };
}

async function graph(path, opts = {}) {
  const url = `https://graph.facebook.com/${GRAPH}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function deleteByName(name) {
  return graph(
    `${encodeURIComponent(WABA_ID)}/message_templates?name=${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
}

async function submitOne(payload) {
  return graph(`${encodeURIComponent(WABA_ID)}/message_templates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function main() {
  const mode = onlyExisting
    ? 'existing-only'
    : onlyMissedCall
      ? 'missed-call-only'
      : onlyNewCustomer
        ? 'new-customer-only'
        : 'all booking CTAs';
  console.log(`WABA ${WABA_ID} · ${mode} · ${doSubmit ? 'SUBMIT' : 'DRY-RUN'}\n`);

  console.log('Delete old / marketing-prone names:');
  for (const name of DELETE_NAMES) {
    console.log(`  delete ${name}`);
    if (!doSubmit) continue;
    if (!TOKEN) {
      console.error('Missing WHATSAPP_ACCESS_TOKEN');
      process.exit(1);
    }
    const r = await deleteByName(name);
    console.log(`   → ${r.status}`, JSON.stringify(r.data));
  }
  console.log('');

  for (const t of TEMPLATES) {
    const payload = payloadFor(t);
    console.log(`— ${t.brand} · ${t.name}`);
    console.log(`  Book URL: ${t.bookUrl}`);
    console.log(`  Body: ${t.body}`);
    if (!doSubmit) {
      console.log('');
      continue;
    }
    const result = await submitOne(payload);
    console.log(result.ok ? 'OK' : 'FAIL', result.status, JSON.stringify(result.data));
    console.log('');
  }

  if (!doSubmit) {
    console.log(
      'Dry-run. Example: node scripts/submit-whatsapp-booking-cta-templates.mjs --submit --only-new-customer'
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
