#!/usr/bin/env bash
# Authored for fartol. Not ported from upstream.
#
# Smoke test: install the locally-built fartol tarball into a throwaway
# tmpdir via `npm install --prefix <tmpdir> -g <tarball>`, then boot the
# installed binary and assert /api/health + the SvelteKit SPA shell are
# both served. Asserts the resolved BIN path BEFORE invocation so a
# future regression in npm's global-prefix layout surfaces the layout
# mismatch loud and early (C-H4 LOCKED — both --prefix and -g are
# required for the global-install bin layout; --prefix alone places the
# bin at $TMPDIR/node_modules/.bin/fartol (local layout), while
# --prefix + -g together place it at $TMPDIR/bin/fartol per npm's global
# prefix layout. The package contents land at
# $TMPDIR/lib/node_modules/<scope>/<name>/).
#
# Locked by:
# - .planning/phases/01-single-laptop-training-mvp/01-18-PLAN.md task 2
#   (C-H4 install-smoke layout assertion).
# - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-1.
#
# Usage:
#   bash apps/edge/scripts/install-smoke.sh dist/fartol-*.tgz
# Exits 0 with `PASS` on success; non-zero with a context message on failure.

set -euo pipefail

TARBALL="${1:?usage: install-smoke.sh <tarball>}"
if [ ! -f "$TARBALL" ]; then
  echo "FAIL: tarball not found at $TARBALL"
  exit 1
fi

TMPDIR_PATH="$(mktemp -d /tmp/fartol-install-XXXXXX)"
PORT="${FARTOL_SMOKE_PORT:-30001}"

# Defer cleanup until the end so even early failures leave debug output.
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR_PATH"
}
trap cleanup EXIT INT TERM

echo "Installing $TARBALL -> $TMPDIR_PATH (true global-install, -g flag)..."
# C-H4 LOCKED: --prefix + -g together produce the npm global-prefix layout:
#   $TMPDIR/bin/fartol                                      (the PATH-bound symlink)
#   $TMPDIR/lib/node_modules/<scope>/<name>/                (the package contents)
# Without -g, the bin lands at $TMPDIR/node_modules/.bin/fartol (a local-prefix
# layout). The script asserts the global-prefix BIN location BEFORE invoking
# the binary so any future npm layout drift surfaces clearly.
npm install --prefix "$TMPDIR_PATH" -g --silent "$TARBALL"

BIN="$TMPDIR_PATH/bin/fartol"
echo "Resolved BIN path: $BIN"
if [ ! -e "$BIN" ]; then
  echo "FAIL: binary not found at $BIN"
  echo "Listing $TMPDIR_PATH/bin/ for debug:"
  ls -la "$TMPDIR_PATH/bin/" 2>/dev/null || echo "(directory does not exist)"
  echo "Listing $TMPDIR_PATH/lib/node_modules/ for debug (package landed here):"
  ls -la "$TMPDIR_PATH/lib/node_modules/" 2>/dev/null || echo "(directory does not exist)"
  echo "Listing $TMPDIR_PATH/node_modules/.bin/ for debug (local-prefix fallback):"
  ls -la "$TMPDIR_PATH/node_modules/.bin/" 2>/dev/null || echo "(directory does not exist)"
  exit 1
fi
if [ ! -x "$BIN" ]; then
  echo "FAIL: binary at $BIN is not executable"
  ls -la "$BIN"
  exit 1
fi

# Boot the binary against a tmpdir DB + backup-dir + no-bridge (no /dev/ttyUSB0
# in CI / install-smoke). Health + SPA assertions run before kill.
DB_PATH="$TMPDIR_PATH/fartol.db"
BACKUP_DIR="$TMPDIR_PATH/backups"

echo "Booting $BIN on port $PORT with --no-bridge..."
"$BIN" --port "$PORT" --db-path "$DB_PATH" --backup-dir "$BACKUP_DIR" --no-bridge \
  > "$TMPDIR_PATH/server.log" 2>&1 &
SERVER_PID=$!

# Wait for the listening socket. Up to 10s. If the process exits before that,
# surface the log.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "FAIL: server exited before listening; tail of server.log:"
    tail -40 "$TMPDIR_PATH/server.log"
    exit 1
  fi
  if curl -fs "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

RESP="$(curl -fs "http://127.0.0.1:$PORT/api/health" || true)"
echo "Health: $RESP"
echo "$RESP" | grep -q '"status":"ok"' || {
  echo "FAIL: health endpoint did not return status=ok"
  tail -40 "$TMPDIR_PATH/server.log"
  exit 1
}

# The SPA shell is the SvelteKit-built 200.html — it carries the title "FartOL"
# from apps/web/src/app.html (locked by UI-SPEC). Match either the explicit
# <title>FartOL</title> emit or the FartOL string anywhere in the HTML.
HTML="$(curl -fs "http://127.0.0.1:$PORT/" || true)"
HTML_BYTES="${#HTML}"
echo "SPA shell bytes: $HTML_BYTES"
if [ "$HTML_BYTES" -lt 200 ]; then
  echo "FAIL: SPA shell unexpectedly tiny (got $HTML_BYTES bytes)"
  tail -40 "$TMPDIR_PATH/server.log"
  exit 1
fi
if ! echo "$HTML" | grep -qE '<title>[^<]*FartOL|FartOL'; then
  echo "FAIL: SPA shell did not contain 'FartOL' marker"
  echo "$HTML" | head -20
  exit 1
fi

# SPA fallback: deep-link path must also return 200 with the same shell so
# SvelteKit's client-side router can take over (REQ-OPS-001 + RESEARCH P3).
DEEP_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/competition/abc/results")"
if [ "$DEEP_STATUS" != "200" ]; then
  echo "FAIL: SPA deep-link fallback returned $DEEP_STATUS (expected 200)"
  exit 1
fi

# /api/* should still 404 with JSON (no static-fallback for API paths).
API_404_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/__missing__")"
if [ "$API_404_STATUS" != "404" ]; then
  echo "FAIL: /api/* missing route returned $API_404_STATUS (expected 404)"
  exit 1
fi

echo "PASS"
