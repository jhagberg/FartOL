#!/usr/bin/env bash
# Authored for fartola. Not ported from upstream.
#
# Smoke test: install the locally-built fartola tarball into a throwaway
# tmpdir via `npm install --prefix <tmpdir> -g <tarball>`, then boot the
# installed binary and assert /api/health + the SvelteKit SPA shell are
# both served. Asserts the resolved BIN path BEFORE invocation so a
# future regression in npm's global-prefix layout surfaces the layout
# mismatch loud and early (C-H4 LOCKED — both --prefix and -g are
# required for the global-install bin layout; --prefix alone places the
# bin at $TMPDIR/node_modules/.bin/fartola (local layout), while
# --prefix + -g together place it at $TMPDIR/bin/fartola per npm's global
# prefix layout. The package contents land at
# $TMPDIR/lib/node_modules/<scope>/<name>/).
#
# Locked by:
# - .planning/phases/01-single-laptop-training-mvp/01-18-PLAN.md task 2
#   (C-H4 install-smoke layout assertion).
# - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-1.
#
# Usage:
#   bash apps/edge/scripts/install-smoke.sh dist/fartola-*.tgz
# Exits 0 with `PASS` on success; non-zero with a context message on failure.

set -euo pipefail

TARBALL_INPUT="${1:?usage: install-smoke.sh <tarball>}"
if [ ! -f "$TARBALL_INPUT" ]; then
  echo "FAIL: tarball not found at $TARBALL_INPUT"
  exit 1
fi
# Resolve to absolute path. A relative path like `dist/fartola-0.1.0.tgz` is
# interpreted by npm 9+ as a GitHub `<user>/<repo>` shorthand and triggers a
# git clone attempt instead of a local-file install. Both `./<path>` and an
# absolute path avoid the shorthand parser; absolute is unambiguous.
TARBALL="$(readlink -f "$TARBALL_INPUT")"

TMPDIR_PATH="$(mktemp -d /tmp/fartola-install-XXXXXX)"
PORT="${FARTOLA_SMOKE_PORT:-30001}"

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
#   $TMPDIR/bin/fartola                                      (the PATH-bound symlink)
#   $TMPDIR/lib/node_modules/<scope>/<name>/                (the package contents)
# Without -g, the bin lands at $TMPDIR/node_modules/.bin/fartola (a local-prefix
# layout). The script asserts the global-prefix BIN location BEFORE invoking
# the binary so any future npm layout drift surfaces clearly.
npm install --prefix "$TMPDIR_PATH" -g --silent "$TARBALL"

BIN="$TMPDIR_PATH/bin/fartola"
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
DB_PATH="$TMPDIR_PATH/fartola.db"
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

# The SPA shell is the SvelteKit-built 200.html — it carries the title "fartOLa"
# from apps/web/src/app.html (locked by UI-SPEC). Match either the explicit
# <title>fartOLa</title> emit or the fartOLa string anywhere in the HTML.
HTML="$(curl -fs "http://127.0.0.1:$PORT/" || true)"
HTML_BYTES="${#HTML}"
echo "SPA shell bytes: $HTML_BYTES"
if [ "$HTML_BYTES" -lt 200 ]; then
  echo "FAIL: SPA shell unexpectedly tiny (got $HTML_BYTES bytes)"
  tail -40 "$TMPDIR_PATH/server.log"
  exit 1
fi
if ! echo "$HTML" | grep -qE '<title>[^<]*fartOLa|fartOLa'; then
  echo "FAIL: SPA shell did not contain 'fartOLa' marker"
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

# Stage 2: bridge-enabled boot to assert the `serialport` native dep ships
# with the tarball. Stage 1 above uses --no-bridge, which short-circuits the
# SerialTransport import — so a missing `serialport` runtime dep slips
# through (regression caught 2026-05-17 mid-runbook: bridge crashed on first
# open with "Cannot find module 'serialport'" after the global install).
#
# Strategy: boot a second instance against a guaranteed-absent device path
# so the bridge tries (and is expected to fail) to open it. Required failure
# mode is ENOENT-flavoured (the module loaded, the device just isn't there).
# The forbidden failure mode is "Cannot find module 'serialport'", which
# means the dep wasn't shipped.
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""

PORT2="$((PORT + 1))"
BRIDGE_LOG="$TMPDIR_PATH/server-bridge.log"
FAKE_SERIAL="$TMPDIR_PATH/no-such-device-fartola-smoke"
echo "Booting $BIN on port $PORT2 with bridge → $FAKE_SERIAL (expected ENOENT)..."
"$BIN" --port "$PORT2" --db-path "$DB_PATH" --backup-dir "$BACKUP_DIR" \
  --serial-path "$FAKE_SERIAL" \
  > "$BRIDGE_LOG" 2>&1 &
SERVER_PID=$!

# Wait for the listening socket (bridge open attempt happens during boot;
# the reconnect loop then fires on the same backoff schedule).
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "FAIL: bridge-enabled server exited; tail of bridge log:"
    tail -40 "$BRIDGE_LOG"
    exit 1
  fi
  if curl -fs "http://127.0.0.1:$PORT2/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Give the reconnect loop at least one open-attempt cycle so the log captures
# the failure mode (first attempt fires at 250ms; second at +500ms).
sleep 1

if grep -q "Cannot find module 'serialport'" "$BRIDGE_LOG"; then
  echo "FAIL: serialport native dep missing from tarball install (regression!)"
  echo "Tail of bridge log:"
  tail -40 "$BRIDGE_LOG"
  exit 1
fi

# Bridge failure must not take the HTTP server down.
if ! curl -fs "http://127.0.0.1:$PORT2/api/health" > /dev/null 2>&1; then
  echo "FAIL: /api/health unreachable after bridge open failure"
  tail -40 "$BRIDGE_LOG"
  exit 1
fi

# Positive signal: at least one SI bridge open attempt was logged (proves
# the SerialTransport module loaded — only way we get here is if `require
# ('serialport')` succeeded).
if ! grep -q 'SI bridge open attempt' "$BRIDGE_LOG"; then
  echo "FAIL: no 'SI bridge open attempt' in log — SerialTransport may not have loaded"
  tail -40 "$BRIDGE_LOG"
  exit 1
fi

echo "PASS"
