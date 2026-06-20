import React, { useEffect } from 'react';
import {
  buildCanonicalUrl,
  getBrandSeoProfile,
  upsertLinkRel,
  upsertMetaByName,
  upsertMetaByProperty,
  applyPublicSiteSeo,
} from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  /** When set, delegates to the shared public-site SEO pipeline for blog posts. */
  articleSlug?: string;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  keywords,
  canonical,
  ogImage,
  articleSlug,
}) => {
  useEffect(() => {
    if (articleSlug) {
      applyPublicSiteSeo(`/blog/${articleSlug}`);
      return;
    }

    const profile = getBrandSeoProfile();
    const resolvedCanonical = canonical ?? buildCanonicalUrl(window.location.pathname);
    const image = ogImage ?? profile.ogImage;

    document.title = title;
    upsertMetaByName('title', title);
    upsertMetaByName('description', description);
    if (keywords) upsertMetaByName('keywords', keywords);
    upsertLinkRel('canonical', resolvedCanonical);
    upsertMetaByProperty('og:title', title);
    upsertMetaByProperty('og:description', description);
    upsertMetaByProperty('og:url', resolvedCanonical);
    upsertMetaByProperty('og:image', image);
    upsertMetaByName('twitter:title', title);
    upsertMetaByName('twitter:description', description);
    upsertMetaByName('twitter:url', resolvedCanonical);
    upsertMetaByName('twitter:image', image);
  }, [title, description, keywords, canonical, ogImage, articleSlug]);

  return null;
};

export default SEOHead;

export function useBrandBlogSeo(slug: string, articleTitle: string) {
  const siteKey = getPublicSiteKey();
  const profile = getBrandSeoProfile(siteKey);
  return {
    title: `${articleTitle} | ${profile.brandName} Blog`,
    description: `${articleTitle}. Expert RO water purifier tips and guides for Bengaluru. Read on ${profile.brandName} blog.`,
    canonical: `${profile.origin}/blog/${slug}`,
    articleSlug: slug,
  };
}
