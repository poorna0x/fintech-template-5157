# How to Test ALTCHA in Production

## Quick Test Steps

### 1. Test Admin Login Page

**Steps:**
1. Open your browser
2. Go to: `https://hydrogenro.com/admin`
3. Open Developer Tools (Press `F12`)
4. Go to **Console** tab
5. You should see ALTCHA widget loading (no errors)
6. Enter your admin email and password
7. ALTCHA should verify automatically (may be hidden)
8. Click "Sign In"
9. ✅ Should login successfully

**What to check:**
- No errors in console
- Login form works
- Can submit after ALTCHA verifies

---

### 2. Test Technician Login Page

**Steps:**
1. Go to: `https://hydrogenro.com/technician/login`
2. Open Developer Tools (F12)
3. Go to **Console** tab
4. Enter technician email and password
5. ALTCHA should verify automatically
6. Click login button
7. ✅ Should redirect to technician dashboard

**What to check:**
- No errors in console
- Login works correctly
- Redirects to dashboard

---

### 3. Test Booking Page

**Steps:**
1. Go to: `https://hydrogenro.com/book`
2. Fill in the booking form:
   - Name, phone, email
   - Address
   - Service type
   - Complete all steps
3. ALTCHA runs in background (hidden)
4. Submit the form
5. ✅ Should submit successfully

**What to check:**
- Form submits without errors
- Booking confirmation appears
- No ALTCHA errors in console

---

## Browser Console Tests

### Test 1: Check ALTCHA Endpoint

Open browser console on any page and run:

```javascript
fetch('/.netlify/functions/altcha-verify?complexity=12')
  .then(r => r.json())
  .then(data => {
    console.log('✅ ALTCHA Endpoint Working!');
    console.log('Algorithm:', data.algorithm);
    console.log('Max Number:', data.maxnumber);
    console.log('Has Salt:', !!data.salt);
    console.log('Has Signature:', !!data.signature);
  })
  .catch(err => console.error('❌ Error:', err));
```

**Expected Result:**
```
✅ ALTCHA Endpoint Working!
Algorithm: SHA-256
Max Number: 4096 (or higher, but ≤ 65536)
Has Salt: true
Has Signature: true
```

---

### Test 2: Check Complexity Clamping

```javascript
// Test high complexity (should be clamped to 16)
fetch('/.netlify/functions/altcha-verify?complexity=99')
  .then(r => r.json())
  .then(data => {
    const maxExpected = Math.pow(2, 16); // 65536
    console.log('Max Number:', data.maxnumber);
    console.log('Should be ≤', maxExpected);
    console.log('✅ Clamped:', data.maxnumber <= maxExpected);
  });

// Test low complexity (should be clamped to 10)
fetch('/.netlify/functions/altcha-verify?complexity=5')
  .then(r => r.json())
  .then(data => {
    const minExpected = Math.pow(2, 10); // 1024
    console.log('Max Number:', data.maxnumber);
    console.log('Should be ≥', minExpected);
    console.log('✅ Clamped:', data.maxnumber >= minExpected);
  });
```

---

### Test 3: Check ALTCHA Widget Presence

```javascript
// Check if ALTCHA widget is on the page
const widget = document.querySelector('altcha-widget');
if (widget) {
  console.log('✅ ALTCHA Widget Found!');
  console.log('Widget ID:', widget.id);
  console.log('Widget visible:', widget.offsetParent !== null);
} else {
  console.log('❌ ALTCHA Widget Not Found');
  console.log('Note: Widget may load after React renders');
}
```

---

### Test 4: Check Network Requests

1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Filter by "altcha"
4. Reload the page
5. Look for requests to `/.netlify/functions/altcha-verify`
6. Check:
   - Status should be `200`
   - Response should have `algorithm`, `challenge`, `salt`, `signature`

---

## What to Look For

### ✅ Good Signs:
- No console errors
- ALTCHA widget loads (may be hidden)
- Forms submit successfully
- Network requests show 200 status
- Complexity is clamped correctly

### ❌ Bad Signs:
- Console errors about ALTCHA
- 403 Forbidden errors
- Forms don't submit
- ALTCHA widget not found
- Network requests fail

---

## Troubleshooting

### If ALTCHA doesn't work:

1. **Check Console Errors:**
   - Look for CORS errors
   - Look for 403 Forbidden
   - Check for network errors

2. **Check Network Tab:**
   - Verify requests to `/.netlify/functions/altcha-verify`
   - Check response status codes

3. **Check Environment:**
   - Make sure `ALTCHA_HMAC_KEY` is set in Netlify
   - Verify production deployment is latest

4. **Test Endpoint Directly:**
   ```javascript
   fetch('/.netlify/functions/altcha-verify?complexity=12')
     .then(r => r.text())
     .then(console.log)
     .catch(console.error);
   ```

---

## Quick Verification Commands

Copy and paste these in browser console:

```javascript
// Quick test - all in one
(async () => {
  console.log('🧪 Testing ALTCHA...\n');
  
  // Test endpoint
  const res = await fetch('/.netlify/functions/altcha-verify?complexity=12');
  const data = await res.json();
  console.log('1. Endpoint:', res.ok ? '✅ Working' : '❌ Failed');
  console.log('2. Max Number:', data.maxnumber);
  console.log('3. Complexity clamped:', data.maxnumber <= 65536 ? '✅' : '❌');
  
  // Test widget
  const widget = document.querySelector('altcha-widget');
  console.log('4. Widget:', widget ? '✅ Found' : '❌ Not found');
  
  console.log('\n✅ All tests complete!');
})();
```

