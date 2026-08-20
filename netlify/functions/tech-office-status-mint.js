/**
 * Admin mint / enable / disable / rotate for the family office-status PWA.
 * JWT admin only. Plaintext token is returned only on create or rotate.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { isRateLimitEnabled, checkRateLimit, rateLimitResponseForKey } = require('./rate-limiter');
const {
  isUuid,
  sha256Hex,
  newPublicToken,
  getServiceDb,
  familyStatusPath,
  linkIsActive,
} = require('./tech-office-status-helper');

function json(statusCode, corsHeaders, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
    }),
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(corsHeaders), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, corsHeaders, { error: 'Method not allowed' });
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, corsHeaders, { error: 'Forbidden' });
  }
  if ((event.body || '').length > 4_000) {
    return json(413, corsHeaders, { error: 'Payload too large' });
  }

  if (typeof isRateLimitEnabled === 'function' && isRateLimitEnabled()) {
    const ipLimit = checkRateLimit(event, {
      maxRequests: 40,
      windowMs: 60_000,
      endpoint: 'tech-office-status-mint-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: addSecurityHeaders({ ...corsHeaders, ...base.headers }) };
    }
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const auth = await authorizeAdminBearer(event, body);
  if (!auth.ok) {
    return json(401, corsHeaders, { error: 'Unauthorized' });
  }

  const action = String(body.action || '').trim().toLowerCase();
  const technicianId = String(body.technicianId || '').trim();
  if (!isUuid(technicianId)) {
    return json(400, corsHeaders, { error: 'technician required' });
  }
  if (!['get', 'enable', 'disable', 'rotate'].includes(action)) {
    return json(400, corsHeaders, { error: 'action required' });
  }

  const db = getServiceDb();
  if (!db) return json(500, corsHeaders, { error: 'Server misconfigured' });

  try {
    const { data: tech, error: techErr } = await db
      .from('technicians')
      .select('id, full_name, account_status')
      .eq('id', technicianId)
      .maybeSingle();
    if (techErr) {
      console.warn('[tech-office-status-mint] tech', techErr.message);
      return json(500, corsHeaders, { error: 'failed' });
    }
    if (!tech) return json(404, corsHeaders, { error: 'not found' });

    const { data: row, error: rowErr } = await db
      .from('technician_office_status_links')
      .select('technician_id, enabled, revoked_at, created_at, updated_at')
      .eq('technician_id', technicianId)
      .maybeSingle();
    if (rowErr) {
      console.warn('[tech-office-status-mint] link', rowErr.message);
      return json(500, corsHeaders, { error: 'failed' });
    }

    if (action === 'get') {
      return json(200, corsHeaders, {
        ok: true,
        hasLink: Boolean(row),
        enabled: linkIsActive(row),
        technicianActive: String(tech.account_status || '').toUpperCase() === 'ACTIVE',
      });
    }

    if (action === 'disable') {
      if (!row) {
        return json(200, corsHeaders, { ok: true, hasLink: false, enabled: false });
      }
      const { error } = await db
        .from('technician_office_status_links')
        .update({
          enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('technician_id', technicianId);
      if (error) {
        console.warn('[tech-office-status-mint] disable', error.message);
        return json(500, corsHeaders, { error: 'failed' });
      }
      return json(200, corsHeaders, { ok: true, hasLink: true, enabled: false });
    }

    if (String(tech.account_status || '').toUpperCase() !== 'ACTIVE') {
      return json(400, corsHeaders, { error: 'technician inactive' });
    }

    if (action === 'enable') {
      if (row) {
        const { error } = await db
          .from('technician_office_status_links')
          .update({
            enabled: true,
            revoked_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('technician_id', technicianId);
        if (error) {
          console.warn('[tech-office-status-mint] enable', error.message);
          return json(500, corsHeaders, { error: 'failed' });
        }
        return json(200, corsHeaders, { ok: true, hasLink: true, enabled: true });
      }
      const token = newPublicToken();
      const { error } = await db.from('technician_office_status_links').insert({
        technician_id: technicianId,
        token_hash: sha256Hex(token),
        enabled: true,
        revoked_at: null,
      });
      if (error) {
        console.warn('[tech-office-status-mint] insert', error.message);
        return json(500, corsHeaders, { error: 'failed' });
      }
      return json(200, corsHeaders, {
        ok: true,
        hasLink: true,
        enabled: true,
        url: familyStatusPath(token),
      });
    }

    const token = newPublicToken();
    const nowIso = new Date().toISOString();
    const payload = {
      technician_id: technicianId,
      token_hash: sha256Hex(token),
      enabled: true,
      revoked_at: null,
      updated_at: nowIso,
    };
    const { error } = await db.from('technician_office_status_links').upsert(payload, {
      onConflict: 'technician_id',
    });
    if (error) {
      console.warn('[tech-office-status-mint] rotate', error.message);
      return json(500, corsHeaders, { error: 'failed' });
    }
    return json(200, corsHeaders, {
      ok: true,
      hasLink: true,
      enabled: true,
      url: familyStatusPath(token),
    });
  } catch (err) {
    console.error('[tech-office-status-mint]', err?.message || err);
    return json(500, corsHeaders, { error: 'failed' });
  }
};
