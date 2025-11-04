// Test script for ALTCHA server-side verification
// Tests both challenge generation (GET) and verification (POST)

const testAltchaVerification = async () => {
  const baseUrl = process.env.ALTCHA_TEST_URL || 'http://localhost:8888/.netlify/functions/altcha-verify';
  const hmacKey = process.env.ALTCHA_HMAC_KEY || 'PLACEHOLDER-DO-NOT-USE-IN-PRODUCTION-GENERATE-REAL-KEY';
  
  console.log('🧪 Testing ALTCHA Server-Side Verification');
  console.log('='.repeat(60));
  console.log(`Base URL: ${baseUrl}`);
  console.log(`HMAC Key: ${hmacKey.substring(0, 20)}... (${hmacKey.length} chars)`);
  console.log('');

  let testResults = {
    challengeGeneration: false,
    challengeVerification: false,
    replayAttackPrevention: false,
    invalidPayloadRejection: false,
    expiredChallengeRejection: false,
  };

  try {
    // Test 1: Challenge Generation (GET)
    console.log('📋 Test 1: Challenge Generation (GET)');
    console.log('-'.repeat(60));
    
    const challengeUrl = `${baseUrl}?complexity=12`;
    console.log(`GET ${challengeUrl}`);
    
    const challengeResponse = await fetch(challengeUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`Status: ${challengeResponse.status}`);
    
    if (!challengeResponse.ok) {
      const errorText = await challengeResponse.text();
      console.error('❌ Challenge generation failed:', errorText);
      return testResults;
    }

    const challengeData = await challengeResponse.json();
    console.log('✅ Challenge generated successfully');
    console.log('Response fields:', Object.keys(challengeData));
    console.log('Algorithm:', challengeData.algorithm);
    console.log('MaxNumber:', challengeData.maxnumber);
    console.log('Salt (first 20 chars):', challengeData.salt?.substring(0, 20));
    
    // Verify required fields
    const requiredFields = ['algorithm', 'challenge', 'salt', 'signature', 'maxnumber'];
    const hasAllFields = requiredFields.every(field => challengeData[field] !== undefined);
    
    if (hasAllFields) {
      testResults.challengeGeneration = true;
      console.log('✅ All required fields present');
    } else {
      console.log('❌ Missing required fields');
      const missing = requiredFields.filter(field => challengeData[field] === undefined);
      console.log('Missing:', missing);
    }
    
    console.log('');

    // Test 2: Invalid Payload Rejection (POST with fake payload)
    console.log('📋 Test 2: Invalid Payload Rejection');
    console.log('-'.repeat(60));
    
    const fakePayload = Buffer.from(JSON.stringify({
      algorithm: 'SHA-256',
      challenge: 'fake-challenge',
      salt: 'fake-salt',
      number: 12345,
      signature: 'fake-signature'
    })).toString('base64');
    
    console.log(`POST ${baseUrl} (with fake payload)`);
    
    const invalidResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload: fakePayload }),
    });

    const invalidResult = await invalidResponse.json();
    console.log(`Status: ${invalidResponse.status}`);
    console.log('Response:', invalidResult);
    
    if (invalidResult.verified === false) {
      testResults.invalidPayloadRejection = true;
      console.log('✅ Invalid payload correctly rejected');
    } else {
      console.log('❌ Invalid payload was accepted (security issue!)');
    }
    
    console.log('');

    // Test 3: Missing Payload Rejection
    console.log('📋 Test 3: Missing Payload Rejection');
    console.log('-'.repeat(60));
    
    const missingPayloadResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty payload
    });

    const missingResult = await missingPayloadResponse.json();
    console.log(`Status: ${missingPayloadResponse.status}`);
    console.log('Response:', missingResult);
    
    if (missingPayloadResponse.status === 400 && missingResult.verified === false) {
      console.log('✅ Missing payload correctly rejected');
    } else {
      console.log('❌ Missing payload was not rejected');
    }
    
    console.log('');

    // Test 4: Note about client-side verification
    console.log('📋 Test 4: Client-Side Verification Required');
    console.log('-'.repeat(60));
    console.log('ℹ️  To test full verification flow, you need:');
    console.log('   1. A valid ALTCHA widget solution (client-side PoW)');
    console.log('   2. The payload from the widget after solving');
    console.log('');
    console.log('   To get a valid payload:');
    console.log('   - Open your app in browser');
    console.log('   - Complete ALTCHA verification');
    console.log('   - Check browser console for payload');
    console.log('   - Use that payload in Test 5');
    console.log('');

    // Test 5: Manual payload verification (if provided)
    if (process.env.ALTCHA_TEST_PAYLOAD) {
      console.log('📋 Test 5: Manual Payload Verification');
      console.log('-'.repeat(60));
      
      const testPayload = process.env.ALTCHA_TEST_PAYLOAD;
      console.log(`POST ${baseUrl} (with provided payload)`);
      
      const verifyResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: testPayload }),
      });

      const verifyResult = await verifyResponse.json();
      console.log(`Status: ${verifyResponse.status}`);
      console.log('Response:', verifyResult);
      
      if (verifyResult.verified === true) {
        testResults.challengeVerification = true;
        console.log('✅ Payload verified successfully');
        
        // Test replay attack prevention
        console.log('');
        console.log('📋 Test 5b: Replay Attack Prevention');
        console.log('-'.repeat(60));
        console.log(`POST ${baseUrl} (same payload again)`);
        
        const replayResponse = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ payload: testPayload }),
        });

        const replayResult = await replayResponse.json();
        console.log(`Status: ${replayResponse.status}`);
        console.log('Response:', replayResult);
        
        if (replayResult.verified === false && replayResult.error === 'Challenge already used') {
          testResults.replayAttackPrevention = true;
          console.log('✅ Replay attack correctly prevented');
        } else {
          console.log('❌ Replay attack not prevented (security issue!)');
        }
      } else {
        console.log('❌ Payload verification failed:', verifyResult.error);
      }
      
      console.log('');
    } else {
      console.log('📋 Test 5: Skipped (no ALTCHA_TEST_PAYLOAD env var)');
      console.log('-'.repeat(60));
      console.log('ℹ️  To test with a real payload:');
      console.log('   export ALTCHA_TEST_PAYLOAD="<base64-payload-from-widget>"');
      console.log('   node test-altcha-verify.js');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error('Stack:', error.stack);
  }

  // Summary
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`Challenge Generation:        ${testResults.challengeGeneration ? '✅' : '❌'}`);
  console.log(`Invalid Payload Rejection:   ${testResults.invalidPayloadRejection ? '✅' : '❌'}`);
  console.log(`Challenge Verification:     ${testResults.challengeVerification ? '✅' : '⚠️  (requires manual payload)'}`);
  console.log(`Replay Attack Prevention:   ${testResults.replayAttackPrevention ? '✅' : '⚠️  (requires manual payload)'}`);
  console.log('');

  const allBasicTests = testResults.challengeGeneration && testResults.invalidPayloadRejection;
  if (allBasicTests) {
    console.log('✅ Basic server-side verification tests PASSED');
    console.log('⚠️  Full verification requires client-side widget interaction');
  } else {
    console.log('❌ Some basic tests FAILED');
  }
  
  console.log('');
  console.log('📝 Usage:');
  console.log('  node test-altcha-verify.js');
  console.log('');
  console.log('📝 With environment variables:');
  console.log('  ALTCHA_TEST_URL=http://localhost:8888/.netlify/functions/altcha-verify');
  console.log('  ALTCHA_HMAC_KEY=your-key-here');
  console.log('  ALTCHA_TEST_PAYLOAD=base64-payload-from-widget');
  console.log('  node test-altcha-verify.js');
  console.log('');
};

// Run tests
testAltchaVerification().catch(console.error);

