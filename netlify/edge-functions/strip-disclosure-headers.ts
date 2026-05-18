import type { Config, Context } from '@netlify/edge-functions';

/** Strip platform fingerprint headers (scanner: Server / X-Powered-By disclosure). */
const HEADERS_TO_STRIP = [
  'server',
  'x-powered-by',
  'x-aspnet-version',
  'x-aspnetmvc-version',
];

export default async (_request: Request, context: Context) => {
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
};

export const config: Config = {
  path: '/*',
};
