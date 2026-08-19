/**
 * Shared technician field-day digest (hours, km, office-arrival end time).
 * Used by the 9 PM tech overlay cron and Settings on-demand load.
 */

const {
  istDayBounds,
  computeTechWorkedHours,
  formatWorkedHoursPushBody,
  formatWorkedDuration,
  formatIstClock,
} = require('./tech-worked-hours-helper');

function nowMsForIstDateKey(dateKey, fallbackNow = Date.now()) {
  const raw = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallbackNow;
  const noon = Date.parse(`${raw}T12:00:00+05:30`);
  if (!Number.isFinite(noon)) return fallbackNow;
  const { dayStartUtc, dayEndUtc } = istDayBounds(noon);
  const now = fallbackNow;
  if (now >= dayStartUtc && now < dayEndUtc) return now;
  return dayEndUtc - 1;
}

function slimKm(kmLabel) {
  return String(kmLabel || '')
    .replace(/^~/, '')
    .trim();
}

async function jobsByTechnician(db, nowMs) {
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
    throw new Error(startErr?.message || doneErr?.message || 'Jobs query failed');
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
  return byTech;
}

async function collectTechFieldDay(db, nowMs = Date.now()) {
  const {
    totalTravelKmForTechnician,
    formatTravelKm,
    getOfficeLocation,
    resolveOfficeReturnDuration,
  } = require('./tech-travel-helper');

  const byTech = await jobsByTechnician(db, nowMs);
  const techIds = [...byTech.keys()];
  const { data: techRows } = techIds.length
    ? await db
        .from('technicians')
        .select('id, full_name, push_notifications_enabled')
        .in('id', techIds)
    : { data: [] };
  const techById = new Map((techRows || []).map((row) => [row.id, row]));

  let office = null;
  try {
    office = await getOfficeLocation(db);
  } catch (err) {
    console.warn('[tech-field-day] office location skipped', err?.message || err);
  }

  const rows = [];
  for (const [technicianId, jobs] of byTech.entries()) {
    const techRow = techById.get(technicianId);
    const name = String(techRow?.full_name || 'Technician').trim() || 'Technician';
    const summary = computeTechWorkedHours(jobs, nowMs);
    const extra = {};
    let travel = null;
    try {
      travel = await totalTravelKmForTechnician(db, jobs, nowMs);
      if (travel?.km != null && travel.km > 0) {
        extra.kmLabel = formatTravelKm(travel.km) || '';
      }
    } catch (err) {
      console.warn('[tech-field-day] travel km skipped', name, err?.message || err);
    }
    try {
      const durationSec = await resolveOfficeReturnDuration(
        jobs,
        office,
        nowMs,
        travel?.returnKm
      );
      if (durationSec) extra.officeReturnSec = durationSec;
    } catch (err) {
      console.warn('[tech-field-day] office return skipped', name, err?.message || err);
    }

    const overlayBody = formatWorkedHoursPushBody(summary, extra);
    const live = Boolean(summary.live);
    const hoursLabel =
      summary.durationMs != null ? formatWorkedDuration(summary.durationMs) : null;
    const fromLabel =
      summary.firstStartMs != null ? formatIstClock(summary.firstStartMs) : null;
    const endMs =
      summary.lastCompleteMs != null
        ? summary.lastCompleteMs +
          (Number(extra.officeReturnSec) > 0 ? extra.officeReturnSec * 1000 : 0)
        : null;
    const toLabel = endMs != null ? formatIstClock(endMs) : null;

    rows.push({
      technicianId,
      name,
      live,
      hoursLabel,
      fromLabel,
      toLabel,
      kmLabel: slimKm(extra.kmLabel),
      overlayBody,
      pushEnabled: techRow?.push_notifications_enabled !== false,
      jobsStarted: (jobs || []).filter((j) => j.start_time).length,
      jobsCompleted: summary.completedCount || 0,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return {
    officeSet: Boolean(office),
    rows,
  };
}

module.exports = {
  nowMsForIstDateKey,
  collectTechFieldDay,
};
