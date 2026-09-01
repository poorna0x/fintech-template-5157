// Verify admin access for internal Netlify functions (Bearer JWT or optional preview secret).
require('./supabase-ws-polyfill');

const { createClient } = require('@supabase/supabase-js');

function readPreviewSecret(event) {
  return String(
    event.headers['x-email-preview-secret'] ||
      event.headers['X-Email-Preview-Secret'] ||
      ''
  ).trim();
}

function readBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function isPreviewSecretAllowedEnvironment() {
  const ctx = process.env.CONTEXT;
  // Never accept preview-secret auth on production deploys.
  if (ctx === 'production') return false;
  // Local dev-server / netlify dev only.
  if (process.env.NETLIFY_DEV === 'true') return true;
  if (!ctx || ctx === 'dev') return true;
  return false;
}

function isPreviewSecretAuthorized(event) {
  if (!isPreviewSecretAllowedEnvironment()) return false;
  const expected = String(process.env.EMAIL_PREVIEW_SECRET || '').trim();
  if (!expected) return false;
  return readPreviewSecret(event) === expected;
}

async function verifyAdminBearerToken(token) {
  if (!token) {
    return { ok: false, error: 'Unauthorized' };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !anonKey) {
    return { ok: false, error: 'Server misconfigured' };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, error: 'Unauthorized' };
  }

  const user = userData.user;
  const metaRole = user.app_metadata?.role ?? user.user_metadata?.role;

  if (metaRole === 'technician') {
    return { ok: false, error: 'Forbidden' };
  }

  const email = String(user.email || '').trim();
  if (!email) {
    return { ok: false, error: 'Unauthorized' };
  }

  if (!serviceKey) {
    if (metaRole === 'admin') {
      return { ok: true, userId: user.id, role: 'ADMIN' };
    }
    return { ok: false, error: 'Server misconfigured' };
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: techRow, error: techErr } = await adminClient
    .from('technicians')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (techErr) {
    console.error('[admin-auth-guard] technicians lookup failed', techErr.message);
    return { ok: false, error: 'Unauthorized' };
  }
  if (techRow) {
    return { ok: false, error: 'Forbidden' };
  }

  const { data: adminRow, error: adminErr } = await adminClient
    .from('admin_users')
    .select('id, role')
    .ilike('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (adminErr) {
    console.error('[admin-auth-guard] admin_users lookup failed', adminErr.message);
    return { ok: false, error: 'Unauthorized' };
  }
  if (!adminRow) {
    return { ok: false, error: 'Forbidden' };
  }

  const role = String(adminRow.role || 'ADMIN').trim().toUpperCase();
  return { ok: true, userId: user.id, role };
}

/** Full admin only (ADMIN / SUPER_ADMIN). Managers cannot use CRM / document AI. */
async function verifyFullAdminBearerToken(token) {
  const session = await verifyAdminBearerToken(token);
  if (!session.ok) return session;
  const role = String(session.role || 'ADMIN').trim().toUpperCase();
  if (role === 'MANAGER') {
    return { ok: false, error: 'Forbidden' };
  }
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return session;
  }
  return { ok: false, error: 'Forbidden' };
}

/** Admin or technician JWT — never default unknown users to admin. */
async function verifyStaffBearerToken(token) {
  if (!token) {
    return { ok: false, error: 'Unauthorized' };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !anonKey) {
    return { ok: false, error: 'Server misconfigured' };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, error: 'Unauthorized' };
  }

  const user = userData.user;
  const email = String(user.email || '').trim();
  const metaRole = user.app_metadata?.role ?? user.user_metadata?.role;

  if (!serviceKey) {
    // Local misconfig — only trust explicit metadata, never invent admin.
    if (metaRole === 'technician') {
      return { ok: true, userId: user.id, role: 'technician' };
    }
    if (metaRole === 'admin') {
      return { ok: true, userId: user.id, role: 'admin' };
    }
    return { ok: false, error: 'Server misconfigured' };
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: techRow, error: techErr } = await adminClient
    .from('technicians')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (techErr) {
    console.error('[admin-auth-guard] staff technicians lookup failed', techErr.message);
    return { ok: false, error: 'Unauthorized' };
  }
  if (techRow || metaRole === 'technician') {
    // Prefer DB row; metadata alone is OK only when row exists or was trusted above.
    if (techRow) {
      return { ok: true, userId: user.id, role: 'technician' };
    }
    // Metadata says technician but no row — deny (forged / stale claim).
    return { ok: false, error: 'Forbidden' };
  }

  if (!email) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { data: adminRow, error: adminErr } = await adminClient
    .from('admin_users')
    .select('id')
    .ilike('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (adminErr) {
    console.error('[admin-auth-guard] staff admin_users lookup failed', adminErr.message);
    return { ok: false, error: 'Unauthorized' };
  }
  if (!adminRow) {
    return { ok: false, error: 'Forbidden' };
  }

  return { ok: true, userId: user.id, role: 'admin' };
}

/** Admin session JWT or legacy EMAIL_PREVIEW_SECRET header. */
async function authorizeAdminRequest(event) {
  if (isPreviewSecretAuthorized(event)) {
    return { ok: true, via: 'preview_secret' };
  }

  const token = readBearerToken(event);
  const session = await verifyAdminBearerToken(token);
  if (session.ok) {
    return { ok: true, via: 'session', userId: session.userId };
  }

  return { ok: false, error: session.error || 'Unauthorized' };
}

/** Admin, technician, or preview secret — AMC agreement emails only. */
async function authorizeStaffAmcEmailRequest(event) {
  if (isPreviewSecretAuthorized(event)) {
    return { ok: true, via: 'preview_secret', role: 'admin' };
  }

  const token = readBearerToken(event);
  const session = await verifyStaffBearerToken(token);
  if (session.ok) {
    return { ok: true, via: 'session', userId: session.userId, role: session.role };
  }

  return { ok: false, error: session.error || 'Unauthorized' };
}

function readAccessTokenFromEvent(event, body) {
  const fromBody = body?.accessToken;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  return readBearerToken(event);
}

/** Admin JWT from Authorization header or body.accessToken. */
async function authorizeAdminBearer(event, body) {
  const token = readAccessTokenFromEvent(event, body);
  const session = await verifyAdminBearerToken(token);
  if (session.ok) {
    return { ok: true, userId: session.userId };
  }
  return { ok: false, error: session.error || 'Unauthorized' };
}

/** @deprecated Alias — use authorizeStaffAmcEmailRequest */
const authorizeStaffRequest = authorizeStaffAmcEmailRequest;

module.exports = {
  authorizeAdminRequest,
  authorizeAdminBearer,
  authorizeStaffAmcEmailRequest,
  authorizeStaffRequest,
  verifyAdminBearerToken,
  verifyFullAdminBearerToken,
  verifyStaffBearerToken,
  isPreviewSecretAuthorized,
  readBearerToken,
  readAccessTokenFromEvent,
};
