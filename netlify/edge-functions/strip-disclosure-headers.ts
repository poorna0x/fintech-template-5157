import type { Config, Context } from '@netlify/edge-functions';

/** Strip platform fingerprint headers where Edge can remove them (Netlify may re-add Server). */
const HEADERS_TO_STRIP = [
  'server',
  'x-powered-by',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-nf-request-id',
  'x-nf-geo',
  'x-nf-cache-status',
  'cache-status',
  'via',
];

export default async (_request: Request, context: Context) => {
  try {
    const response = await context.next();
    const headers = new Headers(response.headers);
    for (const name of HEADERS_TO_STRIP) {
      headers.delete(name);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    console.error('strip-disclosure-headers', err);
    return new Response('Service temporarily unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};

export const config: Config = {
  path: '/*',
};
