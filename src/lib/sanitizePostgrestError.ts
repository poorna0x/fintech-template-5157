/** Strip schema-leaking fields from PostgREST error bodies (defense in depth for browser clients). */

const PGRST_LEAK_CODES = new Set([
  'PGRST200',
  'PGRST201',
  'PGRST202',
  'PGRST203',
  'PGRST204',
  'PGRST205',
]);

function genericMessageForCode(code: string): string | undefined {
  switch (code) {
    case 'PGRST205':
      return 'The requested resource was not found.';
    case 'PGRST202':
      return 'The requested operation was not found.';
    case 'PGRST204':
      return 'Invalid request.';
    default:
      if (PGRST_LEAK_CODES.has(code) || code.startsWith('PGRST')) {
        return 'Request could not be processed.';
      }
      return undefined;
  }
}

export function sanitizePostgrestErrorBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copy = { ...(body as Record<string, unknown>) };
  delete copy.hint;
  delete copy.details;

  const code = typeof copy.code === 'string' ? copy.code : '';
  if (code && typeof copy.message === 'string') {
    const generic = genericMessageForCode(code);
    if (generic) {
      copy.message = generic;
    }
  }

  return copy;
}
