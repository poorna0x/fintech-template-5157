#!/usr/bin/env bash
# Verify booking intent is not callable with anon key (run after secure-website-booking-intent-rpc.sql).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env.local — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  exit 1
fi

# shellcheck disable=SC1090
source <(grep -E '^VITE_SUPABASE_(URL|ANON_KEY)=' "$ENV_FILE" | sed 's/^/export /')

if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  echo "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set in .env.local"
  exit 1
fi

SITE="${1:-https://hydrogenro.netlify.app}"

echo "1) Direct anon RPC (expect 42501 permission denied)"
curl -s -X POST "${VITE_SUPABASE_URL}/rest/v1/rpc/upsert_website_booking_intent" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_full_name":"Security Test","p_phone":"9876543210","p_phone_normalized":"9876543210","p_current_step":1,"p_site_key":"hydrogenro"}'
echo ""

echo "2) Netlify proxy without ALTCHA (expect 403 after deploy)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "${SITE}/.netlify/functions/booking-intent" \
  -H "Content-Type: application/json" \
  -H "Origin: https://hydrogenro.com" \
  -d '{"action":"upsert","full_name":"Test","phone":"9876543210","phone_normalized":"9876543210","current_step":1,"site_key":"hydrogenro"}'
