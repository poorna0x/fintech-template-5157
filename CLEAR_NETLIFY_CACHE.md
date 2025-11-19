# How to Clear Netlify Build Cache

If your existing Netlify deployment is failing due to old cache, follow these steps:

## Method 1: Clear Cache via Netlify Dashboard (Recommended)

1. Go to your Netlify Dashboard: https://app.netlify.com
2. Select your site
3. Go to **Site settings** → **Build & deploy** → **Build settings**
4. Scroll down to **Build environment variables**
5. Click **"Clear cache and deploy site"** button
6. This will clear all cached files and trigger a fresh build

## Method 2: Clear Cache via Deploy Settings

1. Go to **Deploys** tab
2. Click **"Trigger deploy"** dropdown
3. Select **"Clear cache and deploy site"**
4. This will clear the cache and start a fresh build

## Method 3: Manual Cache Clear (via Netlify CLI)

If you have Netlify CLI installed:

```bash
# Clear build cache
netlify cache:clear

# Or trigger a deploy with cleared cache
netlify deploy --build
```

## Method 4: Force Clean Build (via Environment Variable)

Add this environment variable in Netlify Dashboard:
- **Key**: `NETLIFY_CLEAR_CACHE`
- **Value**: `true`

Then trigger a new deploy. This forces Netlify to clear the cache.

## What Gets Cached?

Netlify caches:
- `node_modules/` directory
- Build artifacts
- Dependencies from package.json
- npm/yarn cache

## Why Clear Cache?

Old cache can cause:
- Build failures due to outdated dependencies
- Environment variable issues
- Stale build artifacts
- Version conflicts

## After Clearing Cache

After clearing cache, your next build will:
- Install all dependencies fresh
- Rebuild all assets
- Use current environment variables
- Take longer (but will be clean)

## Quick Fix for Current Issue

1. Go to Netlify Dashboard → Your Site → Deploys
2. Click **"Trigger deploy"** → **"Clear cache and deploy site"**
3. Wait for build to complete
4. Your site should now work with the latest code






