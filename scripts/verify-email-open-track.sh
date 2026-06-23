#!/usr/bin/env bash
# Email open-tracking pixel must return image/gif, not SPA HTML.
set -euo pipefail
SITE="${1:-https://hydrogenro.com}"
TOKEN="${2:-00000000-0000-4000-8000-000000000001}"

check() {
  local label="$1"
  local url="$2"
  local type
  type=$(curl -sI "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type" {print tolower($2); exit}')
  if [[ "$type" == *"image/gif"* ]]; then
    echo "  OK  $label → image/gif"
    return 0
  fi
  echo "  FAIL $label → ${type:-unknown} (expected image/gif)"
  return 1
}

echo "=== Email open-tracking pixel ==="
echo "Site: $SITE"
FAIL=0
check "function URL" "$SITE/.netlify/functions/email-open-track?t=$TOKEN" || FAIL=1
check "api URL" "$SITE/api/email-open-track?t=$TOKEN" || FAIL=1
exit "$FAIL"
