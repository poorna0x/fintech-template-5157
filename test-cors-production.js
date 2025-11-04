#!/usr/bin/env node
/**
 * Test CORS configuration in production
 * 
 * Usage:
 *   node test-cors-production.js
 * 
 * This will test CORS against your production Netlify functions
 * Make sure to set PRODUCTION_URL environment variable
 */

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://hydrogenro.com';

const testOrigins = [
  { origin: 'https://hydrogenro.com', expected: 'allowed', description: 'Production domain' },
  { origin: 'https://www.hydrogenro.com', expected: 'allowed', description: 'Production domain with www' },
  { origin: 'http://localhost:8080', expected: 'blocked', description: 'Localhost (should be blocked in production)' },
  { origin: 'https://malicious-site.com', expected: 'blocked', description: 'Malicious origin (should be blocked)' },
  { origin: 'https://evil.com', expected: 'blocked', description: 'Unauthorized origin (should be blocked)' },
];

const functionsToTest = [
  'hash-technician-password',
  'verify-technician-password',
  'altcha-verify',
  'send-email',
  'geocode',
];

async function testCORS(functionName, origin, expected) {
  const url = `${PRODUCTION_URL}/.netlify/functions/${functionName}`;
  
  try {
    // Test OPTIONS preflight request
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
      },
    });

    const corsOrigin = optionsResponse.headers.get('Access-Control-Allow-Origin');
    const status = optionsResponse.status;

    if (expected === 'allowed') {
      if (corsOrigin === origin || corsOrigin === '*' || status === 200) {
        return { success: true, message: `✅ CORS allowed (origin: ${corsOrigin})` };
      } else {
        return { success: false, message: `❌ CORS not allowed (got: ${corsOrigin}, expected: ${origin})` };
      }
    } else {
      // Expected to be blocked
      if (status === 403 || corsOrigin === 'null' || !corsOrigin || corsOrigin !== origin) {
        return { success: true, message: `✅ CORS blocked correctly (status: ${status}, origin: ${corsOrigin || 'none'})` };
      } else {
        return { success: false, message: `❌ CORS not blocked (got: ${corsOrigin}, status: ${status})` };
      }
    }
  } catch (error) {
    return { success: false, message: `❌ Error: ${error.message}` };
  }
}

async function runTests() {
  console.log('🧪 Testing CORS in Production\n');
  console.log(`Production URL: ${PRODUCTION_URL}\n`);
  console.log('=' .repeat(60));

  let totalTests = 0;
  let passedTests = 0;

  for (const func of functionsToTest) {
    console.log(`\n📡 Testing function: ${func}`);
    console.log('-'.repeat(60));

    for (const test of testOrigins) {
      totalTests++;
      const result = await testCORS(func, test.origin, test.expected);
      console.log(`  ${test.description}:`);
      console.log(`    Origin: ${test.origin}`);
      console.log(`    Expected: ${test.expected}`);
      console.log(`    Result: ${result.message}`);
      
      if (result.success) {
        passedTests++;
      }
      console.log('');
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('='.repeat(60));
  console.log(`\n📊 Test Summary:`);
  console.log(`   Total tests: ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${totalTests - passedTests}`);
  console.log(`   Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

  if (passedTests === totalTests) {
    console.log('✅ All CORS tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some CORS tests failed. Please check the configuration.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

