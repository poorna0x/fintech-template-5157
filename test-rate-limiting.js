// Test rate limiting on sensitive endpoints
import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8888';
const TEST_ORIGIN = 'http://localhost:8080';

// Test configuration
const tests = [
  {
    name: 'Password Verification',
    endpoint: '/.netlify/functions/verify-technician-password',
    method: 'POST',
    body: { password: 'test', hashedPassword: '$2a$10$test' },
    expectedLimit: 5,
    windowMs: 900000, // 15 minutes
    description: 'Should allow 5 attempts per 15 minutes'
  },
  {
    name: 'Password Hashing',
    endpoint: '/.netlify/functions/hash-technician-password',
    method: 'POST',
    body: { password: 'test123' },
    expectedLimit: 20,
    windowMs: 60000, // 1 minute
    description: 'Should allow 20 requests per minute'
  },
  {
    name: 'ALTCHA Verify',
    endpoint: '/.netlify/functions/altcha-verify',
    method: 'GET',
    body: null,
    expectedLimit: 30,
    windowMs: 60000, // 1 minute
    description: 'Should allow 30 requests per minute'
  },
  {
    name: 'Send Email',
    endpoint: '/.netlify/functions/send-email',
    method: 'POST',
    body: { to: 'test@example.com', subject: 'Test', text: 'Test email' },
    expectedLimit: 10,
    windowMs: 3600000, // 1 hour
    description: 'Should allow 10 emails per hour'
  }
];

async function testRateLimit(test) {
  console.log(`\n🧪 Testing: ${test.name}`);
  console.log(`   ${test.description}`);
  console.log(`   Endpoint: ${test.endpoint}`);
  console.log(`   Expected limit: ${test.expectedLimit} requests`);
  
  const results = [];
  const requestsToMake = test.expectedLimit + 3; // Make a few extra to test limit
  
  for (let i = 1; i <= requestsToMake; i++) {
    try {
      const options = {
        method: test.method,
        headers: {
          'Content-Type': 'application/json',
          'Origin': TEST_ORIGIN
        }
      };
      
      if (test.body && test.method === 'POST') {
        options.body = JSON.stringify(test.body);
      }
      
      const url = `${BASE_URL}${test.endpoint}${test.method === 'GET' ? '?complexity=14' : ''}`;
      const response = await fetch(url, options);
      const status = response.status;
      const data = status === 200 ? await response.json().catch(() => ({})) : null;
      
      const retryAfter = response.headers.get('Retry-After');
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      
      results.push({
        request: i,
        status,
        retryAfter: retryAfter ? parseInt(retryAfter) : null,
        remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : null,
        limit: rateLimitLimit ? parseInt(rateLimitLimit) : null,
        blocked: status === 429
      });
      
      // Small delay to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      results.push({
        request: i,
        error: error.message,
        blocked: false
      });
    }
  }
  
  // Analyze results
  const successful = results.filter(r => r.status === 200).length;
  const blocked = results.filter(r => r.blocked).length;
  const firstBlocked = results.findIndex(r => r.blocked);
  
  console.log(`\n   Results:`);
  console.log(`   ✅ Successful requests: ${successful}`);
  console.log(`   🚫 Blocked requests: ${blocked}`);
  
  if (firstBlocked !== -1) {
    const firstBlockedResult = results[firstBlocked];
    console.log(`   📍 First blocked at request #${firstBlocked + 1}`);
    if (firstBlockedResult.retryAfter) {
      console.log(`   ⏱️  Retry-After: ${firstBlockedResult.retryAfter} seconds`);
    }
    if (firstBlockedResult.remaining !== null) {
      console.log(`   📊 Remaining: ${firstBlockedResult.remaining}/${firstBlockedResult.limit}`);
    }
  }
  
  // Check if rate limiting is working
  const passed = blocked > 0 && firstBlocked <= test.expectedLimit + 1;
  
  if (passed) {
    console.log(`   ✅ PASS: Rate limiting is working!`);
  } else {
    console.log(`   ❌ FAIL: Rate limiting not working as expected`);
    console.log(`   Expected to be blocked after ${test.expectedLimit} requests`);
  }
  
  return passed;
}

async function runTests() {
  console.log('🚀 Rate Limiting Test Suite');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Origin: ${TEST_ORIGIN}`);
  console.log('='.repeat(60));
  
  const results = [];
  
  for (const test of tests) {
    try {
      const passed = await testRateLimit(test);
      results.push({ name: test.name, passed });
      
      // Wait a bit between tests to avoid interference
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`\n❌ Error testing ${test.name}:`, error.message);
      results.push({ name: test.name, passed: false, error: error.message });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n🎉 All rate limiting tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

