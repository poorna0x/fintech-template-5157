#!/usr/bin/env bash
# 2-minute RLS smoke test (5 curls). Usage:
#   export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
#   export ANON_KEY="eyJ..."
#   export ADMIN_JWT="eyJ..."   # optional: skips tests 4–5
#   export TECH_JWT="eyJ..."    # optional: skips test 5
#   export TECH_ID="uuid"       # optional: for test 2 (ACTIVE technician)
#   ./scripts/quick-rls-test.sh

set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${ANON_KEY:?Set ANON_KEY}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; }
skip() { echo -e "${YELLOW}SKIP${NC} $1"; }
warn() { echo -e "${YELLOW}WARN${NC} $1"; }

# Returns 0 if JSON looks blocked (empty array, error object, or no sensitive keys in array)
anon_blocked_sensitive() {
  local body="$1"
  if echo "$body" | grep -qE '"code"|"message".*permission|42501'; then
    return 0
  fi
  if echo "$body" | grep -q 'current_location\|"salary"\|password'; then
    return 1
  fi
  if echo "$body" | grep -q '^\[\]$'; then
    return 0
  fi
  # Non-empty array without sensitive fields is OK
  if echo "$body" | grep -q '^\['; then
    return 0
  fi
  return 0
}

curl_anon() {
  curl -sS "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY"
}

curl_auth() {
  local jwt="$1"
  shift
  curl -sS "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $jwt"
}

echo "=== Quick RLS test (5 curls) ==="
echo "URL: $SUPABASE_URL"
echo ""

# 1) Anon must NOT read GPS / salary / password
echo "--- 1/5 Anon: technicians sensitive columns ---"
BODY=$(curl_anon "technicians?select=id,current_location,salary,password&limit=5")
if anon_blocked_sensitive "$BODY"; then
  pass "anon cannot read current_location, salary, password"
else
  fail "anon returned sensitive technician data:"
  echo "$BODY" | head -c 500
  echo ""
fi

# 2) Anon MAY read ID-card columns (if TECH_ID set)
echo "--- 2/5 Anon: technicians ID-card columns ---"
if [[ -z "${TECH_ID:-}" ]]; then
  skip "set TECH_ID to an ACTIVE technician uuid to run ID-card check"
else
  BODY=$(curl_anon "technicians?id=eq.${TECH_ID}&select=id,full_name,employee_id,phone,email,photo,status")
  if echo "$BODY" | grep -q '"full_name"'; then
    if echo "$BODY" | grep -qE 'current_location|"salary"|password'; then
      fail "ID-card response includes sensitive fields"
      echo "$BODY"
    else
      pass "anon ID-card columns OK for TECH_ID"
    fi
  else
    fail "expected ID-card row for TECH_ID"
    echo "$BODY"
  fi
fi

# 3) Anon must NOT list jobs
echo "--- 3/5 Anon: jobs table ---"
BODY=$(curl_anon "jobs?select=id,service_location&limit=3")
if echo "$BODY" | grep -qE '"code"|permission|42501'; then
  pass "anon blocked from jobs"
elif echo "$BODY" | grep -q '^\[\]$'; then
  pass "anon gets empty jobs list"
elif echo "$BODY" | grep -q '"id"'; then
  fail "anon can read jobs:"
  echo "$BODY" | head -c 500
  echo ""
else
  warn "unexpected jobs response (review manually):"
  echo "$BODY" | head -c 300
  echo ""
fi

# 4) Admin should read multiple technicians with salary/GPS
echo "--- 4/5 Admin JWT: technicians salary + GPS ---"
if [[ -z "${ADMIN_JWT:-}" ]]; then
  skip "set ADMIN_JWT (login as admin, copy access token)"
else
  BODY=$(curl_auth "$ADMIN_JWT" "technicians?select=id,full_name,salary,current_location&limit=5")
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  if [[ "$COUNT" -ge 2 ]] && echo "$BODY" | grep -q 'salary'; then
    pass "admin sees multiple technicians with salary/GPS fields"
  elif [[ "$COUNT" -ge 1 ]]; then
    warn "admin sees technicians but check salary/GPS manually ($COUNT rows)"
    echo "$BODY" | head -c 400
    echo ""
  else
    fail "admin cannot read technicians (check JWT / is_admin_user):"
    echo "$BODY" | head -c 500
    echo ""
  fi
fi

# 5) Technician: only own row on table; roster RPC has no GPS/salary
echo "--- 5/5 Technician JWT: own row + roster RPC ---"
if [[ -z "${TECH_JWT:-}" ]]; then
  skip "set TECH_JWT (login as technician, copy access token)"
else
  BODY=$(curl_auth "$TECH_JWT" "technicians?select=id,current_location,salary&limit=20")
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  if [[ "$COUNT" -eq 1 ]] && echo "$BODY" | grep -q 'current_location'; then
    pass "technician sees exactly one row (self) with current_location"
  elif [[ "$COUNT" -eq 1 ]]; then
    pass "technician sees one row (self)"
  elif [[ "$COUNT" -gt 1 ]]; then
    fail "technician sees $COUNT rows — peer GPS/salary may be exposed:"
    echo "$BODY" | head -c 500
    echo ""
  else
    fail "technician sees 0 rows (auth/RLS issue):"
    echo "$BODY"
  fi

  RPC=$(curl -sS "$SUPABASE_URL/rest/v1/rpc/get_technician_roster_for_app" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $TECH_JWT" \
    -H "Content-Type: application/json" \
    -d '{}')
  if echo "$RPC" | grep -qE 'current_location|"salary"|password'; then
    fail "roster RPC exposes sensitive fields"
    echo "$RPC" | head -c 400
  elif echo "$RPC" | grep -q '"full_name"'; then
    pass "roster RPC returns peers without GPS/salary"
  elif echo "$RPC" | grep -qE '"code"|42883'; then
    warn "roster RPC missing — run secure-technicians-privacy.sql and deploy app"
    echo "$RPC"
  else
    warn "roster RPC empty or unexpected (OK if single-tech org):"
    echo "$RPC" | head -c 200
  fi
fi

echo ""
echo "Done. Fix any FAIL before next security scan."
