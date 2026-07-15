// One-off: send a dummy notification to every technician phone with a
// registered FCM token, on the job_alerts_v2 channel, to verify the custom
// sound (new APK required). Usage: node scripts/send-test-tech-push.cjs

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
  const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: secret } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', 'firebase_service_account')
    .maybeSingle();
  if (!secret?.value) {
    console.error('Could not read firebase_service_account from app_secrets');
    process.exit(1);
  }
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(secret.value)) });

  const { data: rows, error } = await db
    .from('technician_live_locations')
    .select('technician_id,fcm_token')
    .not('fcm_token', 'is', null);
  if (error) {
    console.error('Token lookup failed:', error.message);
    process.exit(1);
  }

  // Names to make the output readable.
  const ids = (rows || []).map((r) => r.technician_id);
  const { data: techs } = await db.from('technicians').select('id,full_name').in('id', ids);
  const nameById = new Map((techs || []).map((t) => [t.id, t.full_name]));

  console.log(`Found ${rows.length} technician device token(s)`);
  for (const row of rows || []) {
    const name = nameById.get(row.technician_id) || row.technician_id;
    try {
      await admin.messaging().send({
        token: row.fcm_token,
        notification: {
          title: 'Test: custom sound check',
          body: 'If you hear the new HydrogenRO alert sound, it works. (Needs the updated app.)',
        },
        data: { type: 'job_notification' },
        android: {
          priority: 'high',
          notification: { channelId: 'job_alerts_v2', color: '#0369A1' },
        },
      });
      console.log(`  sent -> ${name}`);
    } catch (err) {
      console.log(`  FAILED -> ${name}: ${err?.errorInfo?.code || err?.message}`);
    }
  }
  process.exit(0);
})();
