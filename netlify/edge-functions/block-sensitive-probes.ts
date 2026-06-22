import type { Config, Context } from '@netlify/edge-functions';

/** Paths security scanners probe; must return HTTP 404, not SPA index.html (200). */
const EXACT_BLOCKED_PATHS = new Set(
  [
    '/config.json',
    '/package.json',
    '/package-lock.json',
    '/composer.json',
    '/yarn.lock',
    '/.htaccess',
    '/web.config',
    '/.DS_Store',
    '/wp-config.php',
    '/phpinfo.php',
    '/server-status',
    '/.env',
    '/.env.local',
    '/.env.production',
    '/.env.development',
    '/.git',
    '/.svn',
  ].map((p) => p.toLowerCase()),
);

const PREFIX_BLOCKED_PATHS = [
  '/.git/',
  '/.env.',
  '/.svn/',
  '/node_modules/',
  '/.aws/',
  '/backup/',
  '/.well-known/git/',
];

function isSensitiveProbePath(pathname: string): boolean {
  const p = pathname.split('?')[0].toLowerCase();
  if (EXACT_BLOCKED_PATHS.has(p)) return true;
  return PREFIX_BLOCKED_PATHS.some((prefix) => p.startsWith(prefix));
}

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>404 Not Found</title></head>
  <body><h1>404 Not Found</h1></body>
</html>`;

export default async function handler(request: Request, context: Context) {
  const { pathname } = new URL(request.url);
  if (!isSensitiveProbePath(pathname)) {
    return context.next();
  }

  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const config: Config = {
  path: [
    '/config.json',
    '/package.json',
    '/package-lock.json',
    '/composer.json',
    '/yarn.lock',
    '/.htaccess',
    '/web.config',
    '/.DS_Store',
    '/wp-config.php',
    '/phpinfo.php',
    '/server-status',
    '/.env',
    '/.env.local',
    '/.env.production',
    '/.env.development',
    '/.git',
    '/.git/*',
    '/.svn',
    '/.svn/*',
    '/node_modules/*',
    '/.aws/*',
    '/backup/*',
    '/.well-known/git/*',
  ],
};
