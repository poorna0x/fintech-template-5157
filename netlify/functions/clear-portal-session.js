/**
 * Clear the HttpOnly hro_portal cookie on logout.
 *
 * Security posture (CVSS 5.3 scanner finding 2026-05-27):
 *  - POST only — GET/HEAD/PUT/etc. return 405 (don't reveal cookie name to scanners).
 *  - Origin must be in the allowlist when present. Sandboxed iframes (`Origin: null`)
 *    are rejected because cors-helper no longer emits ACAO: null.
 *  - Requires a *valid signed* hro_portal cookie before issuing Set-Cookie. Anonymous
 *    callers get HTTP 204 with no body and no Set-Cookie — no information disclosure,
 *    no DoS-as-logout vector.
 *  - CSRF: cookie is SameSite=Lax + HttpOnly, so cross-site fetch can't send it and
 *    same-site form posts can't read the response. Origin check is the second gate.
 */
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  clearCookieHeader,
  verifyPortalCookie,
  COOKIE_NAME,
} = require('./portal-session');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = rest.join('=');
  }
  return out;
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
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        Allow: 'POST, OPTIONS',
      }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const existing = verifyPortalCookie(cookies[COOKIE_NAME]);
  if (!existing.ok) {
    return {
      statusCode: 204,
      headers: addSecurityHeaders({ ...corsHeaders }),
      body: '',
    };
  }

  return {
    statusCode: 200,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookieHeader(),
    }),
    body: JSON.stringify({ ok: true }),
  };
};
