#!/bin/bash

echo "🧪 Rate Limiting Test - Terminal"
echo "================================="
echo ""
echo "Making 7 rapid requests to verify-technician-password endpoint"
echo "Expected: First 5 requests = 200 OK, Requests 6+ = 429 Rate Limited"
echo ""
echo "================================="
echo ""

BASE_URL="http://localhost:8888"
ENDPOINT="/.netlify/functions/verify-technician-password"

for i in {1..7}; do
  echo -n "Request $i: "
  
  response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:8080" \
    -H "X-Forwarded-For: 127.0.0.1" \
    -d '{"password":"test","hashedPassword":"$2a$10$test"}')
  
  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | head -n -1)
  
  if [ "$http_code" = "200" ]; then
    echo "✅ 200 OK - ALLOWED"
  elif [ "$http_code" = "429" ]; then
    echo "🚫 429 RATE LIMITED - BLOCKED"
    echo "   Response: $body"
    echo ""
    echo "✅ Rate limiting is WORKING! Request $i was blocked."
    break
  else
    echo "❓ $http_code - $body"
  fi
  
  sleep 0.2
done

echo ""
echo "================================="
echo "Test Complete!"

