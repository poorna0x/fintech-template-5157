# ALTCHA Security Testing Guide

## Security Fixes Implemented

1. **Complexity Validation** - Limits complexity to 10-16 to prevent DoS
2. **Expiration Check** - Validates challenges haven't expired (20 min)
3. **Replay Attack Prevention** - Prevents reusing solved challenges
4. **Challenge Validation** - Rejects challenges not in server store
5. **Error Information Disclosure** - Hides internal errors in production

## Manual Testing

### Test 1: Complexity Validation (DoS Prevention)

**Test in browser console:**
```javascript
// Test high complexity (should be clamped)
fetch('https://hydrogenro.com/.netlify/functions/altcha-verify?complexity=99')
  .then(r => r.json())
  .then(data => {
    console.log('Max number:', data.maxnumber);
    console.log('Expected: 2^16 =', Math.pow(2, 16));
    console.log('Complexity clamped:', data.maxnumber <= Math.pow(2, 16));
  });

// Test low complexity (should be clamped)
fetch('https://hydrogenro.com/.netlify/functions/altcha-verify?complexity=5')
  .then(r => r.json())
  .then(data => {
    console.log('Max number:', data.maxnumber);
    console.log('Expected: 2^10 =', Math.pow(2, 10));
    console.log('Complexity clamped:', data.maxnumber >= Math.pow(2, 10));
  });
```

**Expected Result:**
- High complexity: maxnumber ≤ 2^16 (clamped)
- Low complexity: maxnumber ≥ 2^10 (clamped)

### Test 2: Challenge Expiration

**Test in browser console:**
```javascript
// Get a challenge
fetch('https://hydrogenro.com/.netlify/functions/altcha-verify?complexity=12')
  .then(r => r.json())
  .then(challenge => {
    console.log('Challenge received:', challenge.salt.substring(0, 20));
    console.log('Note: Expiration check happens server-side');
    console.log('Challenge expires after 20 minutes');
    
    // Wait 20+ minutes, then try to verify (should fail)
    // Note: This requires solving the challenge first
  });
```

**Expected Result:**
- Challenges expire after 20 minutes
- Expired challenges are rejected

### Test 3: Replay Attack Prevention

**Test Steps:**
1. Solve a challenge (get payload from ALTCHA widget)
2. Verify it successfully (should work)
3. Try to verify the same payload again (should fail)

**Test in browser console:**
```javascript
// After solving a challenge and getting payload
const payload = 'your-solved-payload-here';

// First verification (should succeed)
fetch('https://hydrogenro.com/.netlify/functions/altcha-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload })
})
.then(r => r.json())
.then(result => {
  console.log('First verification:', result);
  
  // Second verification (should fail - replay attack)
  return fetch('https://hydrogenro.com/.netlify/functions/altcha-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload })
  });
})
.then(r => r.json())
.then(result => {
  console.log('Second verification (replay):', result);
  console.log('Should be rejected:', result.verified === false);
});
```

**Expected Result:**
- First verification: `verified: true`
- Second verification: `verified: false, error: "Challenge already used"`

### Test 4: Invalid Challenge Validation

**Test in browser console:**
```javascript
// Test with fake/invalid challenge
const fakePayload = btoa(JSON.stringify({
  salt: 'fake-salt-12345',
  challenge: 'fake-challenge',
  number: 12345,
  signature: 'fake-signature'
}));

fetch('https://hydrogenro.com/.netlify/functions/altcha-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: fakePayload })
})
.then(r => r.json())
.then(result => {
  console.log('Invalid challenge result:', result);
  console.log('Should be rejected:', result.verified === false);
});
```

**Expected Result:**
- `verified: false`
- Error message: "Invalid or expired challenge" or "Invalid proof-of-work solution"

## Automated Testing

Run the test script:
```bash
node test-altcha-security.cjs
```

Or test in production:
```bash
TEST_URL=https://hydrogenro.com node test-altcha-security.cjs
```

## What to Look For

✅ **Good Security:**
- Complexity is clamped to 10-16
- Expired challenges are rejected
- Reused challenges are rejected
- Invalid challenges are rejected
- Error messages don't leak internal details

❌ **Bad Security:**
- Very high complexity accepted (DoS risk)
- Expired challenges accepted
- Same challenge can be verified multiple times
- Invalid challenges accepted
- Internal error details exposed

