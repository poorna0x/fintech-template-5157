/**
 * Paths that must never return SPA index.html (HTTP 200).
 * Scanners (e.g. BreachMe) flag these when the catch-all serves HTML with 200.
 * Synced into netlify.toml (first) and public/_redirects (SPA catch-all last).
 */
export const SENSITIVE_PUBLIC_PATHS = [
  '/.git',
  '/.git/*',
  '/config.json',
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.env.development',
  '/package.json',
  '/package-lock.json',
  '/composer.json',
  '/yarn.lock',
  '/.htaccess',
  '/web.config',
  '/.svn',
  '/.svn/*',
  '/node_modules/*',
  '/.aws/*',
  '/backup/*',
  '/.DS_Store',
  '/wp-config.php',
  '/phpinfo.php',
  '/server-status',
  '/.well-known/git/*',
];

/** Netlify [[redirects]] block (insert before SPA catch-all). */
export function netlifySensitivePathRedirectsToml() {
  const lines = [
    '# Block sensitive / probe paths with real 404 (before SPA catch-all)',
    '# Source: scripts/sensitive-public-paths.mjs — run node scripts/sync-sensitive-path-redirects.mjs',
  ];
  for (const from of SENSITIVE_PUBLIC_PATHS) {
    lines.push('[[redirects]]');
    lines.push(`  from = "${from}"`);
    lines.push('  to = "/404.html"');
    lines.push('  status = 404');
    lines.push('  force = true');
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/** public/_redirects — forced 404 rules then SPA fallback (processed after netlify.toml). */
export function publicRedirectsFileContent() {
  const lines = [
    '# Sensitive probe paths — forced 404 (see scripts/sensitive-public-paths.mjs)',
  ];
  for (const from of SENSITIVE_PUBLIC_PATHS) {
    lines.push(`${from} /404.html 404!`);
  }
  lines.push('');
  lines.push('# Netlify functions (must be before SPA catch-all)');
  lines.push('/api/* /.netlify/functions/:splat 200!');
  lines.push('');
  lines.push('# Canonical booking URL');
  lines.push('/booking /book 301');
  lines.push('/booking/ /book 301');
  lines.push('');
  lines.push('# SPA fallback — empty Vite shell (dist/app.html). Do not use prerendered');
  lines.push('# index.html here: that file is the marketing homepage and would flash on /admin.');
  lines.push('/* /app.html 200');
  return `${lines.join('\n')}\n`;
}
