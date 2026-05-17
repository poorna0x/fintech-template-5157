// First-time technician login: verify password against technicians table, then create/update
// matching Supabase Auth user (id = technicians.id). Does not expose service role to the client.
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { rateLimiters } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');
const { upsertTechnicianAuthUser } = require('./technician-auth-upsert');

async function verifyPassword(plain, stored) {
  if (!stored) return false;
  const isHashed =
    stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
  if (isHashed) {
    return bcrypt.compare(plain, stored);
  }
  return stored === plain;
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
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
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const rateLimitResult = rateLimiters.password(event);
  if (rateLimitResult) {
    return { ...rateLimitResult, headers: { ...rateLimitResult.headers, ...corsHeaders } };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Server misconfigured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { email, password } = body;
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing email or password' }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalizedEmail = email.toLowerCase().trim();

  const { data: technician, error: techError } = await admin
    .from('technicians')
    .select('id, full_name, email, password, account_status')
    .eq('email', normalizedEmail)
    .single();

  if (techError || !technician) {
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid credentials' }),
    };
  }

  if (technician.account_status !== 'ACTIVE') {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Account is not active' }),
    };
  }

  const valid = await verifyPassword(password, technician.password);
  if (!valid) {
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid credentials' }),
    };
  }

  const result = await upsertTechnicianAuthUser(admin, {
    technicianId: technician.id,
    email: normalizedEmail,
    password,
    fullName: technician.full_name,
  });

  if (!result.ok) {
    console.error('[provision-technician-auth-on-login]', result.error);
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        error: result.error,
        hint: 'Ensure SUPABASE_SERVICE_ROLE_KEY is set. Auth user id must match technicians.id.',
      }),
    };
  }

  return {
    statusCode: 200,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ok: true, action: result.action }),
  };
};
