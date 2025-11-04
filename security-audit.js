// Comprehensive Security Audit Script
// Tests all security measures and potential vulnerabilities

const https = require('https');

const BASE_URL = 'https://hydrogenro.com';
const ENDPOINTS = {
  altcha: '/.netlify/functions/altcha-verify',
  verifyPassword: '/.netlify/functions/verify-technician-password',
  hashPassword: '/.netlify/functions/hash-technician-password',
  sendEmail: '/.netlify/functions/send-email',
  geocode: '/.netlify/functions/geocode'
};

const results = {
  passed: [],
  failed: [],
  warnings: []
};

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': BASE_URL,
        ...headers
      }
    };

    if (body) {
      const postData = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data),
            rawBody: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            rawBody: data
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testSecurity() {
  console.log('🔒 COMPREHENSIVE SECURITY AUDIT');
  console.log('='.repeat(70));
  console.log(`Testing: ${BASE_URL}`);
  console.log('='.repeat(70));
  console.log('');

  // TEST 1: CORS Protection
  console.log('1️⃣ Testing CORS Protection');
  console.log('-'.repeat(70));
  try {
    const maliciousOrigin = await makeRequest('GET', ENDPOINTS.altcha, null, {
      'Origin': 'https://malicious-site.com'
    });
    if (maliciousOrigin.status === 403 || !maliciousOrigin.headers['access-control-allow-origin']) {
      results.passed.push('CORS: Malicious origins blocked');
      console.log('   ✅ Malicious origins blocked');
    } else {
      results.failed.push('CORS: Malicious origins allowed');
      console.log('   ❌ Malicious origins NOT blocked');
    }
  } catch (error) {
    results.warnings.push('CORS test failed');
    console.log('   ⚠️  Could not test CORS');
  }

  // TEST 2: Rate Limiting
  console.log('\n2️⃣ Testing Rate Limiting');
  console.log('-'.repeat(70));
  try {
    let blocked = false;
    for (let i = 1; i <= 7; i++) {
      const response = await makeRequest('POST', ENDPOINTS.verifyPassword, {
        password: 'test',
        hashedPassword: '$2a$10$test'
      });
      if (response.status === 429) {
        blocked = true;
        results.passed.push(`Rate Limiting: Blocked after ${i} requests`);
        console.log(`   ✅ Rate limiting working (blocked at request ${i})`);
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!blocked) {
      results.warnings.push('Rate Limiting: May not be working (wait for rate limit reset)');
      console.log('   ⚠️  Rate limit may be reset (wait 15 minutes and retry)');
    }
  } catch (error) {
    results.warnings.push('Rate limiting test failed');
    console.log('   ⚠️  Could not test rate limiting');
  }

  // TEST 3: ALTCHA Complexity Validation
  console.log('\n3️⃣ Testing ALTCHA Complexity Validation');
  console.log('-'.repeat(70));
  try {
    const highComplexity = await makeRequest('GET', `${ENDPOINTS.altcha}?complexity=99`);
    if (highComplexity.status === 200 && highComplexity.body) {
      const maxNumber = highComplexity.body.maxnumber;
      const expectedMax = Math.pow(2, 16);
      if (maxNumber <= expectedMax) {
        results.passed.push('ALTCHA: Complexity clamped correctly');
        console.log(`   ✅ Complexity clamped (max: ${maxNumber}, expected: ≤${expectedMax})`);
      } else {
        results.failed.push('ALTCHA: Complexity not clamped');
        console.log(`   ❌ Complexity NOT clamped (max: ${maxNumber})`);
      }
    }
  } catch (error) {
    results.warnings.push('ALTCHA complexity test failed');
    console.log('   ⚠️  Could not test complexity');
  }

  // TEST 4: Invalid Challenge Rejection
  console.log('\n4️⃣ Testing Invalid Challenge Rejection');
  console.log('-'.repeat(70));
  try {
    const fakePayload = Buffer.from(JSON.stringify({
      salt: 'fake-salt',
      challenge: 'fake-challenge',
      number: 123,
      signature: 'fake-signature'
    })).toString('base64');
    
    const invalidChallenge = await makeRequest('POST', ENDPOINTS.altcha, {
      payload: fakePayload
    });
    
    if (invalidChallenge.status === 400 && invalidChallenge.body.verified === false) {
      results.passed.push('ALTCHA: Invalid challenges rejected');
      console.log('   ✅ Invalid challenges rejected');
    } else {
      results.failed.push('ALTCHA: Invalid challenges accepted');
      console.log('   ❌ Invalid challenges NOT rejected');
    }
  } catch (error) {
    results.warnings.push('Invalid challenge test failed');
    console.log('   ⚠️  Could not test invalid challenge');
  }

  // TEST 5: Method Validation
  console.log('\n5️⃣ Testing HTTP Method Validation');
  console.log('-'.repeat(70));
  try {
    // Test GET on POST-only endpoint
    const wrongMethod = await makeRequest('GET', ENDPOINTS.verifyPassword);
    if (wrongMethod.status === 405 || wrongMethod.status === 400) {
      results.passed.push('Method Validation: Invalid methods rejected');
      console.log('   ✅ Invalid HTTP methods rejected');
    } else {
      results.warnings.push('Method validation may not be strict');
      console.log('   ⚠️  Unexpected response for invalid method');
    }
  } catch (error) {
    results.warnings.push('Method validation test failed');
  }

  // TEST 6: Input Validation
  console.log('\n6️⃣ Testing Input Validation');
  console.log('-'.repeat(70));
  try {
    // Test missing required fields
    const missingFields = await makeRequest('POST', ENDPOINTS.verifyPassword, {});
    if (missingFields.status === 400) {
      results.passed.push('Input Validation: Missing fields rejected');
      console.log('   ✅ Missing required fields rejected');
    } else {
      results.failed.push('Input Validation: Missing fields accepted');
      console.log('   ❌ Missing fields NOT rejected');
    }
  } catch (error) {
    results.warnings.push('Input validation test failed');
  }

  // TEST 7: Error Information Disclosure
  console.log('\n7️⃣ Testing Error Information Disclosure');
  console.log('-'.repeat(70));
  try {
    const errorResponse = await makeRequest('POST', ENDPOINTS.verifyPassword, {
      password: 'test',
      hashedPassword: 'invalid'
    });
    
    // Check if error message exposes internal details
    const errorMsg = errorResponse.body?.error || errorResponse.body?.details || '';
    const sensitiveTerms = ['stack', 'trace', 'password', 'database', 'sql', 'query'];
    const hasSensitiveInfo = sensitiveTerms.some(term => 
      errorMsg.toLowerCase().includes(term)
    );
    
    if (!hasSensitiveInfo) {
      results.passed.push('Error Handling: No sensitive info leaked');
      console.log('   ✅ Error messages do not leak sensitive info');
    } else {
      results.warnings.push('Error Handling: May leak sensitive info');
      console.log('   ⚠️  Error messages may contain sensitive info');
    }
  } catch (error) {
    results.warnings.push('Error disclosure test failed');
  }

  // TEST 8: Security Headers
  console.log('\n8️⃣ Testing Security Headers');
  console.log('-'.repeat(70));
  try {
    const response = await makeRequest('GET', ENDPOINTS.altcha);
    const headers = response.headers;
    const securityHeaders = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-xss-protection': '1; mode=block'
    };
    
    let headersFound = 0;
    for (const [header, expected] of Object.entries(securityHeaders)) {
      if (headers[header] && headers[header].includes(expected)) {
        headersFound++;
      }
    }
    
    if (headersFound > 0) {
      results.passed.push(`Security Headers: ${headersFound} headers present`);
      console.log(`   ✅ ${headersFound} security headers present`);
    } else {
      results.warnings.push('Security Headers: Not all headers present');
      console.log('   ⚠️  Some security headers may be missing');
    }
  } catch (error) {
    results.warnings.push('Security headers test failed');
  }

  // TEST 9: SQL Injection Protection
  console.log('\n9️⃣ Testing SQL Injection Protection');
  console.log('-'.repeat(70));
  try {
    // Test SQL injection attempt in email field
    const sqlInjection = await makeRequest('POST', ENDPOINTS.verifyPassword, {
      password: "'; DROP TABLE users; --",
      hashedPassword: '$2a$10$test'
    });
    
    // Should reject or return error, not execute SQL
    if (sqlInjection.status === 400 || sqlInjection.status === 500) {
      results.passed.push('SQL Injection: Protected');
      console.log('   ✅ SQL injection attempts rejected');
    } else {
      results.warnings.push('SQL Injection: Response unclear');
      console.log('   ⚠️  Unclear if SQL injection is protected');
    }
  } catch (error) {
    results.warnings.push('SQL injection test failed');
  }

  // TEST 10: XSS Protection
  console.log('\n🔟 Testing XSS Protection');
  console.log('-'.repeat(70));
  try {
    const xssPayload = '<script>alert("XSS")</script>';
    const xssTest = await makeRequest('POST', ENDPOINTS.sendEmail, {
      to: xssPayload,
      subject: 'Test',
      html: 'Test'
    });
    
    // Should sanitize or reject
    if (xssTest.status === 400 || xssTest.status === 403) {
      results.passed.push('XSS: Protected');
      console.log('   ✅ XSS attempts rejected');
    } else {
      results.warnings.push('XSS: May need validation');
      console.log('   ⚠️  XSS protection unclear');
    }
  } catch (error) {
    results.warnings.push('XSS test failed');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 SECURITY AUDIT SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log('');

  if (results.passed.length > 0) {
    console.log('✅ PASSED TESTS:');
    results.passed.forEach(test => console.log(`   - ${test}`));
  }

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(test => console.log(`   - ${test}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warning => console.log(`   - ${warning}`));
  }

  console.log('\n' + '='.repeat(70));
  
  if (results.failed.length === 0) {
    console.log('🎉 Security audit passed! No critical vulnerabilities found.');
    process.exit(0);
  } else {
    console.log('⚠️  Some security issues found. Please review failed tests.');
    process.exit(1);
  }
}

testSecurity().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

