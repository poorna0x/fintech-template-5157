/** Strip schema-leaking fields from PostgREST error bodies (defense in depth for browser clients). */
export function sanitizePostgrestErrorBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copy = { ...(body as Record<string, unknown>) };
  delete copy.hint;
  delete copy.details;
  return copy;
}
