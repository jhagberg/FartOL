#!/usr/bin/env bash
#
# bench-smoke-phase2.sh — Phase 2.0 round-trip smoke test.
#
# Boots (or reuses) a local FartOL bridge and exercises the six core
# Phase 2.0 surfaces via curl + sqlite3 assertions:
#
#   1. /mip empty poll returns well-formed MIPData XML.
#   2. /mop POST of MOPComplete fixture returns MOPStatus OK; shadow row
#      lands in meos_competitors.
#   3. /api/eventor/status returns parseable JSON.
#   4. Hyrbricka round-trip — create comp + class, walk-up POST with
#      hired_card=true, GET open list, PATCH return, GET returned list.
#   5. Schema sanity — hired_cards + meos_competitors carry expected
#      columns.
#   6. D-MIP-3 re-emit — /mip poll surfaces the just-bound card with
#      hired="true" attribute.
#
# Parameterized via env vars so Task 4's Wednesday-morning bench can
# point the script at the running production bridge:
#
#   FARTOL_PORT       — bridge port (default 3001)
#   FARTOL_HOST       — bridge host (default 127.0.0.1)
#   FARTOL_DB         — sqlite db path (default /tmp/fartol-smoke-$$.db)
#   FARTOL_SKIP_BOOT  — when 1, skip bridge boot + cleanup; assume an
#                       externally-running bridge at $HOST:$PORT and
#                       preserve the DB on exit
#
# Exit 0 = all six assertions passed. Exit non-zero = at least one
# failed; a red prefix names the failing assertion.
#
# Plan 02-06 task 3.

set -euo pipefail

# ---------------------------------------------------------------------------
# 0. Parameterize (env-var overrides for the Task 4 prod-bridge invocation)
# ---------------------------------------------------------------------------
: "${FARTOL_PORT:=3001}"
: "${FARTOL_HOST:=127.0.0.1}"
: "${FARTOL_DB:=/tmp/fartol-smoke-$$.db}"
: "${FARTOL_SKIP_BOOT:=0}"

BASE="http://${FARTOL_HOST}:${FARTOL_PORT}"

RED='\033[31m'
GREEN='\033[32m'
NC='\033[0m'

assertions=()
record_pass() {
  assertions+=("PASS: $1")
  printf '%b✓ %s%b\n' "$GREEN" "$1" "$NC"
}
record_fail() {
  assertions+=("FAIL: $1")
  printf '%b✗ %s%b\n' "$RED" "$1" "$NC" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Pre-flight: required tools on PATH
# ---------------------------------------------------------------------------
# Map each binary to the package that ships it so the error message is
# actionable (operator can copy-paste the install command instead of
# guessing). Same package set is documented in
# docs/ops/parallel-meos-runbook.md §Pre-event setup.
declare -A TOOL_PKG=(
  [curl]="curl"
  [jq]="jq"
  [xmllint]="libxml2-utils"
  [sqlite3]="sqlite3"
)
missing=()
for tool in curl jq xmllint sqlite3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    missing+=("$tool (apt package: ${TOOL_PKG[$tool]})")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  printf '%b✗ preflight: missing tools:%b\n' "$RED" "$NC" >&2
  for m in "${missing[@]}"; do
    printf '    %s\n' "$m" >&2
  done
  printf '\n  Install all on Debian/Ubuntu:\n' >&2
  printf '    sudo apt install curl jq libxml2-utils sqlite3\n\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Boot bridge (skip if FARTOL_SKIP_BOOT=1 — Task 4 prod-bridge path)
# ---------------------------------------------------------------------------
FARTOL_PID=""

cleanup() {
  if [ -n "$FARTOL_PID" ]; then
    kill "$FARTOL_PID" 2>/dev/null || true
    wait "$FARTOL_PID" 2>/dev/null || true
  fi
  # Only remove the temp DB when this script booted the bridge itself;
  # preserve the prod DB in the Task 4 SKIP_BOOT path.
  if [ "$FARTOL_SKIP_BOOT" = "0" ]; then
    rm -f "$FARTOL_DB" "${FARTOL_DB}-wal" "${FARTOL_DB}-shm" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ "$FARTOL_SKIP_BOOT" = "0" ]; then
  # Locate the bin: prefer `fartol` on PATH, else fall back to the workspace
  # tsx invocation. The latter is the dev path; the former is what gets
  # shipped by `pnpm pack:tarball`.
  if command -v fartol >/dev/null 2>&1; then
    fartol --port "$FARTOL_PORT" --bind-host "$FARTOL_HOST" \
           --db-path "$FARTOL_DB" --no-bridge \
           > /tmp/fartol-smoke-$$.log 2>&1 &
    FARTOL_PID=$!
  else
    # Walk up from this script's location to the workspace root, then
    # invoke the tsx entrypoint. Works from any cwd.
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    EDGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
    (cd "$EDGE_ROOT" && \
      node --import tsx src/bin/fartol.ts \
        --port "$FARTOL_PORT" --bind-host "$FARTOL_HOST" \
        --db-path "$FARTOL_DB" --no-bridge \
        > /tmp/fartol-smoke-$$.log 2>&1) &
    FARTOL_PID=$!
  fi
fi

# ---------------------------------------------------------------------------
# 3. Wait for ready — poll /api/health until 200 (max 30 attempts, 0.5s)
# ---------------------------------------------------------------------------
ready=0
for _ in $(seq 1 30); do
  if curl -fsS "${BASE}/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
if [ "$ready" = "0" ]; then
  if [ -f /tmp/fartol-smoke-$$.log ]; then
    echo "--- bridge log tail ---" >&2
    tail -20 /tmp/fartol-smoke-$$.log >&2
  fi
  record_fail "bridge not ready at ${BASE}/api/health after 15s"
fi
printf '  bridge ready at %s\n' "$BASE"

# ---------------------------------------------------------------------------
# 4. Smoke assertion 1 — /mip empty poll
# ---------------------------------------------------------------------------
MIP_EMPTY=$(curl -fsS "${BASE}/mip?lastid=0" || true)
if [ -z "$MIP_EMPTY" ]; then
  record_fail "assertion 1: /mip returned empty body"
fi
if ! printf '%s' "$MIP_EMPTY" | xmllint --noout - 2>/dev/null; then
  record_fail "assertion 1: /mip returned non-XML body: $(printf '%s' "$MIP_EMPTY" | head -c 200)"
fi
if ! printf '%s' "$MIP_EMPTY" | grep -q 'MIPData'; then
  record_fail "assertion 1: /mip body missing MIPData element"
fi
if ! printf '%s' "$MIP_EMPTY" | grep -q 'xmlns="http://www.melin.nu/mip"'; then
  record_fail "assertion 1: /mip body missing MIP namespace"
fi
record_pass "assertion 1: /mip empty poll returns valid MIPData XML"

# ---------------------------------------------------------------------------
# 5. Smoke assertion 2 — /mop accepts MOPComplete fixture
# ---------------------------------------------------------------------------
MOP_FIXTURE="apps/edge/src/integrations/meos/__fixtures__/mop-complete-small.xml"
if [ ! -f "$MOP_FIXTURE" ]; then
  # Try resolving relative to script location (when run from elsewhere).
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  MOP_FIXTURE="${SCRIPT_DIR}/../src/integrations/meos/__fixtures__/mop-complete-small.xml"
fi
if [ ! -f "$MOP_FIXTURE" ]; then
  record_fail "assertion 2: MOP fixture not found"
fi

MOP_RESPONSE=$(curl -fsS -X POST -H "Content-Type: text/xml" \
  --data-binary "@${MOP_FIXTURE}" "${BASE}/mop" || true)
if ! printf '%s' "$MOP_RESPONSE" | grep -q 'MOPStatus status="OK"'; then
  record_fail "assertion 2: /mop did not return MOPStatus status=\"OK\"; got: $MOP_RESPONSE"
fi

MEOS_ROW=$(sqlite3 "$FARTOL_DB" "SELECT id FROM meos_competitors WHERE id='5490'" || true)
if [ "$MEOS_ROW" != "5490" ]; then
  record_fail "assertion 2: meos_competitors id=5490 missing after MOP POST (got: '$MEOS_ROW')"
fi
record_pass "assertion 2: /mop accepts MOPComplete; shadow row 5490 persisted"

# ---------------------------------------------------------------------------
# 6. Smoke assertion 3 — Eventor cache status
# ---------------------------------------------------------------------------
EVENTOR_STATUS=$(curl -fsS "${BASE}/api/eventor/status" || true)
if [ -z "$EVENTOR_STATUS" ]; then
  record_fail "assertion 3: /api/eventor/status returned empty body"
fi
if ! printf '%s' "$EVENTOR_STATUS" | jq -e . >/dev/null 2>&1; then
  record_fail "assertion 3: /api/eventor/status body is not JSON: $EVENTOR_STATUS"
fi
EVENTOR_STATE=$(printf '%s' "$EVENTOR_STATUS" | jq -r '.state')
case "$EVENTOR_STATE" in
  ready|stale|offline|no_key) ;;
  *) record_fail "assertion 3: unexpected eventor state '$EVENTOR_STATE'";;
esac
record_pass "assertion 3: /api/eventor/status JSON parses (state=${EVENTOR_STATE})"

# ---------------------------------------------------------------------------
# 7. Smoke assertion 4 — Hyrbricka round-trip
# ---------------------------------------------------------------------------
TODAY=$(date +%Y-%m-%d)
COMP_NAME="smoke-$(date +%s)"
COMP_CREATE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"${COMP_NAME}\",\"date\":\"${TODAY}\"}" \
  "${BASE}/api/competitions" || true)
COMP_ID=$(printf '%s' "$COMP_CREATE" | jq -r '.id')
if [ -z "$COMP_ID" ] || [ "$COMP_ID" = "null" ]; then
  record_fail "assertion 4: competition create failed: $COMP_CREATE"
fi

CLASS_CREATE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"name":"Vit"}' \
  "${BASE}/api/competitions/${COMP_ID}/classes" || true)
CLASS_ID=$(printf '%s' "$CLASS_CREATE" | jq -r '.id')
if [ -z "$CLASS_ID" ] || [ "$CLASS_ID" = "null" ]; then
  record_fail "assertion 4: class create failed: $CLASS_CREATE"
fi

COMP_BODY=$(jq -nc \
  --arg comp "$COMP_ID" --arg cls "$CLASS_ID" \
  '{competition_id:$comp, name:"Smoke Tester", class_id:$cls,
    card_number:88888, consent:true, hired_card:true,
    hired_contact:{name:"Smoke Renter", phone:"0701234567",
                   email:null, note:null}}')
COMPETITOR_CREATE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d "$COMP_BODY" "${BASE}/api/competitors" || true)
COMPETITOR_ID=$(printf '%s' "$COMPETITOR_CREATE" | jq -r '.id')
if [ -z "$COMPETITOR_ID" ] || [ "$COMPETITOR_ID" = "null" ]; then
  record_fail "assertion 4: competitor create failed: $COMPETITOR_CREATE"
fi

LIST_OPEN=$(curl -fsS "${BASE}/api/competitions/${COMP_ID}/hired-cards" || true)
OPEN_CARD=$(printf '%s' "$LIST_OPEN" | jq -r '.open[0].card_number')
OPEN_PHONE=$(printf '%s' "$LIST_OPEN" | jq -r '.open[0].contact_phone')
if [ "$OPEN_CARD" != "88888" ]; then
  record_fail "assertion 4: open[0].card_number != 88888 (got '$OPEN_CARD' from $LIST_OPEN)"
fi
if [ "$OPEN_PHONE" != "0701234567" ]; then
  record_fail "assertion 4: open[0].contact_phone wrong (got '$OPEN_PHONE')"
fi

RETURN_RESP=$(curl -fsS -X PATCH \
  "${BASE}/api/competitions/${COMP_ID}/hired-cards/88888/return" || true)
RETURN_OK=$(printf '%s' "$RETURN_RESP" | jq -r '.ok')
if [ "$RETURN_OK" != "true" ]; then
  record_fail "assertion 4: PATCH return failed: $RETURN_RESP"
fi

LIST_AFTER=$(curl -fsS "${BASE}/api/competitions/${COMP_ID}/hired-cards" || true)
OPEN_COUNT=$(printf '%s' "$LIST_AFTER" | jq '.open | length')
RETURNED_CARD=$(printf '%s' "$LIST_AFTER" | jq -r '.returned[0].card_number')
if [ "$OPEN_COUNT" != "0" ]; then
  record_fail "assertion 4: open list non-empty after return (count=$OPEN_COUNT)"
fi
if [ "$RETURNED_CARD" != "88888" ]; then
  record_fail "assertion 4: returned[0].card_number != 88888 (got '$RETURNED_CARD')"
fi
record_pass "assertion 4: Hyrbricka round-trip — create → list → return → re-list OK"

# ---------------------------------------------------------------------------
# 8. Smoke assertion 5 — schema sanity
# ---------------------------------------------------------------------------
HC_SCHEMA=$(sqlite3 "$FARTOL_DB" ".schema hired_cards" || true)
for col in competition_id card_number marked_at_ms; do
  if ! printf '%s' "$HC_SCHEMA" | grep -q "$col"; then
    record_fail "assertion 5: hired_cards schema missing column '$col'"
  fi
done

MEOS_SCHEMA=$(sqlite3 "$FARTOL_DB" ".schema meos_competitors" || true)
if ! printf '%s' "$MEOS_SCHEMA" | grep -q 'id'; then
  record_fail "assertion 5: meos_competitors schema missing 'id' column"
fi
record_pass "assertion 5: schema includes hired_cards + meos_competitors with expected columns"

# ---------------------------------------------------------------------------
# 9. Smoke assertion 6 — D-MIP-3 re-emit (hired-flag flow-through)
# ---------------------------------------------------------------------------
# We have a hired card #88888 just bound during the Hyrbricka round-trip.
# Set the active competition so the /mip route surfaces the entry, then
# poll /mip?lastid=0 and confirm both the <entry> + hired="true" attr
# appear (D-MIP-3 — the same UUID re-emits on /mip after card-bind).
ACTIVE_RESP=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d "{\"competition_id\":\"${COMP_ID}\"}" \
  "${BASE}/api/sessions/active-competition" || true)
ACTIVE_ID=$(printf '%s' "$ACTIVE_RESP" | jq -r '.competition_id')
if [ "$ACTIVE_ID" != "$COMP_ID" ]; then
  record_fail "assertion 6: failed to set active competition (got '$ACTIVE_ID')"
fi

MIP_FULL=$(curl -fsS "${BASE}/mip?lastid=0" || true)
if ! printf '%s' "$MIP_FULL" | grep -q '<entry'; then
  record_fail "assertion 6: /mip after walk-up has no <entry>: $MIP_FULL"
fi
if ! printf '%s' "$MIP_FULL" | grep -Eq 'hired="?true"?'; then
  record_fail "assertion 6: /mip entry missing hired=\"true\" attribute: $MIP_FULL"
fi
if ! printf '%s' "$MIP_FULL" | grep -q '>88888<'; then
  record_fail "assertion 6: /mip entry missing card 88888: $MIP_FULL"
fi
record_pass "assertion 6: D-MIP-3 — /mip surfaces hired-card entry with hired=true"

# ---------------------------------------------------------------------------
# 10. Success print
# ---------------------------------------------------------------------------
printf '\n%b✓ Phase 2.0 smoke: 6/6 passed%b\n' "$GREEN" "$NC"
exit 0
