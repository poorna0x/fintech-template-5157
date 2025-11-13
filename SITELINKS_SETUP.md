# Google Sitelinks Setup Guide

## What Are Sitelinks?

Sitelinks are the links that appear under your website in Google search results, like:
- Book Now
- Contact
- Services
- About
- etc.

These help users navigate directly to important pages from search results.

## What We've Added

### 1. SiteNavigationElement Structured Data
Added structured data that tells Google about your main navigation links:
- Book Now (`/book`)
- Contact (`/contact`)
- Services (`/services`)
- About (`/about`)
- Service Areas (`/service-areas`)

### 2. WebSite Schema with mainEntity
Updated the WebSite structured data to include a `mainEntity` with ItemList of important pages.

### 3. Organization Schema with Navigation Links
Added navigation links to the Organization schema to help Google understand your site structure.

## How Google Generates Sitelinks

Google automatically generates sitelinks based on:
1. **Site structure** - Clear navigation hierarchy
2. **Internal linking** - How pages link to each other
3. **Structured data** - Schema.org markup (what we added)
4. **Page importance** - Based on clicks, authority, etc.
5. **User behavior** - Which links users click most

## Timeline

- **Initial setup**: 2-4 weeks after deployment
- **Updates**: Can take 1-2 weeks when you make changes
- **Not guaranteed**: Google decides which links to show

## How to Speed Up Sitelinks

### 1. Request Re-Indexing
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Use **URL Inspection** tool
3. Enter: `https://hydrogenro.com`
4. Click **Request Indexing**

### 2. Submit Sitemap
1. In Google Search Console → **Sitemaps**
2. Submit: `https://hydrogenro.com/sitemap.xml`
3. This helps Google discover all your pages

### 3. Ensure Clear Navigation
- Make sure your header navigation is clear and consistent
- Use descriptive link text (already done: "Book Now", "Contact", etc.)
- Ensure all important pages are linked from the homepage

### 4. Internal Linking
- Link important pages from multiple places (header, footer, content)
- Use descriptive anchor text
- Ensure links are crawlable (not JavaScript-only)

### 5. Page Authority
- Get backlinks to important pages
- Ensure pages have good content
- Make sure pages load fast

## Current Navigation Structure

Your site has these main pages that Google can use for sitelinks:
- ✅ Book Now (`/book`) - Priority: 0.9
- ✅ Contact (`/contact`) - Priority: 0.8
- ✅ Services (`/services`) - Priority: 0.9
- ✅ About (`/about`) - Priority: 0.8
- ✅ Service Areas (`/service-areas`) - Priority: 0.9

## Testing

### Check Structured Data
Use [Google's Rich Results Test](https://search.google.com/test/rich-results):
1. Enter: `https://hydrogenro.com`
2. Check for "SiteNavigationElement" and "WebSite" schemas
3. Verify all navigation links are detected

### Check Current Sitelinks
1. Search for "hydrogenro" or "hydrogen ro" on Google
2. Look for links under your main result
3. Note which ones appear (if any)

## Important Notes

- **Google decides**: You can't force specific sitelinks, only influence them
- **Quality over quantity**: Better to have 4-6 good sitelinks than many
- **Consistency**: Keep your navigation structure consistent
- **Mobile-friendly**: Ensure navigation works well on mobile
- **Fast loading**: Slow pages may not appear as sitelinks

## Next Steps

1. ✅ Deploy the changes
2. ✅ Request re-indexing in Google Search Console
3. ✅ Submit/update sitemap
4. ⏳ Wait 2-4 weeks for Google to process
5. ⏳ Monitor in Google Search Console → **Performance** → **Sitelinks**

## Monitoring

Check Google Search Console regularly:
- **Performance** tab → Look for sitelink impressions
- **Links** tab → See which pages are linked internally
- **Coverage** → Ensure all pages are indexed

