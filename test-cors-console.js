// Browser Console CORS Test
// Copy and paste this into your browser console

// ⚠️ IMPORTANT: The browser automatically sets the Origin header based on the page's domain.
// You cannot override it. To test CORS blocking, you must test from a DIFFERENT domain.

async function testCORS() {
  const endpoint = 'https://hydrogenro.com/.netlify/functions/hash-technician-password';
  
  console.log('🧪 Testing CORS Configuration...\n');
  console.log('📍 Current page origin:', window.location.origin);
  console.log('📍 Target endpoint:', endpoint);
  console.log('');

  // Test 1: OPTIONS preflight (should work from same origin)
  console.log('1️⃣ Testing OPTIONS preflight...');
  try {
    const optionsResponse = await fetch(endpoint, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    const corsOrigin = optionsResponse.headers.get('Access-Control-Allow-Origin');
    console.log('   Status:', optionsResponse.status);
    console.log('   Access-Control-Allow-Origin:', corsOrigin);
    console.log('   ✅ Preflight successful\n');
  } catch (error) {
    console.log('   ❌ Preflight failed:', error.message, '\n');
  }

  // Test 2: Actual POST request
  console.log('2️⃣ Testing POST request...');
  try {
    const postResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: 'test-value-123' }) // Test value only - not a real password
    });
    
    const data = await postResponse.json();
    console.log('   Status:', postResponse.status);
    console.log('   Response:', data);
    console.log('   ✅ POST request successful\n');
  } catch (error) {
    console.log('   ❌ POST request failed:', error.message, '\n');
  }

  // Test 3: Check if we're on the same origin
  const currentOrigin = window.location.origin;
  const targetOrigin = 'https://hydrogenro.com';
  
  if (currentOrigin === targetOrigin || currentOrigin === 'https://www.hydrogenro.com') {
    console.log('ℹ️  You are testing from the SAME origin.');
    console.log('   CORS will always allow same-origin requests.');
    console.log('   To test CORS blocking, open this script from a DIFFERENT domain.\n');
  } else {
    console.log('ℹ️  You are testing from a DIFFERENT origin.');
    console.log('   If CORS is working, requests should be blocked.\n');
  }

  console.log('📋 Summary:');
  console.log('   - Same-origin requests: Always allowed (this is normal)');
  console.log('   - Different-origin requests: Should be blocked by CORS');
  console.log('   - To test blocking: Run this script from example.com or google.com');
}

// Run the test
testCORS();

