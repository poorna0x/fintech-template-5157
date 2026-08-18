#!/usr/bin/env node
/**
 * Replay a Meta-shaped inbound WhatsApp webhook against the local dev server.
 *
 * Meta only delivers to one callback URL, which stays pointed at production.
 * This signs a synthetic payload with the same app secret so the local
 * webhook accepts it and runs the real inbound pipeline end to end,
 * including AI auto reply and the booking bot.
 *
 * Usage:
 *   node scripts/whatsapp-webhook-replay.cjs <phone> "<message text>"
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const {
  getServiceSupabase,
  getWhatsAppCredentials,
  normalizePhoneE164,
} = require('../netlify/functions/whatsapp-helper');

const WEBHOOK_URL =
  process.env.WEBHOOK_REPLAY_URL || 'http://localhost:8888/.netlify/functions/whatsapp-webhook';

async function main() {
  const rawPhone = process.argv[2];
  const text = process.argv.slice(3).join(' ').trim();
  if (!rawPhone || !text) {
    console.error('Usage: node scripts/whatsapp-webhook-replay.cjs <phone> "<message text>"');
    process.exit(1);
  }

  const phone = normalizePhoneE164(rawPhone);
  if (!phone) {
    console.error(`Could not normalize phone: ${rawPhone}`);
    process.exit(1);
  }

  const db = getServiceSupabase();
  const { appSecret, phoneNumberId } = await getWhatsAppCredentials(db);
  if (!appSecret) {
    console.error('whatsapp_app_secret is missing; the local webhook would reject the signature.');
    process.exit(1);
  }

  // A fresh id every run so idempotency claims do not treat this as a retry.
  const waMessageId = `wamid.LOCALREPLAY${Date.now()}`;
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'local-replay',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId, display_phone_number: phoneNumberId },
              contacts: [{ wa_id: phone, profile: { name: 'Local Replay' } }],
              messages: [
                {
                  from: phone,
                  id: waMessageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body: rawBody,
  });

  console.log(`POST ${WEBHOOK_URL} -> ${response.status} ${await response.text()}`);
  console.log(`Sent as ${waMessageId} from ${phone}: ${text}`);

  const { data } = await db
    .from('whatsapp_ai_auto_reply_claims')
    .select('status, reason')
    .eq('inbound_wa_message_id', waMessageId)
    .maybeSingle();
  console.log('Auto reply claim:', data || '(none — AI auto reply did not run)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
