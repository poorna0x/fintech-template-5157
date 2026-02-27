# Technician Page – Loads on WiFi but Fails on Mobile (e.g. Samsung)

## Likely causes

1. **Service worker + slow mobile network**  
   The technician page uses a PWA service worker. On slow or flaky mobile data:
   - The SW used to **precache** `/`, `/technician`, `/technician/login` during install. If any of those requests failed (timeout, carrier proxy), install could misbehave.
   - Document requests had a **10s timeout**; on 3G/slow 4G the HTML can take longer and the SW would fall back to cache or error.

2. **Carrier / device behaviour**  
   Some carriers (and Samsung Internet in “Data saver” or restricted mode):
   - Proxy or modify traffic.
   - Block or throttle WebSockets (Supabase realtime).
   - Apply stricter caching or security, which can break SW or long requests.

3. **Stale or broken service worker**  
   If the SW was installed earlier when the network failed, it might be in a bad state and keep serving errors or wrong pages until it’s updated or removed.

## Changes made in the app

- **Resilient install**  
  Precache is best-effort: if precache fails (e.g. slow network), the service worker still activates. Install no longer “fails” and leaves the SW broken.

- **Longer timeout for document requests**  
  Navigation/document requests now use a **20s** timeout instead of 10s so slow mobile networks have more time to load the page.

- **Better offline fallback**  
  When the network fails, the SW tries cache for the requested URL, then fallback page, then `/`. It no longer returns a raw error when a cached response exists.

- **New cache version**  
  Cache names were bumped so the new SW gets a fresh cache and the new behaviour applies after deploy.

## What technicians can try on affected phones

1. **Clear site data for hydrogenro.com**  
   - **Chrome (Android):** Settings → Site settings → hydrogenro.com → Clear & reset.  
   - **Samsung Internet:** Settings → Sites and downloads → Site permissions → hydrogenro.com → Delete data (or Clear data).  
   Then open `https://hydrogenro.com/technician` again on **mobile data**.

2. **Load once on WiFi first**  
   Open `https://hydrogenro.com/technician` on WiFi so the new service worker and cache install. After that, try again on mobile data.

3. **Turn off Data saver / Lite mode**  
   In Samsung Internet (or Chrome), disable “Data saver” / “Lite mode” for hydrogenro.com or globally, then retry.

4. **Try in a private/incognito tab**  
   If it works in incognito, the problem is likely cached data or an old service worker; clearing site data (step 1) usually fixes it.

5. **Check for “mixed content” or security warnings**  
   Ensure the page is loaded as `https://hydrogenro.com` (not `http`) and that no browser or carrier message is blocking scripts or connections.

## If it still fails

- Note the **exact URL** (e.g. `/technician` or `/technician/login`).
- Note the **browser** (e.g. Samsung Internet 24, Chrome 120).
- Note what appears: blank screen, “Site can’t be reached”, “Offline”, or something else.
- Check the **network**: 4G vs 3G, and try another mobile network (e.g. different SIM) to see if it’s carrier-specific.

This helps distinguish server/Netlify issues from device/carrier/SW issues.
