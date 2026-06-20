// Verify admin access for internal Netlify functions (Bearer JWT or optional preview secret).

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

function isPreviewSecretAuthorized(event) {
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
  if (metaRole === 'admin') {
    return { ok: true, userId: user.id };
  }

  // Legacy admins may omit JWT role — exclude technician table rows.
  if (!serviceKey) {
    return { ok: false, error: 'Unauthorized' };
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
    return { ok: false, error: 'Unauthorized' };
  }
  if (techRow) {
    return { ok: false, error: 'Forbidden' };
  }

  return { ok: true, userId: user.id };
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

module.exports = {
  authorizeAdminRequest,
  verifyAdminBearerToken,
  isPreviewSecretAuthorized,
};
