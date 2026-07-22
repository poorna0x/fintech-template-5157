// One-off: send a dummy notification to admin phones that have push enabled
// (same filter as production Netlify functions). Respects Device Tracker
// "All push off" and per-type toggles.
//
// Usage:
//   node scripts/send-test-admin-push.cjs           # enabled devices only
//   node scripts/send-test-admin-push.cjs --force   # all registered devices

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getAdminFcmTokens } = require('../netlify/functions/fcm-helper');

function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

(async () => {
  const forceAll = process.argv.includes('--force');
  const env = loadEnvLocal();
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: secret, error: secretErr } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', 'firebase_service_account')
    .maybeSingle();
  if (secretErr || !secret?.value) {
    console.error('Could not read firebase_service_account from app_secrets:', secretErr?.message);
    process.exit(1);
  }

  const firebaseAdmin = require('firebase-admin');
  firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(JSON.parse(secret.value)) });

  let tokens;
  if (forceAll) {
    const { data: tokenRows, error: tokErr } = await db.from('admin_push_tokens').select('token');
    if (tokErr) {
      console.error('Token lookup failed:', tokErr.message);
      process.exit(1);
    }
    tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
    console.log(`--force: sending to all ${tokens.length} registered token(s) (ignores push off)`);
  } else {
    tokens = await getAdminFcmTokens(db, 'job_status');
    const { data: allRows } = await db.from('admin_push_tokens').select('token, push_enabled');
    const muted = (allRows || []).filter((r) => r.push_enabled === false).length;
    if (muted > 0) {
      console.log(`Skipping ${muted} device(s) with "All push off" (use --force to include them)`);
    }
  }

  console.log(`Sending to ${tokens.length} admin device token(s)`);
  if (tokens.length === 0) {
    console.log('Nothing to send — all admin devices have push muted.');
    process.exit(0);
  }

  const res = await firebaseAdmin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Test: Device Tracker push check',
      body: 'If push is ON for this phone, you should see this. Muted phones are skipped.',
    },
    data: { type: 'job_event' },
    android: {
      priority: 'high',
      notification: { channelId: 'job_alerts_v2', color: '#0369A1' },
    },
  });

  res.responses.forEach((r, i) => {
    const t = tokens[i].slice(0, 12) + '…';
    if (r.success) console.log(`  sent -> ${t}`);
    else console.log(`  FAILED -> ${t}: ${r.error?.code || r.error?.message}`);
  });
  console.log(`Done: ${res.successCount} sent, ${res.failureCount} failed`);
  process.exit(0);
})();
