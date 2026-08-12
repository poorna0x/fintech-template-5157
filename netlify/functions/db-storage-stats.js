/**
 * Admin-only: Postgres table sizes + per-table column byte breakdown.
 * POST { table?: string } — omit table for overview; include table name for column stats.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { getServiceSupabase } = require('./whatsapp-helper');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const headers = {
    ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, { error: auth.error || 'Unauthorized' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const db = getServiceSupabase();
  if (!db) {
    return json(503, headers, { error: 'Database client unavailable' });
  }

  const table = String(body.table || body.tableName || '').trim();

  try {
    if (table) {
      const { data, error } = await db.rpc('admin_db_table_column_stats', { p_table: table });
      if (error) {
        return json(500, headers, { error: error.message || 'Column stats failed' });
      }
      return json(200, headers, { ok: true, ...data });
    }

    const { data, error } = await db.rpc('admin_db_storage_overview');
    if (error) {
      return json(500, headers, { error: error.message || 'Overview failed' });
    }
    return json(200, headers, { ok: true, ...data });
  } catch (err) {
    return json(500, headers, { error: err?.message || 'Storage stats failed' });
  }
};
