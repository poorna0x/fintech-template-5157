import { Link, useLocation } from 'react-router-dom';
import { getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { findBlogArticle, findLocationPage, findServicePage } from '@/lib/publicSeoPages';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

interface Crumb {
  label: string;
  href?: string;
}

function buildCrumbs(pathname: string, brandName: string): Crumb[] {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (clean === '/') return [];

  const crumbs: Crumb[] = [{ label: brandName, href: '/' }];

  if (clean === '/services' || clean.startsWith('/ro-') || clean === '/filter-replacement' || clean === '/water-purifier-repair' || clean === '/membrane-replacement') {
    const service = findServicePage(clean);
    crumbs.push({ label: 'Services', href: '/services' });
    crumbs.push({ label: service?.serviceName ?? 'RO Service' });
    return crumbs;
  }

  if (clean.startsWith('/ro-service-')) {
    const location = findLocationPage(clean);
    crumbs.push({ label: 'Service Areas', href: '/service-areas' });
    crumbs.push({ label: location ? `RO Service in ${location.areaName}` : 'Location' });
    return crumbs;
  }

  if (clean === '/blog') {
    crumbs.push({ label: 'Blog' });
    return crumbs;
  }

  if (clean.startsWith('/blog/')) {
    const slug = clean.replace('/blog/', '');
    const article = findBlogArticle(slug);
    crumbs.push({ label: 'Blog', href: '/blog' });
    crumbs.push({ label: article?.title ?? 'Article' });
    return crumbs;
  }

  const staticLabels: Record<string, string> = {
    '/about': 'About',
    '/contact': 'Contact',
    '/book': 'Book Service',
    '/booking': 'Book Service',
    '/service-areas': 'Service Areas',
    '/spare-parts': 'Spare Parts',
    '/warranty': 'Warranty',
    '/privacy-policy': 'Privacy Policy',
    '/terms-of-service': 'Terms of Service',
    '/refund-policy': 'Refund Policy',
    '/cookie-policy': 'Cookie Policy',
    '/disclaimer': 'Disclaimer',
  };

  const label = staticLabels[clean];
  if (label) crumbs.push({ label });
  return crumbs;
}

/** Screen-reader breadcrumbs + BreadcrumbList companion — zero visual layout impact. */
export default function SeoBreadcrumbs() {
  const { pathname } = useLocation();
  const brand = getBrandSeoProfile(getPublicSiteKey());
  const crumbs = buildCrumbs(pathname, brand.brandName);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="sr-only">
      <ol>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {isLast || !crumb.href ? (
                <span aria-current={isLast ? 'page' : undefined}>{crumb.label}</span>
              ) : (
                <Link to={crumb.href}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
