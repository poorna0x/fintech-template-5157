// Slim name + phone list for the technician app's on-phone caller card.
// Technicians cannot SELECT every customer (RLS is assigned-only), so this
// staff-only read uses the service role and returns just id, name, and phones.

const { createClient } = require('@supabase/supabase-js');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');

const HEADERS = { 'Content-Type': 'application/json' };
const PAGE = 1000;
const MAX_PAGES = 20;

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const auth = await verifyStaffBearerToken(readBearerToken(event));
  if (!auth.ok) {
    return json(auth.error === 'Unauthorized' ? 401 : 403, { error: auth.error || 'Forbidden' });
  }

  const limit = checkRateLimitForKey(`caller-directory:${auth.userId}`, {
    maxRequests: 12,
    windowMs: 60 * 60 * 1000,
    endpoint: 'caller-directory',
  });
  if (!limit.allowed) return rateLimitResponseForKey(limit);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Server misconfigured' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (auth.role === 'technician') {
    const { data: tech, error: techErr } = await admin
      .from('technicians')
      .select('account_status')
      .eq('id', auth.userId)
      .maybeSingle();
    if (techErr || !tech) return json(403, { error: 'Forbidden' });
    const status = String(tech.account_status || 'ACTIVE').trim().toUpperCase();
    if (status === 'INACTIVE' || status === 'SUSPENDED') {
      return json(403, { error: 'Forbidden' });
    }
  }

  let since = '';
  try {
    const body = JSON.parse(event.body || '{}');
    since = typeof body.since === 'string' ? body.since.trim() : '';
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (since && Number.isNaN(Date.parse(since))) {
    return json(400, { error: 'Invalid since' });
  }

  const cursor = new Date().toISOString();
  const customers = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = admin
      .from('customers')
      .select('id, full_name, phone, alternate_phone, updated_at')
      .order('updated_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (since) query = query.gte('updated_at', since);
    const { data, error } = await query;
    if (error) {
      console.error('[caller-directory] select failed', error.message);
      return json(500, { error: 'Lookup failed' });
    }
    const rows = data || [];
    for (const row of rows) {
      const phone = String(row.phone || '').trim();
      const alt = String(row.alternate_phone || '').trim();
      if (!since && !phone && !alt) continue;
      customers.push({
        id: row.id,
        full_name: row.full_name || '',
        phone,
        alternate_phone: alt,
      });
    }
    if (rows.length < PAGE) break;
  }

  return json(200, { customers, cursor });
};
