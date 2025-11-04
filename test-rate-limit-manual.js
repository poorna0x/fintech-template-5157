// Manual rate limiting test
import http from 'http';

const BASE_URL = 'http://localhost:8888';
const ENDPOINT = '/.netlify/functions/verify-technician-password';

function makeRequest(requestNumber) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      password: 'test',
      hashedPassword: '$2a$10$test'
    });

    const options = {
      hostname: 'localhost',
      port: 8888,
      path: ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Origin': 'http://localhost:8080',
        'X-Forwarded-For': '127.0.0.1'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          requestNumber,
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject({ requestNumber, error: error.message });
    });

    req.write(postData);
    req.end();
  });
}

async function testRateLimit() {
  console.log('🧪 Testing Rate Limiting on Password Verification');
  console.log('='.repeat(60));
  console.log(`Endpoint: ${BASE_URL}${ENDPOINT}`);
  console.log(`Expected: 5 requests allowed, then 429 (Rate Limited)`);
  console.log('='.repeat(60));
  console.log('');

  const results = [];
  
  // Make 7 requests (5 should pass, 6th should be blocked)
  for (let i = 1; i <= 7; i++) {
    try {
      const result = await makeRequest(i);
      results.push(result);
      
      if (result.statusCode === 200) {
        console.log(`✅ Request ${i}: 200 OK`);
      } else if (result.statusCode === 429) {
        console.log(`🚫 Request ${i}: 429 RATE LIMITED`);
        const retryAfter = result.headers['retry-after'];
        const rateLimitRemaining = result.headers['x-ratelimit-remaining'];
        const rateLimitLimit = result.headers['x-ratelimit-limit'];
        
        if (retryAfter) {
          console.log(`   ⏱️  Retry-After: ${retryAfter} seconds`);
        }
        if (rateLimitRemaining !== undefined) {
          console.log(`   📊 Remaining: ${rateLimitRemaining}/${rateLimitLimit}`);
        }
        
        try {
          const body = JSON.parse(result.body);
          if (body.message) {
            console.log(`   💬 Message: ${body.message}`);
          }
        } catch (e) {
          // Ignore parse errors
        }
      } else {
        console.log(`❓ Request ${i}: ${result.statusCode} ${result.statusMessage || ''}`);
        console.log(`   Body: ${result.body.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`❌ Request ${i}: ERROR - ${error.error || error.message}`);
      results.push({ requestNumber: i, error: error.error || error.message });
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.statusCode === 200).length;
  const blocked = results.filter(r => r.statusCode === 429).length;
  const firstBlocked = results.findIndex(r => r.statusCode === 429);
  
  console.log(`✅ Successful (200): ${successful}`);
  console.log(`🚫 Blocked (429): ${blocked}`);
  
  if (firstBlocked !== -1) {
    console.log(`📍 First blocked at request #${firstBlocked + 1}`);
  }
  
  if (blocked > 0 && firstBlocked <= 5) {
    console.log('');
    console.log('🎉 ✅ Rate limiting is WORKING correctly!');
    console.log('   Requests are being blocked after the limit.');
  } else if (blocked === 0) {
    console.log('');
    console.log('⚠️  Rate limiting might not be working.');
    console.log('   Expected to see 429 responses after 5 requests.');
    console.log('   Check if the rate limiter is properly integrated.');
  } else {
    console.log('');
    console.log('⚠️  Rate limiting is working, but blocking started later than expected.');
  }
}

// Run test
testRateLimit().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

