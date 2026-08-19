// One-off: admin-only test of the technician worked-hours digest.
// Does NOT notify technicians.
//
//   node scripts/send-test-admin-worked-hours.cjs

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getAdminFcmTokens } = require('../netlify/functions/fcm-helper');
const {
  istDayBounds,
  computeTechWorkedHours,
  formatWorkedHoursNamedLine,
} = require('../netlify/functions/tech-worked-hours-helper');

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

  const nowMs = Date.now();
  const { dayStartUtc, dayEndUtc } = istDayBounds(nowMs);
  const dayStartIso = new Date(dayStartUtc).toISOString();
  const dayEndIso = new Date(dayEndUtc).toISOString();
  const cols =
    'id,assigned_technician_id,start_time,completed_at,end_time,service_location,service_address,requirements,customer:customers(location,address)';

  const [{ data: started, error: startErr }, { data: completed, error: doneErr }] =
    await Promise.all([
      db
        .from('jobs')
        .select(cols)
        .gte('start_time', dayStartIso)
        .lt('start_time', dayEndIso)
        .not('assigned_technician_id', 'is', null),
      db
        .from('jobs')
        .select(cols)
        .or(
          `and(completed_at.gte.${dayStartIso},completed_at.lt.${dayEndIso}),and(end_time.gte.${dayStartIso},end_time.lt.${dayEndIso})`
        )
        .not('assigned_technician_id', 'is', null),
    ]);
  if (startErr || doneErr) {
    console.error('Jobs query failed', startErr?.message || doneErr?.message);
    process.exit(1);
  }

  const byId = new Map();
  for (const row of [...(started || []), ...(completed || [])]) {
    if (row?.id) byId.set(row.id, row);
  }
  const byTech = new Map();
  for (const job of byId.values()) {
    const techId = job.assigned_technician_id;
    if (!techId) continue;
    if (!byTech.has(techId)) byTech.set(techId, []);
    byTech.get(techId).push(job);
  }

  const techIds = [...byTech.keys()];
  const { data: techRows } = techIds.length
    ? await db.from('technicians').select('id, full_name').in('id', techIds)
    : { data: [] };
  const techById = new Map((techRows || []).map((row) => [row.id, row]));

  const {
    totalTravelKmForTechnician,
    formatTravelKm,
    getOfficeLocation,
    resolveOfficeReturnDuration,
  } = require('../netlify/functions/tech-travel-helper');

  let office = null;
  try {
    office = await getOfficeLocation(db);
  } catch (err) {
    console.warn('Office location skipped', err?.message || err);
  }

  const adminLines = [];
  for (const [technicianId, jobs] of byTech.entries()) {
    const techName = String(techById.get(technicianId)?.full_name || 'Technician').trim() || 'Technician';
    const summary = computeTechWorkedHours(jobs, nowMs);
    const extra = {};
    let travel = null;
    try {
      travel = await totalTravelKmForTechnician(db, jobs, nowMs);
      if (travel?.km != null && travel.km > 0) {
        extra.kmLabel = formatTravelKm(travel.km) || '';
      }
    } catch (err) {
      console.warn('Travel km skipped', techName, err?.message || err);
    }
    try {
      const durationSec = await resolveOfficeReturnDuration(jobs, office, nowMs, travel?.returnKm);
      if (durationSec) extra.officeReturnSec = durationSec;
    } catch (err) {
      console.warn('Office return skipped', techName, err?.message || err);
    }
    const named = formatWorkedHoursNamedLine(techName, summary, extra);
    if (named) adminLines.push(named);
  }

  if (!adminLines.length) {
    adminLines.push(
      'TEST — no technician hours found for today yet. This is the new admin digest format.'
    );
  }

  const body = adminLines.join('\n');
  console.log('--- digest ---');
  console.log(body);
  console.log('--------------');

  const { data: secret, error: secretErr } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', 'firebase_service_account')
    .maybeSingle();
  if (secretErr || !secret?.value) {
    console.error('Could not read firebase_service_account from app_secrets');
    process.exit(1);
  }

  const firebaseAdmin = require('firebase-admin');
  firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(JSON.parse(secret.value)) });

  let tokens = await getAdminFcmTokens(db, 'tech_worked_hours');
  if (!tokens.length) {
    tokens = await getAdminFcmTokens(db, 'day_summary');
  }
  console.log(`Sending admin-only test to ${tokens.length} device(s)`);
  if (!tokens.length) {
    console.log('No admin push tokens.');
    process.exit(0);
  }

  const res = await firebaseAdmin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'TEST · Technician hours today',
      body,
    },
    data: { type: 'tech_worked_hours' },
    android: {
      priority: 'high',
      notification: {
        channelId: 'job_alerts_v2',
        defaultSound: true,
        color: '#0EA5E9',
        tag: 'tech-worked-hours-test',
      },
    },
  });

  res.responses.forEach((r, i) => {
    const t = String(tokens[i] || '').slice(0, 12) + '…';
    if (r.success) console.log(`  sent -> ${t}`);
    else console.log(`  FAILED -> ${t}: ${r.error?.code || r.error?.message}`);
  });
  console.log(`Done: ${res.successCount} sent, ${res.failureCount} failed (technicians not notified)`);
  process.exit(res.failureCount && !res.successCount ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
