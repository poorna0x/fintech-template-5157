#!/usr/bin/env node
/**
 * Batch-test WhatsApp AI auto-reply via signed local webhook replay.
 * Usage: node scripts/test-ai-auto-reply-batch.cjs [phone]
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

const { Client } = require('pg');
const {
  getServiceSupabase,
  getWhatsAppCredentials,
  normalizePhoneE164,
} = require('../netlify/functions/whatsapp-helper');

const WEBHOOK_URL =
  process.env.WEBHOOK_REPLAY_URL || 'http://localhost:8888/.netlify/functions/whatsapp-webhook';

const QUESTIONS = [
  {
    label: '1. Greeting',
    text: 'Hi',
    expect: 'yield',
  },
  {
    label: '2. RO taste issue',
    text: 'My RO water suddenly tastes salty since morning, what could be wrong?',
    expect: 'sent',
  },
  {
    label: '3. Price ask',
    text: 'How much do you charge for annual AMC?',
    expect: 'escalated',
  },
  {
    label: '4. Booking intent',
    text: 'Can you send a technician tomorrow for filter change?',
    expect: 'yield',
  },
  {
    label: '5. Low pressure',
    text: 'Water flow from my Kent RO is very slow, only a trickle in the kitchen tap',
    expect: 'sent',
  },
  {
    label: '6. Complaint',
    text: 'Your technician came yesterday and left a mess, I am very angry',
    expect: 'escalated',
  },
  {
    label: '7. Location share prompt',
    text: 'I am at HSR Layout sector 2 near BDA complex, apartment 401',
    expect: 'sent',
  },
  {
    label: '8. Random non-service',
    text: "What's today's date?",
    expect: 'escalated_or_no_send',
  },
  {
    label: '9. Filter replacement timing',
    text: 'It has been 8 months since last service, should I change sediment filter now?',
    expect: 'sent',
  },
  {
    label: '10. Payment promise',
    text: 'I will pay cash when technician comes, is that ok?',
    expect: 'escalated',
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function replayOne({ phone, phoneNumberId, appSecret, text }) {
  const waMessageId = `wamid.LOCALBATCH${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'local-batch',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId, display_phone_number: phoneNumberId },
              contacts: [{ wa_id: phone, profile: { name: 'Batch Test' } }],
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
  const bodyText = await response.text();
  await sleep(3500);
  return { waMessageId, status: response.status, bodyText };
}

async function fetchOutcome(pg, waMessageId, phone) {
  const claim = await pg.query(
    `SELECT status, reason FROM public.whatsapp_ai_auto_reply_claims WHERE inbound_wa_message_id = $1`,
    [waMessageId]
  );
  const reply = await pg.query(
    `SELECT body FROM public.whatsapp_messages
     WHERE phone_e164 = $1 AND direction = 'outbound' AND created_at > now() - interval '2 minutes'
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  return {
    claim: claim.rows[0] || null,
    reply: reply.rows[0]?.body || null,
  };
}

async function main() {
  const rawPhone = process.argv[2] || '916361631253';
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) {
    console.error('Bad phone');
    process.exit(1);
  }

  const db = getServiceSupabase();
  const { appSecret, phoneNumberId } = await getWhatsAppCredentials(db);
  if (!appSecret) {
    console.error('Missing whatsapp_app_secret');
    process.exit(1);
  }

  const setting = await db
    .from('whatsapp_chat_ai_settings')
    .select('auto_reply_enabled')
    .eq('phone_e164', phone)
    .maybeSingle();
  if (!setting.data?.auto_reply_enabled) {
    console.warn(`Warning: auto_reply_enabled is OFF for ${phone}. Tests may not run AI path.`);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  console.log(`\n=== AI auto-reply batch test (${phone}) ===\n`);

  const results = [];
  for (const q of QUESTIONS) {
    process.stdout.write(`${q.label} … `);
    try {
      const { waMessageId, status } = await replayOne({
        phone,
        phoneNumberId,
        appSecret,
        text: q.text,
      });
      const { claim, reply } = await fetchOutcome(pg, waMessageId, phone);
      const claimStatus = claim?.status || 'none';
      const ok =
        q.expect === 'sent'
          ? claimStatus === 'sent'
          : q.expect === 'yield'
            ? claimStatus === 'yielded'
            : q.expect === 'escalated'
              ? claimStatus === 'escalated'
              : ['escalated', 'failed'].includes(claimStatus) || claimStatus === 'none';
      results.push({
        ...q,
        claimStatus,
        reason: claim?.reason || '',
        reply: reply || '(no outbound)',
        http: status,
        pass: ok,
      });
      console.log(ok ? 'PASS' : 'CHECK', `→ ${claimStatus}`);
    } catch (err) {
      results.push({ ...q, error: err.message, pass: false });
      console.log('FAIL', err.message);
    }
    await sleep(1500);
  }

  console.log('\n=== Detailed results ===\n');
  for (const r of results) {
    console.log(`${r.label}`);
    console.log(`  Q: ${r.text}`);
    console.log(`  Expected: ${r.expect}`);
    console.log(`  Claim: ${r.claimStatus || r.error || 'none'}${r.reason ? ` (${r.reason})` : ''}`);
    if (r.reply) console.log(`  Reply: ${String(r.reply).slice(0, 280)}`);
    console.log(`  Verdict: ${r.pass ? '✓' : '✗'}\n`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`Summary: ${passed}/${results.length} matched expectation\n`);
  await pg.end();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
