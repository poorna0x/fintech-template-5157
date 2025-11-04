// Test ALTCHA in production for admin, technician, and booking pages
const https = require('https');

const BASE_URL = 'https://hydrogenro.com';

// Test ALTCHA endpoint directly
async function testAltchaEndpoint() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'hydrogenro.com',
      port: 443,
      path: '/.netlify/functions/altcha-verify?complexity=12',
      method: 'GET',
      headers: {
        'Origin': BASE_URL
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data),
            cors: res.headers['access-control-allow-origin']
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            cors: res.headers['access-control-allow-origin']
          });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Test pages that use ALTCHA
async function testPage(page) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'hydrogenro.com',
      port: 443,
      path: `/${page}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SecurityTest/1.0)'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          hasAltcha: data.includes('altcha-widget') || data.includes('AltchaWidget'),
          hasVerifyUrl: data.includes('altcha-verify') || data.includes('/.netlify/functions/altcha-verify'),
          size: data.length
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 ALTCHA Production Test');
  console.log('='.repeat(60));
  console.log(`Testing: ${BASE_URL}`);
  console.log('='.repeat(60));
  
  // Test 1: ALTCHA endpoint
  console.log('\n1️⃣ Testing ALTCHA Endpoint');
  console.log('-'.repeat(60));
  try {
    const endpointTest = await testAltchaEndpoint();
    console.log(`   Status: ${endpointTest.status}`);
    console.log(`   CORS Header: ${endpointTest.cors || 'Not set'}`);
    
    if (endpointTest.status === 200 && endpointTest.body) {
      console.log(`   ✅ Endpoint working`);
      console.log(`   Algorithm: ${endpointTest.body.algorithm}`);
      console.log(`   Max Number: ${endpointTest.body.maxnumber}`);
      console.log(`   Has Salt: ${!!endpointTest.body.salt}`);
      console.log(`   Has Signature: ${!!endpointTest.body.signature}`);
    } else {
      console.log(`   ❌ Endpoint not working properly`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test 2: Admin Login Page
  console.log('\n2️⃣ Testing Admin Login Page (/admin)');
  console.log('-'.repeat(60));
  try {
    const adminPage = await testPage('admin');
    console.log(`   Status: ${adminPage.status}`);
    console.log(`   Has ALTCHA Widget: ${adminPage.hasAltcha ? '✅' : '❌'}`);
    console.log(`   Has Verify URL: ${adminPage.hasVerifyUrl ? '✅' : '❌'}`);
    if (adminPage.hasAltcha && adminPage.hasVerifyUrl) {
      console.log(`   ✅ ALTCHA is integrated`);
    } else {
      console.log(`   ⚠️  ALTCHA may not be loaded (check page source)`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test 3: Technician Login Page
  console.log('\n3️⃣ Testing Technician Login Page (/technician/login)');
  console.log('-'.repeat(60));
  try {
    const techPage = await testPage('technician/login');
    console.log(`   Status: ${techPage.status}`);
    console.log(`   Has ALTCHA Widget: ${techPage.hasAltcha ? '✅' : '❌'}`);
    console.log(`   Has Verify URL: ${techPage.hasVerifyUrl ? '✅' : '❌'}`);
    if (techPage.hasAltcha && techPage.hasVerifyUrl) {
      console.log(`   ✅ ALTCHA is integrated`);
    } else {
      console.log(`   ⚠️  ALTCHA may not be loaded (check page source)`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test 4: Booking Page
  console.log('\n4️⃣ Testing Booking Page (/book)');
  console.log('-'.repeat(60));
  try {
    const bookingPage = await testPage('book');
    console.log(`   Status: ${bookingPage.status}`);
    console.log(`   Has ALTCHA Widget: ${bookingPage.hasAltcha ? '✅' : '❌'}`);
    console.log(`   Has Verify URL: ${bookingPage.hasVerifyUrl ? '✅' : '❌'}`);
    if (bookingPage.hasAltcha && bookingPage.hasVerifyUrl) {
      console.log(`   ✅ ALTCHA is integrated`);
    } else {
      console.log(`   ⚠️  ALTCHA may not be loaded (check page source)`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 Summary');
  console.log('='.repeat(60));
  console.log('✅ Test complete!');
  console.log('\nTo verify ALTCHA is working:');
  console.log('1. Visit https://hydrogenro.com/admin');
  console.log('2. Look for ALTCHA widget (should appear automatically)');
  console.log('3. Check browser console for any errors');
  console.log('4. Try submitting the form - it should work after ALTCHA verifies');
  console.log('\nNote: ALTCHA widget may be hidden but running in background');
}

runTests().catch(console.error);

