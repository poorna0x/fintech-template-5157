// Sync technician row → Supabase Auth user (id = technicians.id, role = technician).
// Called from admin Settings when saving a technician password.
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { upsertTechnicianAuthUser } = require('./technician-auth-upsert');

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfigured (missing Supabase keys)' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { technicianId, email, password, accessToken, fullName } = body;
  if (!technicianId || !email || !password || !accessToken) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing technicianId, email, password, or accessToken' }),
    };
  }

  const adminAuth = await authorizeAdminBearer(event, body);
  if (!adminAuth.ok) {
    return {
      statusCode: adminAuth.error === 'Unauthorized' ? 401 : 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: adminAuth.error || 'Unauthorized' }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await upsertTechnicianAuthUser(admin, {
    technicianId,
    email,
    password,
    fullName,
  });

  if (!result.ok) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: result.error,
        hint: 'Technician can still log in once; first login will link Supabase Auth automatically.',
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, action: result.action }),
  };
};
