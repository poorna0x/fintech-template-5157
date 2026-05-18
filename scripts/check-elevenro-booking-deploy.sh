#!/usr/bin/env bash
# Verify Eleven RO production has booking Netlify functions + new JS (not anon RPC).
set -euo pipefail
SITE="${1:-https://elevenro.com}"
FAIL=0

echo "=== 1) booking-customer-mutate function exists ==="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$SITE/.netlify/functions/booking-customer-mutate" \
  -H "Origin: https://elevenro.com")
if [[ "$CODE" == "404" ]]; then
  echo "  FAIL: function 404 — Eleven RO Netlify site must deploy netlify/functions + env vars"
  FAIL=1
elif [[ "$CODE" == "200" || "$CODE" == "204" ]]; then
  echo "  OK — OPTIONS returned $CODE"
else
  echo "  WARN: OPTIONS returned $CODE (expected 200; 502 = function error / missing SUPABASE_SERVICE_ROLE_KEY)"
  [[ "$CODE" == "502" ]] && FAIL=1
fi

echo ""
echo "=== 2) /book bundle must not call create_customer_for_booking via anon RPC ==="
BOOKING_CHUNK=$(curl -s "$SITE/book" | grep -oE 'assets/Booking-[A-Za-z0-9_-]+\.js' | head -1 || true)
if [[ -z "$BOOKING_CHUNK" ]]; then
  echo "  WARN: could not find Booking-*.js on $SITE/book"
else
  BODY=$(curl -s "$SITE/$BOOKING_CHUNK")
  if echo "$BODY" | grep -q 'create_customer_for_booking'; then
    echo "  FAIL: $BOOKING_CHUNK still uses supabase.rpc(create_customer_for_booking) — redeploy main"
    FAIL=1
  else
    echo "  OK — $BOOKING_CHUNK has no direct booking RPC"
  fi
  if echo "$BODY" | grep -q 'booking-customer-mutate'; then
    echo "  OK — uses booking-customer-mutate Netlify path"
  else
    echo "  INFO: mutate string may live in bookingCustomer-*.js chunk (run full build deploy)"
  fi
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "Eleven RO booking deploy checks passed."
else
  echo "Fix: Netlify → Eleven RO site → Deploy latest main; set SUPABASE_SERVICE_ROLE_KEY + ALTCHA_HMAC_KEY; VITE_WEBSITE_BOOKING_SITE_KEY=elevenro"
fi
exit "$FAIL"
