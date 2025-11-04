// Debug rate limiter
const rateLimiter = require('./netlify/functions/rate-limiter.js');

const event = {
  httpMethod: 'POST',
  headers: {
    'x-forwarded-for': '127.0.0.1',
    'origin': 'http://localhost:8080'
  }
};

console.log('Testing rate limiter...\n');

for (let i = 1; i <= 7; i++) {
  const result = rateLimiter.rateLimiters.password(event);
  console.log(`Request ${i}:`);
  if (result) {
    console.log(`  Status: ${result.statusCode}`);
    const body = JSON.parse(result.body);
    console.log(`  Message: ${body.message}`);
  } else {
    console.log(`  Result: null (allowed)`);
  }
  console.log('');
}
