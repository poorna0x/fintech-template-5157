/** Mint HttpOnly portal cookie from an existing Supabase session (settings/calling Edge guard). */
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { signPortalCookie, cookieHeader, verifyPortalCookie, COOKIE_NAME } = require('./portal-session');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = rest.join('=');
  }
  return out;
}

async function resolveRole(admin, user) {
  const meta = user.app_metadata?.role || user.user_metadata?.role;
  const email = String(user.email || '').trim();

  const { data: techRow, error: techErr } = await admin
    .from('technicians')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!techErr && techRow) return 'technician';
  if (meta === 'technician') return null; // forged/stale claim without DB row

  if (!email) return null;

  const { data: adminRow, error: adminErr } = await admin
    .from('admin_users')
    .select('id')
    .ilike('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (adminErr || !adminRow) return null;
  return 'admin';
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
      headers: addSecurityHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const existing = verifyPortalCookie(cookies[COOKIE_NAME]);
  if (existing.ok) {
    return {
      statusCode: 200,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ok: true, role: existing.role }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Server misconfigured' }),
    };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const role = await resolveRole(admin, user);
  if (!role) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }
  const maxAge = 60 * 60 * 12;
  const portalCookie = signPortalCookie(role, maxAge);

  return {
    statusCode: 200,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Set-Cookie': cookieHeader(portalCookie, maxAge),
    }),
    body: JSON.stringify({ ok: true, role }),
  };
};
