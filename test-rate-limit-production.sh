#!/bin/bash

# Production Rate Limiting Test
# Run this after deploying to production

PROD_URL="${PROD_URL:-https://hydrogenro.com}"
ENDPOINT="/.netlify/functions/verify-technician-password"

echo "🧪 Production Rate Limiting Test"
echo "================================="
echo "Testing: $PROD_URL$ENDPOINT"
echo "Expected: First 5 requests = 200 OK, Requests 6+ = 429 Rate Limited"
echo ""
echo "================================="
echo ""

for i in {1..7}; do
  echo -n "Request $i: "
  
  response=$(curl -s -w "\n%{http_code}" -X POST "$PROD_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Origin: $PROD_URL" \
    -d '{"password":"test","hashedPassword":"$2a$10$test"}' 2>&1)
  
  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "200" ]; then
    echo "✅ 200 OK - ALLOWED"
  elif [ "$http_code" = "429" ]; then
    echo "🚫 429 RATE LIMITED - BLOCKED ✅"
    echo ""
    echo "   Response: $body"
    echo ""
    echo "✅ SUCCESS: Rate limiting is WORKING in production!"
    echo "   Request $i was correctly blocked after limit."
    break
  else
    echo "❓ $http_code"
    echo "   Response: $body"
  fi
  
  sleep 0.5
done

echo ""
echo "================================="
echo "Test Complete!"
echo ""
echo "If you see 429 responses, rate limiting is working correctly!"
echo "If all requests are 200, check:"
echo "  1. Changes are deployed to production"
echo "  2. Netlify Functions are updated"
echo "  3. Check Netlify function logs for rate limit messages"

