#!/usr/bin/env node
/**
 * Minimal strict UTILITY templates — faster Meta review.
 *
 * Strategy:
 *  - Delete PENDING clutter that flooded the review queue
 *  - Submit a small set of clearly transactional bodies
 *  - NO URL / "Book online" buttons (those often stall or reclass to MARKETING)
 *  - Optional PHONE_NUMBER button only
 *
 * Usage:
 *   node scripts/submit-whatsapp-minimal-utility.mjs              # dry-run
 *   node scripts/submit-whatsapp-minimal-utility.mjs --delete-pending
 *   node scripts/submit-whatsapp-minimal-utility.mjs --submit
 *   node scripts/submit-whatsapp-minimal-utility.mjs --delete-pending --submit
 *
 * Token: WHATSAPP_ACCESS_TOKEN in .env.local, or app_secrets.whatsapp_access_token
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvLocal() {
  const p = resolve(root, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const WABA_ID = process.env.WHATSAPP_WABA_ID || '1854517668845707';
const GRAPH = process.env.GRAPH_VERSION || 'v21.0';
const CALL_PHONE = process.env.WHATSAPP_CALL_PHONE || '+918792467611';
const doSubmit = process.argv.includes('--submit');
const doDeletePending = process.argv.includes('--delete-pending');
const KEEP_NAMES = new Set(['hello_world']);

/**
 * Ultra-clear UTILITY — tied to a specific visit/payment/assignment/document.
 * No discounts, renewals, “book now”, or marketing CTAs.
 */
const MINIMAL_TEMPLATES = [
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
    name: 'svc_document_ready',
    body: 'Hi {{1}}, your {{2}} is ready. Reply YES on this chat and we will share it with you.',
    examples: ['Rahul', 'service bill'],
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

function payloadFor(t) {
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
        buttons: [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: CALL_PHONE }],
      },
    ],
  };
}

async function listTemplates(token) {
  const out = [];
  let after = null;
  for (let i = 0; i < 10; i++) {
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

async function deleteByName(token, name) {
  return graph(
    token,
    `${encodeURIComponent(WABA_ID)}/message_templates?name=${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
}

async function submitOne(token, payload) {
  return graph(token, `${encodeURIComponent(WABA_ID)}/message_templates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function main() {
  const statusOnly = process.argv.includes('--status');
  console.log(`WABA ${WABA_ID}`);
  if (!statusOnly) {
    console.log(`Mode: ${doDeletePending ? 'DELETE-PENDING ' : ''}${doSubmit ? 'SUBMIT' : 'DRY-RUN'}\n`);
  }

  const token = await resolveToken();
  if ((doSubmit || doDeletePending || statusOnly) && !token) {
    console.error('Missing WhatsApp access token (.env.local or app_secrets)');
    process.exit(1);
  }

  if (statusOnly && token) {
    const all = await listTemplates(token);
    const counts = {};
    for (const t of all) {
      const s = t.status || '?';
      counts[s] = (counts[s] || 0) + 1;
    }
    console.log('Status counts:', counts);
    for (const t of all.sort((a, b) => String(a.name).localeCompare(b.name))) {
      console.log(`  ${String(t.status).padEnd(10)} ${String(t.category || '').padEnd(10)} ${t.name}`);
    }
    return;
  }

  if (doDeletePending) {
    console.log('— Delete PENDING templates (keep hello_world + already APPROVED) —');
    const all = await listTemplates(token);
    const pending = all.filter(
      (t) => String(t.status).toUpperCase() === 'PENDING' && !KEEP_NAMES.has(t.name)
    );
    // Also delete old conflicting names we're replacing if still pending/rejected
    const replaceNames = new Set(MINIMAL_TEMPLATES.map((t) => t.name));
    const also = all.filter(
      (t) =>
        replaceNames.has(t.name) &&
        String(t.status).toUpperCase() !== 'APPROVED' &&
        !pending.some((p) => p.name === t.name)
    );
    const toDelete = [...pending, ...also];
    console.log(`Found ${toDelete.length} to delete\n`);
    for (const t of toDelete) {
      console.log(`  delete ${t.name} (${t.status} ${t.category || ''})`);
      if (!doDeletePending) continue;
      const r = await deleteByName(token, t.name);
      console.log(`   → ${r.status}`, JSON.stringify(r.data));
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log('');
  }

  console.log('— Minimal UTILITY payloads —\n');
  for (const t of MINIMAL_TEMPLATES) {
    const payload = payloadFor(t);
    console.log(`• ${t.name}`);
    console.log(`  ${t.body}`);
    if (!doSubmit) {
      console.log('');
      continue;
    }
    const result = await submitOne(token, payload);
    console.log(result.ok ? '  OK' : '  FAIL', result.status, JSON.stringify(result.data));
    console.log('');
    await new Promise((r) => setTimeout(r, 600));
  }

  if (doSubmit) {
    console.log('Submitted. Recheck status in a few minutes:');
    console.log('  node scripts/submit-whatsapp-minimal-utility.mjs --status');
  } else if (!doDeletePending) {
    console.log(
      'Dry-run. Run:\n  node scripts/submit-whatsapp-minimal-utility.mjs --delete-pending --submit'
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
