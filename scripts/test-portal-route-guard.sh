#!/usr/bin/env bash
# Verify Netlify Edge portal protection (run after deploy).
set -euo pipefail
SITE="${1:-https://hydrogenro.netlify.app}"

echo "=== Without portal cookie ==="
echo -n "/admin → "
curl -sI "$SITE/admin" | head -1 | tr -d '\r'
echo -n "/admin/customers → "
curl -sI "$SITE/admin/customers" | head -1 | tr -d '\r'
echo -n "/technician → "
curl -sI "$SITE/technician" | head -1 | tr -d '\r'
echo -n "/settings → "
curl -sI "$SITE/settings" | head -1 | tr -d '\r'
echo -n "/admin/login → "
curl -sI "$SITE/admin/login" | head -1 | tr -d '\r'
echo -n "/ (public) → "
curl -sI "$SITE/" | head -1 | tr -d '\r'

echo ""
echo "Expect: /admin and /technician → 302; /admin/customers and /settings → 403; /admin/login and / → 200"
