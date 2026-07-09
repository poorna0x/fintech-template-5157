/**
 * Regenerate public/sitemap.xml and public/sitemap-elevenro.xml from SEO page registry.
 * Location pages: src/data/locationSeo.ts (slug fields)
 * City × service pages: src/data/cityServiceSeo.ts
 * Service pages: src/lib/publicSeoPages.ts (path fields in SEO_SERVICE_PAGES)
 * Run: node scripts/generate-sitemaps.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lastmod = new Date().toISOString().slice(0, 10);

function runTsx(expression) {
  return execSync(`npx --yes tsx -e ${JSON.stringify(expression)}`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

const locationSlugJson = runTsx(
  "import { locationSeoList, BENGALURU_LOCALITY_SLUGS } from './src/data/locationSeo.ts'; console.log(JSON.stringify({ slugs: locationSeoList.map(l => l.slug), blr: BENGALURU_LOCALITY_SLUGS }));"
);
const { slugs: locationSlugList, blr: bengaluruLocalitySlugs } = JSON.parse(locationSlugJson);

const cityServiceJson = runTsx(
  "import { areaServicePageList, PRIORITY_CITY_SLUGS, PRIORITY_BENGALURU_LOCALITY_SLUGS } from './src/data/cityServiceSeo.ts'; console.log(JSON.stringify({ pages: areaServicePageList.map(p => ({ path: p.path, tier: p.cityTier, title: p.serviceName + ' in ' + p.cityName, areaType: p.areaType })), priorityCities: [...PRIORITY_CITY_SLUGS], priorityBlr: PRIORITY_BENGALURU_LOCALITY_SLUGS }));"
);
const {
  pages: cityServicePages,
  priorityCities,
  priorityBlr,
} = JSON.parse(cityServiceJson);

const priorityCitySlugSet = new Set(priorityCities);
const priorityBlrSet = new Set(priorityBlr);

function locationPriority(slug) {
  if (priorityBlrSet.has(slug)) return '0.93';
  const cityPart = slug.replace(/^ro-service-/, '');
  if (priorityCitySlugSet.has(cityPart)) {
    if (cityPart === 'bengaluru' || cityPart === 'mysuru' || cityPart === 'mangaluru') return '0.95';
    if (cityPart === 'udupi') return '0.88';
    return '0.92';
  }
  return '0.85';
}

const locationPaths = locationSlugList.sort().map((slug) => ({
  path: `/${slug}`,
  priority: locationPriority(slug),
  changefreq: 'weekly',
}));

const publicSeoSrc = readFileSync(join(root, 'src/lib/publicSeoPages.ts'), 'utf8');
const serviceBlock = publicSeoSrc.match(/export const SEO_SERVICE_PAGES[\s\S]*?^\];/m)?.[0] ?? '';
const servicePaths = [...serviceBlock.matchAll(/path:\s*'([^']+)'/g)].map((m) => ({
  path: m[1],
  priority: '0.9',
  changefreq: 'weekly',
}));

const cityServicePaths = cityServicePages.map((page) => ({
  path: page.path,
  priority: page.areaType === 'locality' ? '0.92' : page.tier === 1 ? '0.94' : page.tier === 2 ? '0.91' : '0.88',
  changefreq: 'weekly',
}));

const staticPaths = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/services', priority: '0.95', changefreq: 'weekly' },
  { path: '/service-areas', priority: '0.95', changefreq: 'weekly' },
  { path: '/book', priority: '0.95', changefreq: 'daily' },
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

const paths = [...staticPaths, ...servicePaths, ...cityServicePaths, ...locationPaths];

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

const bootstrapPath = join(root, 'public/head-seo-bootstrap.js');
let bootstrap = readFileSync(bootstrapPath, 'utf8');
const blrJson = JSON.stringify([...bengaluruLocalitySlugs].sort());
bootstrap = bootstrap.replace(
  /\/\/ AUTO:BENGALURU_LOCALITY_SLUGS[\s\S]*?\/\/ END:BENGALURU_LOCALITY_SLUGS/,
  `// AUTO:BENGALURU_LOCALITY_SLUGS\n      var BENGALURU_LOCALITY_SLUGS = new Set(${blrJson});\n      // END:BENGALURU_LOCALITY_SLUGS`
);

const cityServiceTitleMap = Object.fromEntries(
  cityServicePages.map((p) => [p.path, `${p.title}`])
);
const cityServiceTitleJson = JSON.stringify(cityServiceTitleMap, null, 2).replace(/\n/g, '\n      ');
bootstrap = bootstrap.replace(
  /\/\/ AUTO:CITY_SERVICE_TITLES[\s\S]*?\/\/ END:CITY_SERVICE_TITLES/,
  `// AUTO:CITY_SERVICE_TITLES\n      var CITY_SERVICE_TITLES = ${cityServiceTitleJson};\n      // END:CITY_SERVICE_TITLES`
);

writeFileSync(bootstrapPath, bootstrap);

console.log(
  `Generated sitemaps with ${paths.length} URLs (${servicePaths.length} service, ${cityServicePaths.length} city×service, ${locationPaths.length} location pages, ${bengaluruLocalitySlugs.length} Bengaluru localities, lastmod ${lastmod})`
);
