# TODO: Remove Local Network Auto-Verification

## Temporary Changes Made for Local Development Testing

**Date:** Current Session
**Reason:** Allow testing admin/technician login from mobile devices on local network

### Files Modified:

1. **src/components/AdminLogin.tsx**
   - Added auto-verification of captcha for local network IPs in development mode
   - Look for: `useEffect` that sets `setIsCaptchaVerified(true)` for local network

2. **src/pages/TechnicianLogin.tsx**
   - Added auto-verification of captcha for local network IPs in development mode
   - Look for: `useEffect` that sets `setIsCaptchaVerified(true)` for local network

3. **src/components/AltchaWidget.tsx**
   - Updated to detect local network IP and use hostname:8888 instead of localhost:8888
   - Fixes "Failed to fetch" error when accessing from mobile devices
   - Location: apiUrl configuration around line 80-93

4. **index.html**
   - Updated CSP to allow HTTP connections (http: and ws:) for local network testing
   - Allows connections to local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
   - **SECURITY WARNING**: This allows all HTTP connections - only for development!
   - Location: Content-Security-Policy meta tag, connect-src directive

### When to Remove:

- Before production deployment
- When local network testing is no longer needed
- These are SECURITY compromises for development only

### What to Do:

1. **REMOVE** the `useEffect` blocks that auto-verify captcha in both AdminLogin.tsx and TechnicianLogin.tsx
   - These bypass security for local network access
   
2. **REVIEW** AltchaWidget.tsx changes - consider keeping the local network detection
   - The fix makes ALTCHA work from mobile devices on local network
   - May want to keep this or improve it, but remove the auto-verification bypass
   
3. **CRITICAL: FIX CSP in index.html** - Remove permissive HTTP/WS connections
   - Change `connect-src` from `'self' http://localhost:* http: ws: ...` 
   - Back to: `'self' http://localhost:8888 https://...` (only specific URLs)
   - The `http:` and `ws:` allow ALL HTTP connections which is a security risk
   
4. Ensure captcha verification is properly enforced in production
5. Test that captcha works properly in production environment

### Related Changes (also check):

- CORS helper: `netlify/functions/cors-helper.js` - allows local network IPs in dev
- Vite config: `vite.config.ts` - network access settings
