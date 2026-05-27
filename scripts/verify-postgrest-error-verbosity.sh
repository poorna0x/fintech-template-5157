#!/usr/bin/env bash
# Verify PostgREST no longer returns schema-leaking hint/details (requires SQL script applied).
# Usage:
#   bash scripts/verify-postgrest-error-verbosity.sh
#   SUPABASE_URL=... ANON_KEY=... bash scripts/verify-postgrest-error-verbosity.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"

if [[ -z "${SUPABASE_URL:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)
fi
if [[ -z "${ANON_KEY:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  ANON_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)
fi

SUPABASE_URL="${SUPABASE_URL:-}"
ANON_KEY="${ANON_KEY:-}"

if [[ -z "$SUPABASE_URL" || -z "$ANON_KEY" ]]; then
  echo "FAIL: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or env"
  exit 1
fi

BASE="${SUPABASE_URL%/}"
FAIL=0

probe() {
  local path="$1"
  local label="$2"
  local body
  body=$(curl -sS "${BASE}/rest/v1/${path}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Accept: application/json")

  echo "--- ${label} (${path}) ---"
  echo "$body" | head -c 400
  echo ""

  if echo "$body" | grep -qE '"hint"\s*:\s*"[^"]+'; then
    echo "  FAIL: response still contains hint (run scripts/secure-postgrest-error-verbosity.sql)"
    FAIL=1
  elif echo "$body" | grep -qi 'Perhaps you meant'; then
    echo "  FAIL: response still suggests table names"
    FAIL=1
  else
    echo "  OK: no hint / no table suggestions"
  fi
}

echo "=== PostgREST error verbosity (anon) ==="
probe "profiles" "missing table (scanner repro)"
probe "nonexistent_table_xyz_scan" "unknown table"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "All checks passed — minimal verbosity is active."
else
  echo "Apply scripts/secure-postgrest-error-verbosity.sql in Supabase SQL Editor, then re-run."
fi
exit "$FAIL"
