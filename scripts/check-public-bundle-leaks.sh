#!/usr/bin/env bash
# Fail if sensitive table/RPC names appear in the public index chunk (not admin-data).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/assets"

INDEX=$(ls "$DIST"/index-*.js 2>/dev/null | head -1)
ADMIN=$(ls "$DIST"/admin-data-*.js 2>/dev/null | head -1)

if [[ -z "$INDEX" ]]; then
  echo "Run npm run build first"
  exit 1
fi

LEAKS=(
  'upsert_website_booking_intent'
  'create_customer_for_booking'
  'delete_job_admin'
  'is_admin_user'
  'website_booking_intent'
  'job_assignment_requests'
  'technician_salary'
)

echo "Public index chunk: $(basename "$INDEX") ($(wc -c <"$INDEX" | tr -d ' ') bytes)"
FAIL=0
for token in "${LEAKS[@]}"; do
  if grep -q "$token" "$INDEX"; then
    echo "  LEAK: $token"
    FAIL=1
  fi
done

if [[ "$FAIL" -eq 0 ]]; then
  echo "  OK — no known admin RPC/table tokens in public index bundle"
fi

if [[ -n "$ADMIN" ]]; then
  echo "Admin data chunk: $(basename "$ADMIN") ($(wc -c <"$ADMIN" | tr -d ' ') bytes)"
fi

exit "$FAIL"
