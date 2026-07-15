// Local end-to-end test of multi-device technician push:
// 1) verifies the register RPC exists,
// 2) inserts a fake second "device" token for the technician,
// 3) runs the same sendToTechnicianDevices helper the functions use,
// 4) confirms the real device is reached and cleans up the fake row.
// Usage: node scripts/test-multidevice-push.cjs

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getMessaging, getTechnicianFcmTokens, sendToTechnicianDevices } =
  require('../netlify/functions/fcm-helper.js');

function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const FAKE_TOKEN = 'TEST-FAKE-DEVICE-TOKEN-' + 'x'.repeat(40);

(async () => {
  const env = loadEnvLocal();
  const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Firebase credential (same source as the functions).
  const { data: secret } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', 'firebase_service_account')
    .maybeSingle();
  process.env.FIREBASE_SERVICE_ACCOUNT = secret?.value || '';

  // 1) RPC exists? Service role has no auth.uid(), so a correct install
  //    answers with our own "invalid token registration" exception.
  const rpc = await db.rpc('register_technician_push_token', { p_token: FAKE_TOKEN });
  if (rpc.error?.message?.includes('invalid token registration')) {
    console.log('1. RPC exists and guards anonymous callers ✓');
  } else if (rpc.error?.code === 'PGRST202' || /not find|does not exist/i.test(rpc.error?.message || '')) {
    console.log('1. RPC MISSING — run scripts/add-technician-push-tokens.sql fully ✗');
    process.exit(1);
  } else {
    console.log('1. RPC responded unexpectedly:', rpc.error?.message || 'no error');
  }

  // Find the technician who has a real device (legacy token).
  const { data: legacy } = await db
    .from('technician_live_locations')
    .select('technician_id,fcm_token')
    .not('fcm_token', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!legacy) {
    console.log('No technician with a registered device found — open the tech app once first.');
    process.exit(1);
  }
  const techId = legacy.technician_id;
  const { data: tech } = await db.from('technicians').select('full_name').eq('id', techId).maybeSingle();
  console.log(`   Testing with: ${tech?.full_name || techId}`);

  // 2) Fake second device.
  const ins = await db
    .from('technician_push_tokens')
    .upsert({ token: FAKE_TOKEN, technician_id: techId, updated_at: new Date().toISOString() });
  if (ins.error) {
    console.log('2. Could not insert fake device row ✗:', ins.error.message);
    process.exit(1);
  }
  console.log('2. Fake second device registered ✓');

  // 3) Token union should now contain both devices.
  const tokens = await getTechnicianFcmTokens(db, techId);
  console.log(`3. getTechnicianFcmTokens -> ${tokens.length} token(s)`,
    tokens.includes(FAKE_TOKEN) && tokens.includes(legacy.fcm_token) ? '✓ (both found)' : '✗');

  // 4) Real fan-out send (the fake token will fail at FCM, the real one lands).
  const messaging = await getMessaging(db);
  const { sent, tokens: total } = await sendToTechnicianDevices(db, messaging, techId, (token) => ({
    token,
    notification: {
      title: 'Test: multi-device push',
      body: 'If you got this, multi-device fan-out works.',
    },
    data: { type: 'job_notification' },
    android: {
      priority: 'high',
      notification: { channelId: 'job_alerts_v2', defaultSound: true, color: '#0369A1' },
    },
  }));
  console.log(`4. Fan-out: ${sent}/${total} delivered (fake device is expected to fail) ${sent >= 1 ? '✓' : '✗'}`);

  // 5) Clean up the fake row (unless FCM already pruned it as stale).
  await db.from('technician_push_tokens').delete().eq('token', FAKE_TOKEN);
  const { count } = await db
    .from('technician_push_tokens')
    .select('token', { count: 'exact', head: true })
    .eq('token', FAKE_TOKEN);
  console.log(`5. Cleanup ✓ (fake rows remaining: ${count})`);
  process.exit(0);
})();
