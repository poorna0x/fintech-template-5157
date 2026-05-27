#!/usr/bin/env bash
# BreachMe LOW: ALTCHA ?fast=admin|technician must not return loginToken/payload with client IP.
# The legacy fast-login bypass was removed (commit 496c24f) — this script prevents regression.
set -euo pipefail

SITE="${1:-https://hydrogenro.netlify.app}"
FN="${SITE%/}/.netlify/functions/altcha-verify"
FAIL=0

check_fast_param() {
  local portal="$1"
  local url="${FN}?fast=${portal}"
  local body status

  body=$(curl -sS -w '\n%{http_code}' "$url" 2>/dev/null || true)
  status=$(echo "$body" | tail -1)
  body=$(echo "$body" | sed '$d')

  echo "--- GET ?fast=${portal} ---"
  echo "  HTTP ${status}"

  if [[ "$status" != "410" ]]; then
    echo "  FAIL: expected 410 Gone (fast-login removed), got ${status}"
    FAIL=1
  fi

  if echo "$body" | grep -qE 'hro-fast-login-v1'; then
    echo "  FAIL: response still contains hro-fast-login-v1 payload prefix"
    FAIL=1
  fi

  if echo "$body" | grep -qE '"loginToken"'; then
    echo "  FAIL: response still returns loginToken (fast-login bypass active)"
    FAIL=1
  fi

  if echo "$body" | grep -qE '"payload"'; then
    echo "  FAIL: response still returns payload field (may disclose client IP)"
    FAIL=1
  fi

  # IPv4 embedded in JSON (scanner repro: hro-fast-login-v1:admin:192.116.92.44)
  if echo "$body" | grep -qE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'; then
    echo "  FAIL: response contains an IPv4 address"
    FAIL=1
  fi

  if [[ "$FAIL" -eq 0 ]]; then
    echo "  OK — fast-login disabled, no token/payload/IP in response"
  fi
}

echo "=== ALTCHA fast-token removal (${SITE}) ==="
check_fast_param admin
check_fast_param technician

if [[ "$FAIL" -eq 0 ]]; then
  echo ""
  echo "All ALTCHA fast-token checks passed."
else
  echo ""
  echo "ALTCHA fast-token checks failed — ensure netlify/functions/altcha-verify.js rejects ?fast=."
fi

exit "$FAIL"
