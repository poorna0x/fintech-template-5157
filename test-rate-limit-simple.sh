#!/bin/bash
# Simple rate limiting test script

BASE_URL="${TEST_URL:-http://localhost:8888}"
ORIGIN="http://localhost:8080"

echo "🧪 Testing Rate Limiting"
echo "========================"
echo "Base URL: $BASE_URL"
echo "Origin: $ORIGIN"
echo ""

# Test 1: Password Verification (should limit at 5)
echo "1️⃣ Testing Password Verification Endpoint"
echo "   Expected: 5 requests allowed, then 429"
echo ""

for i in {1..8}; do
  response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/.netlify/functions/verify-technician-password" \
    -H "Content-Type: application/json" \
    -H "Origin: $ORIGIN" \
    -d '{"password":"test","hashedPassword":"$2a$10$test"}' 2>&1)
  
  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)
  
  if [ "$status" = "200" ]; then
    echo "   Request $i: ✅ 200 OK"
  elif [ "$status" = "429" ]; then
    echo "   Request $i: 🚫 429 Rate Limited"
    retry_after=$(echo "$body" | grep -o '"retryAfter":[0-9]*' | cut -d: -f2)
    if [ -n "$retry_after" ]; then
      echo "      Retry-After: $retry_after seconds"
    fi
    echo ""
    echo "   ✅ Rate limiting working! Blocked at request $i"
    break
  else
    echo "   Request $i: ❓ Status $status"
    echo "   Response: $body"
  fi
  
  sleep 0.1
done

echo ""
echo "2️⃣ Testing Password Hashing Endpoint"
echo "   Expected: 20 requests allowed, then 429"
echo ""

# Test 2: Password Hashing (should limit at 20)
blocked_count=0
for i in {1..25}; do
  response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/.netlify/functions/hash-technician-password" \
    -H "Content-Type: application/json" \
    -H "Origin: $ORIGIN" \
    -d '{"password":"test123"}' 2>&1)
  
  status=$(echo "$response" | tail -1)
  
  if [ "$status" = "200" ]; then
    if [ $((i % 5)) -eq 0 ]; then
      echo "   Request $i: ✅ 200 OK"
    fi
  elif [ "$status" = "429" ]; then
    blocked_count=$((blocked_count + 1))
    if [ $blocked_count -eq 1 ]; then
      echo "   Request $i: 🚫 429 Rate Limited (first block)"
      echo ""
      echo "   ✅ Rate limiting working! Blocked at request $i"
    fi
  fi
  
  sleep 0.05
done

echo ""
echo "3️⃣ Testing ALTCHA Endpoint"
echo "   Expected: 30 requests allowed, then 429"
echo ""

# Test 3: ALTCHA (should limit at 30)
blocked_count=0
for i in {1..35}; do
  response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/.netlify/functions/altcha-verify?complexity=14" \
    -H "Origin: $ORIGIN" 2>&1)
  
  status=$(echo "$response" | tail -1)
  
  if [ "$status" = "200" ]; then
    if [ $((i % 10)) -eq 0 ]; then
      echo "   Request $i: ✅ 200 OK"
    fi
  elif [ "$status" = "429" ]; then
    blocked_count=$((blocked_count + 1))
    if [ $blocked_count -eq 1 ]; then
      echo "   Request $i: 🚫 429 Rate Limited (first block)"
      echo ""
      echo "   ✅ Rate limiting working! Blocked at request $i"
    fi
  fi
  
  sleep 0.05
done

echo ""
echo "📊 Test Summary"
echo "==============="
echo "✅ If you see 429 responses, rate limiting is working!"
echo "✅ Check the request numbers where blocking occurred"
echo ""

