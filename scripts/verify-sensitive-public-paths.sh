#!/usr/bin/env bash
# Verify sensitive probe paths return HTTP 404 (not SPA 200). Exit 1 on failure.
set -euo pipefail
SITE="${1:-https://hydrogenro.com}"

PATHS=(
  "/.git/config"
  "/config.json"
  "/.env"
  "/package.json"
)

FAIL=0
echo "=== Sensitive public paths must return 404 (not SPA 200) ==="
echo "Site: $SITE"
echo ""

for p in "${PATHS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE$p")
  if [[ "$CODE" == "404" ]]; then
    echo "  OK  $p → $CODE"
  else
    echo "  FAIL $p → $CODE (expected 404 — SPA catch-all may be masking this path)"
    FAIL=1
  fi
done

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "All sensitive path checks passed."
else
  echo "Fix: deploy netlify.toml sensitive-path 404 rules (scripts/sync-sensitive-path-redirects.mjs)."
fi
exit "$FAIL"
