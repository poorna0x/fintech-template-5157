/**
 * Regenerate public/sitemap.xml and public/sitemap-elevenro.xml from SEO page registry.
 * Location pages are auto-read from src/data/locationSeo.ts (slug fields).
 * Run: node scripts/generate-sitemaps.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lastmod = new Date().toISOString().slice(0, 10);

const locationSeoSrc = readFileSync(join(root, 'src/data/locationSeo.ts'), 'utf8');
const locationPaths = [...locationSeoSrc.matchAll(/slug:\s*'(ro-service-[^']+)'/g)].map((m) => ({
  path: `/${m[1]}`,
  priority: '0.9',
  changefreq: 'weekly',
}));

const staticPaths = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/services', priority: '0.95', changefreq: 'weekly' },
  { path: '/service-areas', priority: '0.95', changefreq: 'weekly' },
  { path: '/book', priority: '0.95', changefreq: 'daily' },
  { path: '/booking', priority: '0.95', changefreq: 'daily' },
  { path: '/ro-installation', priority: '0.9', changefreq: 'weekly' },
  { path: '/ro-repair', priority: '0.9', changefreq: 'weekly' },
  { path: '/filter-replacement', priority: '0.9', changefreq: 'weekly' },
  { path: '/ro-maintenance', priority: '0.9', changefreq: 'weekly' },
  { path: '/water-softener', priority: '0.9', changefreq: 'weekly' },
  { path: '/ro-troubleshooting', priority: '0.85', changefreq: 'weekly' },
  { path: '/emergency-ro-repair', priority: '0.9', changefreq: 'weekly' },
  { path: '/same-day-ro-service', priority: '0.9', changefreq: 'weekly' },
  { path: '/ro-spare-parts', priority: '0.85', changefreq: 'weekly' },
  { path: '/ro-brands', priority: '0.85', changefreq: 'weekly' },
  { path: '/ro-price-list', priority: '0.85', changefreq: 'weekly' },
  { path: '/ro-warranty', priority: '0.8', changefreq: 'monthly' },
  { path: '/about', priority: '0.8', changefreq: 'monthly' },
  { path: '/contact', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog', priority: '0.75', changefreq: 'weekly' },
  { path: '/blog/maintain-ro-purifier-home-guide', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/ro-vs-uv-vs-uf-bengaluru-water', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/water-softeners-important-karnataka-homes', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/ro-filter-replacement-schedule-bengaluru', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/10-signs-ro-purifier-needs-repair', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/best-ro-water-purifier-brands-bengaluru-2025', priority: '0.7', changefreq: 'monthly' },
  { path: '/spare-parts', priority: '0.8', changefreq: 'weekly' },
  { path: '/warranty', priority: '0.8', changefreq: 'monthly' },
  { path: '/privacy-policy', priority: '0.5', changefreq: 'monthly' },
  { path: '/terms-of-service', priority: '0.3', changefreq: 'monthly' },
  { path: '/refund-policy', priority: '0.3', changefreq: 'monthly' },
  { path: '/cookie-policy', priority: '0.3', changefreq: 'monthly' },
  { path: '/disclaimer', priority: '0.3', changefreq: 'monthly' },
];

const paths = [...staticPaths, ...locationPaths];

function buildSitemap(origin) {
  const urls = paths
    .map(
      ({ path, priority, changefreq }) => `  <url>
    <loc>${origin}${path === '/' ? '/' : path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    )
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

${urls}

</urlset>
`;
}

writeFileSync(join(root, 'public/sitemap.xml'), buildSitemap('https://hydrogenro.com'));
writeFileSync(join(root, 'public/sitemap-elevenro.xml'), buildSitemap('https://elevenro.com'));
console.log(`Generated sitemaps with ${paths.length} URLs (${locationPaths.length} location pages, lastmod ${lastmod})`);
