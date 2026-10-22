/**
 * Eleven RO careers page.
 * POST { action: 'status' } — public, returns { open }
 * POST { action: 'apply', ... } — public, when hiring is open
 * POST { action: 'list' | 'hiring' | 'update' | 'delete' } — full admin JWT
 */
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { readBearerToken, verifyFullAdminBearerToken, authorizeAdminRequest } = require('./admin-auth-guard');
const { checkRateLimit } = require('./rate-limiter');
const { notifyAdminsJobApplication } = require('./job-application-notify');

const EXPERIENCE = new Set(['fresher', 'experienced']);
const EDUCATION = new Set([
  'iti',
  'diploma',
  'electrical',
  'electronics',
  'mechanical',
  'plumbing',
  'other',
  'none',
]);
const STATUS = new Set(['new', 'contacted', 'hired', 'not_selected']);

const BRANDS = new Set(['elevenro', 'hydrogenro']);

const APPLICATION_COLUMNS =
  'id,created_at,full_name,phone,email,area,experience,experience_detail,education,has_two_wheeler,has_licence,field_work_ok,note,status,admin_notes,brand';

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function getServiceDb() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function missingTable(error) {
  const message = String(error?.message || '');
  return error?.code === '42P01' || /does not exist|schema cache|elevenro_job_applications|elevenro_hiring_settings/i.test(message);
}

function cleanLine(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

function cleanName(raw) {
  const name = cleanLine(raw, 80);
  if (name.length < 2) return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) return null;
  return name;
}

function cleanEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return '';
  if (email.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function asBool(value) {
  return value === true;
}

async function requireFullAdmin(event) {
  if (typeof verifyFullAdminBearerToken === 'function') {
    const session = await verifyFullAdminBearerToken(readBearerToken(event));
    if (!session.ok) return session;
    return { ok: true, userId: session.userId };
  }
  return authorizeAdminRequest(event);
}

async function readHiringOpen(db) {
  const { data, error } = await db
    .from('elevenro_hiring_settings')
    .select('is_open')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return { open: false, missing: true };
    throw error;
  }
  return { open: data?.is_open === true, missing: false };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const headers = { ...getCorsHeaders(origin), 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }
  if (!isOriginAllowed(origin)) {
    return json(403, headers, { error: 'Forbidden' });
  }
  if (String(event.body || '').length > 8000) {
    return json(413, headers, { error: 'Request is too large' });
  }

  const db = getServiceDb();
  if (!db) return json(500, headers, { error: 'Server misconfigured' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }
  const action = String(body.action || '').trim();

  if (action === 'list' || action === 'hiring' || action === 'update' || action === 'delete') {
    const admin = await requireFullAdmin(event);
    if (!admin.ok) return json(admin.error === 'Forbidden' ? 403 : 401, headers, { error: 'Unauthorized' });

    if (action === 'list') {
      const hiring = await readHiringOpen(db).catch((err) => {
        if (missingTable(err)) return { open: false, missing: true };
        throw err;
      });
      if (hiring.missing) {
        return json(200, headers, {
          open: false,
          missing: true,
          applications: [],
        });
      }
      const { data, error } = await db
        .from('elevenro_job_applications')
        .select(APPLICATION_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (missingTable(error)) {
          return json(200, headers, { open: hiring.open, missing: true, applications: [] });
        }
        return json(500, headers, { error: 'Could not load applications' });
      }
      return json(200, headers, { open: hiring.open, applications: data || [] });
    }

    if (action === 'hiring') {
      const open = body.open === true;
      const { error } = await db.from('elevenro_hiring_settings').upsert(
        { id: 1, is_open: open, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
      if (error) {
        if (missingTable(error)) {
          return json(503, headers, { error: 'Run scripts/add-elevenro-job-applications.sql in Supabase first.' });
        }
        return json(500, headers, { error: 'Could not update hiring' });
      }
      return json(200, headers, { open });
    }

    const id = String(body.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, headers, { error: 'Invalid application' });

    if (action === 'delete') {
      const { error } = await db.from('elevenro_job_applications').delete().eq('id', id);
      if (error) return json(500, headers, { error: 'Could not delete application' });
      return json(200, headers, { ok: true });
    }

    const status = String(body.status || '').trim();
    if (!STATUS.has(status)) return json(400, headers, { error: 'Invalid status' });
    const adminNotes = body.adminNotes == null ? undefined : cleanLine(body.adminNotes, 500);
    const patch = { status, updated_at: new Date().toISOString() };
    if (adminNotes !== undefined) patch.admin_notes = adminNotes || null;
    const { data, error } = await db
      .from('elevenro_job_applications')
      .update(patch)
      .eq('id', id)
      .select('id,status,admin_notes,updated_at')
      .maybeSingle();
    if (error) return json(500, headers, { error: 'Could not update application' });
    return json(200, headers, { application: data });
  }

  if (action === 'status') {
    try {
      const hiring = await readHiringOpen(db);
      return json(200, headers, { open: hiring.open === true });
    } catch (err) {
      console.warn('[job-application] status failed', err?.message || err);
      return json(200, headers, { open: false });
    }
  }

  if (action !== 'apply') {
    return json(400, headers, { error: 'Unknown action' });
  }

  const rl = checkRateLimit(event, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    endpoint: 'job-application',
  });
  if (!rl.allowed) {
    return json(429, headers, { error: 'Too many applications from this connection. Try again later.' });
  }

  if (String(body.company_website || '').trim()) {
    return json(200, headers, { ok: true });
  }

  let hiring;
  try {
    hiring = await readHiringOpen(db);
  } catch (err) {
    console.warn('[job-application] hiring read failed', err?.message || err);
    return json(503, headers, { error: 'Applications are not available right now.' });
  }
  if (!hiring.open) {
    return json(403, headers, { error: 'We are not looking for new hires right now.' });
  }

  const fullName = cleanName(body.fullName);
  const phone = normalizePhone(body.phone);
  const email = cleanEmail(body.email);
  const area = cleanLine(body.area, 80);
  const experience = String(body.experience || '').trim();
  const education = String(body.education || '').trim();
  const experienceDetail = cleanLine(body.experienceDetail, 160);
  const note = cleanLine(body.note, 400);

  if (!fullName) return json(400, headers, { error: 'Enter your full name.' });
  if (!phone) return json(400, headers, { error: 'Enter a valid 10-digit mobile number.' });
  if (email === null) return json(400, headers, { error: 'Enter a valid email, or leave it blank.' });
  if (area.length < 2) return json(400, headers, { error: 'Enter the area in Bengaluru where you live.' });
  if (!EXPERIENCE.has(experience)) return json(400, headers, { error: 'Choose fresher or experienced.' });
  if (!EDUCATION.has(education)) return json(400, headers, { error: 'Choose your background.' });
  if (!asBool(body.fieldWorkOk)) {
    return json(400, headers, { error: 'Confirm you are comfortable with field work and the service bag.' });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from('elevenro_job_applications')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', since);
  if (countError) {
    console.warn('[job-application] duplicate check failed', countError.message);
    return json(503, headers, { error: 'Could not submit right now. Try again.' });
  }
  if ((count || 0) >= 2) {
    return json(429, headers, { error: 'An application from this number was already sent today.' });
  }

  const brand = BRANDS.has(String(body.brand || '').trim()) ? String(body.brand).trim() : 'elevenro';

  const row = {
    full_name: fullName,
    brand,
    phone,
    email: email || null,
    area,
    experience,
    experience_detail: experience === 'experienced' && experienceDetail ? experienceDetail : null,
    education,
    has_two_wheeler: asBool(body.hasTwoWheeler),
    has_licence: asBool(body.hasLicence),
    field_work_ok: true,
    note: note || null,
    status: 'new',
  };

  const { data, error } = await db
    .from('elevenro_job_applications')
    .insert(row)
    .select('id,full_name,phone,area,brand')
    .maybeSingle();
  if (error || !data) {
    console.warn('[job-application] insert failed', error?.message || error);
    return json(500, headers, { error: 'Could not submit the application. Try again.' });
  }

  try {
    await notifyAdminsJobApplication(db, {
      id: data.id,
      name: data.full_name,
      phone: data.phone,
      area: data.area,
      brand: data.brand,
    });
  } catch (err) {
    console.warn('[job-application] notify soft-fail', err?.message || err);
  }

  return json(200, headers, { ok: true });
};
