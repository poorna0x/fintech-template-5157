# Google Analytics Setup Guide

## Quick Setup

1. **Get your Google Analytics 4 Measurement ID**
   - Go to [Google Analytics](https://analytics.google.com/)
   - Select your property (or create one)
   - Go to **Admin** → **Data Streams** → Select your web stream
   - Copy your **Measurement ID** (format: `G-XXXXXXXXXX`)

2. **Add the Measurement ID to your environment**
   
   **For Netlify:**
   - Go to Netlify Dashboard → Your Site → **Site settings** → **Environment variables**
   - Add a new variable:
     - Key: `VITE_GA_MEASUREMENT_ID`
     - Value: `G-XXXXXXXXXX` (your actual measurement ID)
   - Redeploy your site

   **For local development:**
   - Create a `.env` file in the root directory
   - Add: `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX`
   - Restart your dev server

3. **Verify it's working**
   - After deployment, visit your site
   - Open browser DevTools → Network tab
   - Look for requests to `www.googletagmanager.com` and `www.google-analytics.com`
   - Check Google Analytics → **Realtime** → **Overview** to see live visitors

## What's Tracked

The Google Analytics component automatically tracks:

- ✅ **Page views** - Every route change in your SPA
- ✅ **Page titles** - Dynamic titles for each page
- ✅ **Page paths** - Full URL paths including query parameters
- ✅ **Social media clicks** - WhatsApp, phone calls (already set up in index.html)
- ✅ **Performance metrics** - Page load times (via PerformanceMonitor)

## Current Implementation

- **Component**: `src/components/GoogleAnalytics.tsx`
- **Location**: Added to `src/App.tsx` to track all route changes
- **Environment Variable**: `VITE_GA_MEASUREMENT_ID`

## Testing

1. **Local Testing** (with .env file):
   ```bash
   # Create .env file
   echo "VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX" > .env
   
   # Restart dev server
   npm run dev
   ```

2. **Check if it's working**:
   - Open browser console
   - Type: `window.gtag` - should return a function
   - Type: `window.dataLayer` - should return an array
   - Check Network tab for GA requests

## Troubleshooting

**Not seeing data in Google Analytics?**
- Make sure the Measurement ID is correct (starts with `G-`)
- Check that environment variable is set correctly
- Verify the variable name is exactly `VITE_GA_MEASUREMENT_ID`
- Wait 24-48 hours for data to appear (Realtime shows immediately)

**Getting errors in console?**
- Check that the Measurement ID format is correct
- Ensure the script can load from `googletagmanager.com`
- Check browser console for any CSP (Content Security Policy) errors

## Notes

- The component only initializes if a valid Measurement ID is provided
- If `VITE_GA_MEASUREMENT_ID` is not set or is the placeholder, GA won't initialize
- Page views are tracked automatically on every route change (SPA-friendly)
- All tracking respects user privacy and follows Google Analytics best practices

