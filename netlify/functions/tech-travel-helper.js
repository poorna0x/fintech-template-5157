/**
 * Technician day travel: office → first Start Work → next jobs → office at 9 PM.
 * Road km via Distance Matrix (avoid=tolls). Legs stored on jobs.requirements.
 */

const OFFICE_KEY = 'office_location';
const { istDayBounds, parseMs } = require('./tech-worked-hours-helper');
const { drivingDistanceMetersAvoidTolls } = require('./google-avoid-tolls-distance');

function parseRequirements(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((r) => r && typeof r === 'object');
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

function readLatLng(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const lat = Number(obj.latitude ?? obj.lat);
  const lng = Number(obj.longitude ?? obj.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function coordsFromMapsText(text) {
  if (!text || typeof text !== 'string') return null;
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const pair = readLatLng({ lat: Number(m[1]), lng: Number(m[2]) });
    if (pair) return pair;
  }
  return null;
}

function jobCoords(job) {
  if (!job) return null;
  const customer = job.customer || {};
  const address = customer.address && typeof customer.address === 'object' ? customer.address : {};
  return (
    readLatLng(job.service_location) ||
    readLatLng(customer.location) ||
    coordsFromMapsText(typeof job.service_address === 'string' ? job.service_address : '') ||
    coordsFromMapsText(String(address.google_maps_url || address.maps_url || address.location_url || ''))
  );
}

function parseOfficeValue(value) {
  if (!value || typeof value !== 'object') return null;
  return readLatLng(value);
}

function roundKm(km) {
  return Math.round(Number(km) * 10) / 10;
}

function saneKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return n;
}

function getTravelLegKm(job) {
  const reqs = parseRequirements(job?.requirements);
  const row = reqs.find((r) => r && r.travel_leg && Number.isFinite(Number(r.travel_leg.km)));
  if (!row) return null;
  const km = Number(row.travel_leg.km);
  return km >= 0 ? km : null;
}

function getTravelReturnKm(job) {
  const reqs = parseRequirements(job?.requirements);
  const row = reqs.find((r) => r && r.travel_leg && Number.isFinite(Number(r.travel_leg.return_km)));
  if (!row) return null;
  const km = Number(row.travel_leg.return_km);
  return km >= 0 ? km : null;
}

function applyTravelLeg(requirements, km, fromLabel, extra) {
  const reqs = parseRequirements(requirements).filter((r) => !r.travel_leg);
  const returnKm = extra && extra.returnKm != null ? saneKm(extra.returnKm) : null;
  reqs.push({
    travel_leg: {
      km: roundKm(km),
      from: fromLabel,
      computed_at: new Date().toISOString(),
      avoid_tolls: true,
      ...(returnKm != null ? { return_km: roundKm(returnKm) } : {}),
    },
  });
  return reqs;
}

function formatTravelKm(km) {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 0.05) return '0 km';
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function sumStoredTravelKm(jobs) {
  let total = 0;
  let any = false;
  for (const job of jobs || []) {
    const km = getTravelLegKm(job);
    if (km == null) continue;
    total += km;
    any = true;
  }
  return any ? total : 0;
}

function jobsStartedTodaySorted(jobs, nowMs = Date.now()) {
  const { dayStartUtc, dayEndUtc } = istDayBounds(nowMs);
  return (jobs || [])
    .map((job) => ({ job, start: parseMs(job.start_time) }))
    .filter((row) => row.start != null && row.start >= dayStartUtc && row.start < dayEndUtc)
    .sort((a, b) => a.start - b.start)
    .map((row) => row.job);
}

async function getOfficeLocation(db) {
  const { data, error } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', OFFICE_KEY)
    .maybeSingle();
  if (error) {
    console.warn('[tech-travel] office_location read failed', error.message);
    return null;
  }
  return parseOfficeValue(data?.value);
}

async function findPreviousJobToday(db, technicianId, jobId, startIso, nowMs = Date.now()) {
  const { dayStartUtc, dayEndUtc } = istDayBounds(nowMs);
  const { data, error } = await db
    .from('jobs')
    .select('id,start_time,service_location,service_address,requirements,customer:customers(location,address)')
    .eq('assigned_technician_id', technicianId)
    .neq('id', jobId)
    .gte('start_time', new Date(dayStartUtc).toISOString())
    .lt('start_time', startIso || new Date(dayEndUtc).toISOString())
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[tech-travel] previous job query failed', error.message);
    return null;
  }
  return data || null;
}

async function loadJobForTravel(db, jobId) {
  const { data: job, error } = await db
    .from('jobs')
    .select(
      'id,assigned_technician_id,start_time,service_location,service_address,requirements,customer:customers(location,address)'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (error || !job) return null;
  return job;
}

async function resolveLegContext(db, job, nowMs = Date.now()) {
  const dest = jobCoords(job);
  if (!dest) return { ok: false, reason: 'no_dest_coords' };
  const office = await getOfficeLocation(db);
  const previous = job.assigned_technician_id
    ? await findPreviousJobToday(db, job.assigned_technician_id, job.id, job.start_time, nowMs)
    : null;
  const prevCoords = previous ? jobCoords(previous) : null;
  const origin = prevCoords || office;
  const fromLabel = prevCoords ? `job:${previous.id}` : 'office';
  if (!origin) return { ok: false, reason: prevCoords ? 'no_origin_coords' : 'no_office' };
  return { ok: true, dest, office, origin, fromLabel };
}

async function saveTravelLeg(db, job, km, fromLabel, returnKm) {
  const nextReqs = applyTravelLeg(job.requirements, km, fromLabel, { returnKm });
  const { error: upErr } = await db.from('jobs').update({ requirements: nextReqs }).eq('id', job.id);
  if (upErr) {
    console.warn('[tech-travel] save leg failed', upErr.message);
    return { ok: false, reason: 'save_failed', km };
  }
  return { ok: true, km, from: fromLabel };
}

async function computeAndStoreLegForJob(db, jobId, nowMs = Date.now()) {
  const job = await loadJobForTravel(db, jobId);
  if (!job) return { ok: false, reason: 'no_job' };
  if (getTravelLegKm(job) != null) return { ok: true, skipped: 'already', km: getTravelLegKm(job) };

  const ctx = await resolveLegContext(db, job, nowMs);
  if (!ctx.ok) return ctx;

  const meters = await drivingDistanceMetersAvoidTolls(ctx.origin, ctx.dest);
  if (meters == null) {
    return {
      ok: false,
      reason: 'need_client',
      origin: ctx.origin,
      dest: ctx.dest,
      office: ctx.office,
    };
  }
  const km = meters / 1000;
  let returnKm = null;
  if (ctx.office) {
    const retMeters = await drivingDistanceMetersAvoidTolls(ctx.dest, ctx.office);
    if (retMeters != null) returnKm = retMeters / 1000;
  }
  return saveTravelLeg(db, job, km, ctx.fromLabel, returnKm);
}

async function storeClientLegForJob(db, jobId, kmRaw, returnKmRaw, nowMs = Date.now()) {
  const km = saneKm(kmRaw);
  if (km == null) return { ok: false, reason: 'bad_km' };
  const job = await loadJobForTravel(db, jobId);
  if (!job) return { ok: false, reason: 'no_job' };
  if (getTravelLegKm(job) != null) return { ok: true, skipped: 'already', km: getTravelLegKm(job) };

  const ctx = await resolveLegContext(db, job, nowMs);
  if (!ctx.ok) return ctx;
  const returnKm = returnKmRaw != null ? saneKm(returnKmRaw) : null;
  return saveTravelLeg(db, job, km, ctx.fromLabel, returnKm);
}

async function backfillMissingLegs(db, jobs, nowMs = Date.now()) {
  const sorted = jobsStartedTodaySorted(jobs, nowMs);
  for (const job of sorted) {
    if (getTravelLegKm(job) != null) continue;
    await computeAndStoreLegForJob(db, job.id, nowMs);
  }
}

async function returnToOfficeKm(lastJob, office) {
  if (!office) return null;
  const origin = jobCoords(lastJob);
  if (!origin) return null;
  const meters = await drivingDistanceMetersAvoidTolls(origin, office);
  if (meters == null) return null;
  return meters / 1000;
}

async function totalTravelKmForTechnician(db, jobs, nowMs = Date.now()) {
  const office = await getOfficeLocation(db);
  const ids = [...new Set((jobs || []).map((j) => j.id).filter(Boolean))];
  if (ids.length === 0) {
    return { km: null, outboundKm: 0, returnKm: null, officeSet: Boolean(office), stops: 0 };
  }
  await backfillMissingLegs(db, jobs, nowMs);
  const { data: refreshed } = await db
    .from('jobs')
    .select('id,start_time,requirements,service_location,service_address,customer:customers(location,address)')
    .in('id', ids);
  const sorted = jobsStartedTodaySorted(refreshed && refreshed.length ? refreshed : jobs, nowMs);
  const outbound = sumStoredTravelKm(sorted);
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  const storedReturn = last ? getTravelReturnKm(last) : null;
  const ret = storedReturn != null ? storedReturn : last ? await returnToOfficeKm(last, office) : null;
  const total = outbound + (ret || 0);
  return {
    km: total > 0 ? Math.round(total * 10) / 10 : null,
    outboundKm: outbound,
    returnKm: ret,
    officeSet: Boolean(office),
    stops: sorted.length,
  };
}

module.exports = {
  OFFICE_KEY,
  parseRequirements,
  readLatLng,
  coordsFromMapsText,
  jobCoords,
  parseOfficeValue,
  getTravelLegKm,
  getTravelReturnKm,
  applyTravelLeg,
  storeClientLegForJob,
  formatTravelKm,
  sumStoredTravelKm,
  jobsStartedTodaySorted,
  getOfficeLocation,
  computeAndStoreLegForJob,
  returnToOfficeKm,
  totalTravelKmForTechnician,
};
