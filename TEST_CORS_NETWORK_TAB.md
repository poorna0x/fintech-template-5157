# Method 4: Testing CORS Using Network Tab (Step-by-Step)

## 📋 Step-by-Step Instructions

### Step 1: Open Your Production Site
1. Go to: `https://hydrogenro.com`
2. Make sure you're logged in (if needed)

### Step 2: Open Developer Tools
- Press `F12` on Windows/Linux
- Press `Cmd+Option+I` on Mac
- Or right-click anywhere → "Inspect" or "Inspect Element"

### Step 3: Go to Network Tab
- Click on the **"Network"** tab in DevTools
- You'll see a list of network requests (may be empty initially)

### Step 4: Make a Request to the API

**Option A: Use Your App (Easiest)**
1. In your app, go to: **Admin Dashboard → Settings → Technician Management**
2. Click **"Add New Technician"** button
3. Fill in the form (or just enter a password - it will hash it)
4. Click Save (or try to save)
5. Watch the Network tab - you'll see a request appear

**Option B: Use Console**
1. Keep Network tab open
2. Click on **"Console"** tab
3. Paste this code:
```javascript
fetch('https://hydrogenro.com/.netlify/functions/hash-technician-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'test-value-123' }) // Test value only
})
```
4. Press Enter
5. Go back to Network tab

### Step 5: Find the Request
1. In Network tab, look for: `hash-technician-password`
2. You might need to:
   - Clear the list first (click the 🚫 icon)
   - Then make the request again
   - Or use the search box (🔍) to filter

### Step 6: Inspect the Request
1. Click on the `hash-technician-password` request
2. You'll see details in the right panel

### Step 7: Check Headers
Click on the **"Headers"** tab in the details panel. You'll see:

**Request Headers** (what browser sent):
- Look for `origin: https://hydrogenro.com`
- This shows where the request came from

**Response Headers** (what server sent back):
- Look for `access-control-allow-origin: https://hydrogenro.com`
- ✅ This means CORS is working!

### Step 8: Verify Status
- Check the status code (should be `200` for successful requests)
- Check the response body (should show `{"hashedPassword":"..."}`)

## 🎯 What You Should See

✅ **Good CORS (Working Correctly):**
```
Request Headers:
  origin: https://hydrogenro.com

Response Headers:
  access-control-allow-origin: https://hydrogenro.com
  status: 200
```

❌ **Bad CORS (Not Working):**
```
Response Headers:
  access-control-allow-origin: *
  (or missing entirely)
```

## 📸 Visual Guide

1. **Network Tab** → Shows all requests
2. **Click Request** → Shows details
3. **Headers Tab** → Shows request/response headers
4. **Look for** → `access-control-allow-origin` in Response Headers

## 💡 Pro Tip

If you don't see the request:
- Make sure Network tab is open BEFORE making the request
- Clear the network log (🚫 icon) and try again
- Check the filter (🔍) - make sure "All" is selected
- The request might be named slightly differently - search for "hash" or "technician"

