// One-off: send a dummy notification to every registered admin phone on the
// job_alerts_v2 channel to verify the custom sound (new APK required).
// Usage: node scripts/send-test-admin-push.cjs

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

  // Firebase credential lives in app_secrets (same as the Netlify functions).
  const { data: secret, error: secretErr } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', 'firebase_service_account')
    .maybeSingle();
  if (secretErr || !secret?.value) {
    console.error('Could not read firebase_service_account from app_secrets:', secretErr?.message);
    process.exit(1);
  }

  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(secret.value)) });

  const { data: tokenRows, error: tokErr } = await db.from('admin_push_tokens').select('token');
  if (tokErr) {
    console.error('Token lookup failed:', tokErr.message);
    process.exit(1);
  }
  const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
  console.log(`Found ${tokens.length} admin device token(s)`);
  if (tokens.length === 0) process.exit(0);

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Test: custom sound check',
      body: 'If you hear the new HydrogenRO chime, the sound works. (Needs the updated app.)',
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
