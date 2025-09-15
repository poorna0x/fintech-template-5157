// Test script for Netlify function
// Run this after setting environment variables

const testEmailFunction = async () => {
  const url = 'https://hydrogenrotest.netlify.app/.netlify/functions/send-email';
  
  const testData = {
    to: 'test@example.com',
    subject: 'Test Email',
    html: '<p>This is a test email</p>',
    text: 'This is a test email'
  };

  try {
    console.log('Testing Netlify function...');
    console.log('URL:', url);
    console.log('Data:', testData);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const result = await response.json();
    console.log('Response body:', result);

    if (response.ok) {
      console.log('✅ Function working correctly!');
    } else {
      console.log('❌ Function error:', result);
    }

  } catch (error) {
    console.error('❌ Network error:', error);
  }
};

// Run the test
testEmailFunction();
