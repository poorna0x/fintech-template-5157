#!/usr/bin/env bash
# Post-deploy / post-build checks for BreachMe LOW findings. Exit 1 on hard failures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${1:-https://hydrogenro.netlify.app}"
FAIL=0

echo "=== 1) CSP: no localhost in production HTTP header ==="
CSP=$(curl -sI "$SITE/" | tr -d '\r' | grep -i '^content-security-policy:' || true)
if [[ -z "$CSP" ]]; then
  echo "  FAIL: no Content-Security-Policy HTTP header"
  FAIL=1
elif echo "$CSP" | grep -qiE 'localhost|127\.0\.0\.1'; then
  echo "  FAIL: localhost found in CSP"
  echo "  $CSP"
  FAIL=1
else
  echo "  OK — production CSP has no localhost"
fi

echo ""
echo "=== 2) Bundle: no dev URLs in public index chunk ==="
INDEX_PATH=$(curl -s "$SITE/" | grep -oE 'assets/index-[^"]+\.js' | head -1 || true)
if [[ -z "$INDEX_PATH" ]]; then
  echo "  WARN: could not find index-*.js in HTML"
else
  BODY=$(curl -s "$SITE/${INDEX_PATH}")
  if echo "$BODY" | grep -qE 'localhost:8888|127\.0\.0\.1:8888'; then
    echo "  FAIL: dev proxy URLs in $INDEX_PATH"
    FAIL=1
  else
    echo "  OK — $INDEX_PATH has no localhost:8888"
  fi
fi

if [[ -d "$ROOT/dist/assets" ]]; then
  LOCAL_INDEX=$(ls "$ROOT/dist/assets"/index-*.js 2>/dev/null | head -1 || true)
  if [[ -n "$LOCAL_INDEX" ]] && grep -qE 'localhost:8888|127\.0\.0\.1:8888' "$LOCAL_INDEX"; then
    echo "  FAIL: dev URLs in local dist/$(basename "$LOCAL_INDEX")"
    FAIL=1
  fi
fi

echo ""
echo "=== 3) HTTP headers: fingerprint reduction ==="
HDRS=$(curl -sI "$SITE/" | tr -d '\r')
for h in server x-powered-by x-nf-request-id cache-status; do
  if echo "$HDRS" | grep -qi "^${h}:"; then
    echo "  WARN: $h still present (Netlify may re-add some after Edge)"
  else
    echo "  OK: $h not present"
  fi
done

echo ""
echo "=== 4) Supabase anon key in client bundle (expected — mitigated by RLS + RPC locks) ==="
if [[ -n "${INDEX_PATH:-}" ]]; then
  if echo "$BODY" | grep -q 'supabase.co'; then
    echo "  INFO: Supabase URL appears in JS — required for @supabase/supabase-js in browser"
    echo "  INFO: Ensure dashboard MFA, RLS, and scripts/secure-* SQL are applied"
  else
    echo "  OK: no obvious supabase.co string in index (may still use env at runtime)"
  fi
fi

echo ""
echo "=== 5) PostgREST error hints (Supabase — run secure-postgrest-error-verbosity.sql) ==="
if [[ -f "$ROOT/.env.local" ]]; then
  if bash "$ROOT/scripts/verify-postgrest-error-verbosity.sh" 2>/dev/null; then
    echo "  OK — no schema hints in anon REST errors"
  else
    echo "  FAIL: PostgREST still returns hint/details — apply scripts/secure-postgrest-error-verbosity.sql"
    FAIL=1
  fi
else
  echo "  SKIP: no .env.local (set SUPABASE_URL + ANON_KEY to test)"
fi

echo ""
echo "=== 6) ALTCHA fast-token removed (no IP in ?fast= response) ==="
if bash "$ROOT/scripts/verify-altcha-fast-token-removed.sh" "$SITE"; then
  echo "  OK — ?fast=admin|technician returns 410 with no loginToken/payload/IP"
else
  echo "  FAIL: ALTCHA fast-login bypass may be active — see verify-altcha-fast-token-removed.sh"
  FAIL=1
fi

echo ""
echo "=== 7) Portal route guard ==="
bash "$ROOT/scripts/test-portal-route-guard.sh" "$SITE" || FAIL=1

echo ""
echo "=== 8) Sensitive probe paths (BreachMe: .git, config.json) ==="
if bash "$ROOT/scripts/verify-sensitive-public-paths.sh" "$SITE"; then
  echo "  OK — sensitive paths return 404"
else
  FAIL=1
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "All automated checks passed."
else
  echo "One or more checks failed."
fi
exit "$FAIL"
