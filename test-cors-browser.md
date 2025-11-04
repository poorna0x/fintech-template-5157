# CORS Browser Console Testing Guide

## Important Note
When testing CORS from browser console, the browser **automatically sets the Origin header** based on the page's domain. You cannot override it.

## How to Test CORS Properly

### Method 1: Test from Your Production Site (Same Origin)
This will always work because it's the same origin:

```javascript
// Test from https://hydrogenro.com console
fetch('https://hydrogenro.com/.netlify/functions/hash-technician-password', {
  method: 'OPTIONS',
  headers: { 'Access-Control-Request-Method': 'POST' }
}).then(r => {
  console.log('Status:', r.status);
  console.log('CORS Origin:', r.headers.get('Access-Control-Allow-Origin'));
  // Should return: https://hydrogenro.com
})
```

### Method 2: Test from Different Domain (Real CORS Test)
To properly test CORS blocking, you need to test from a **different domain**:

1. Open a different website (like `https://example.com` or `https://google.com`)
2. Open browser console (F12)
3. Run:

```javascript
fetch('https://hydrogenro.com/.netlify/functions/hash-technician-password', {
  method: 'OPTIONS',
  headers: { 'Access-Control-Request-Method': 'POST' }
}).then(r => {
  console.log('Status:', r.status);
  console.log('CORS Origin:', r.headers.get('Access-Control-Allow-Origin'));
  // Should return: null or be blocked (CORS error in console)
}).catch(err => {
  console.log('CORS Error (expected):', err.message);
  // This is GOOD - means CORS is blocking unauthorized origins
})
```

### Method 3: Test Actual POST Request
Test the actual endpoint (will be blocked by browser if CORS fails):

```javascript
// From a different domain, this should fail:
fetch('https://hydrogenro.com/.netlify/functions/hash-technician-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'test123' })
}).then(r => r.json()).then(data => {
  console.log('Success:', data);
}).catch(err => {
  console.log('CORS Blocked (expected):', err.message);
})
```

### Method 4: Use Browser DevTools Network Tab (Easiest Method)
This method lets you see the actual HTTP headers being sent and received.

**Steps:**
1. Open your production site: `https://hydrogenro.com`
2. Open DevTools (Press `F12` or right-click → Inspect)
3. Go to the **Network** tab
4. Make a request to the API using one of these methods:
   
   **Option A: Use your app's UI**
   - Navigate to Admin → Settings → Technician Management
   - Try to create a new technician (this will call the hash-technician-password API)
   - Watch the Network tab for the request

   **Option B: Use Console + Network tab**
   - Keep Network tab open
   - In Console tab, run:
   ```javascript
   fetch('https://hydrogenro.com/.netlify/functions/hash-technician-password', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ password: 'test123' })
   })
   ```
5. In the Network tab, find the request to `hash-technician-password`
6. Click on it to see details
7. Check the **Response Headers** section:
   - Look for `access-control-allow-origin`
   - Should show: `https://hydrogenro.com` ✅
   - Should NOT show: `*` (wildcard) ❌

**What you'll see:**
- Request Headers: Shows what your browser sent (including Origin)
- Response Headers: Shows what server sent back (including CORS headers)
- Status: Should be `200` for successful requests

## What to Look For

✅ **Good CORS:**
- Your domain gets `Access-Control-Allow-Origin: https://hydrogenro.com`
- Other domains get blocked (CORS error or null header)

❌ **Bad CORS:**
- All origins get `Access-Control-Allow-Origin: *`
- All origins get allowed (no blocking)

## Current Status
✅ CORS is working correctly in production (verified with curl)
- Production domain: Allowed
- Malicious origins: Blocked (403 or null)
- Localhost: Blocked in production

