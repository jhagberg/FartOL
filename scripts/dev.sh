#!/usr/bin/env bash
# Authored for fartol. Not ported from upstream.
#
# scripts/dev.sh — one-shot dev stack launcher.
#
# When run inside a kitty terminal with remote control enabled (the
# default, see ~/.config/kitty/kitty.conf `allow_remote_control yes`),
# this opens TWO new kitty tabs in the current window:
#   - fartol-edge   : FARTOL_DEV=1 pnpm --filter @fartol/edge dev
#   - fartol-web    : pnpm --filter @fartol/web dev
#
# When run outside kitty, prints the two commands so the operator can
# paste them into separate terminals manually.
#
# Usage:
#   bash scripts/dev.sh           # spawn the two tabs (or fall back to instructions)
#   bash scripts/dev.sh --status  # show pnpm dev processes currently running
#   bash scripts/dev.sh --stop    # kill any matching `tsx watch` and `vite dev` procs
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
EDGE_CMD='FARTOL_DEV=1 pnpm --filter @fartol/edge dev'
WEB_CMD='pnpm --filter @fartol/web dev'

show_status() {
  echo "== fartol dev processes =="
  pgrep -af 'tsx watch.*fartol\.ts' || echo "  (no edge dev process)"
  pgrep -af 'vite dev.*5173|vite.*fartol/web' || echo "  (no web dev process)"
}

stop_all() {
  echo "Stopping fartol dev processes..."
  pkill -f 'tsx watch.*fartol\.ts' 2>/dev/null || true
  pkill -f 'vite dev.*5173' 2>/dev/null || true
  sleep 0.5
  show_status
}

print_manual_instructions() {
  cat <<EOF
Not running inside a kitty tab with remote control — open two terminals
manually and run:

  Terminal 1 (edge):
    cd $REPO_ROOT && $EDGE_CMD

  Terminal 2 (web):
    cd $REPO_ROOT && $WEB_CMD

Then open http://localhost:5173 in a browser.
EOF
}

spawn_in_kitty() {
  local title="$1"
  local cmd="$2"
  # `kitten @ launch --type=tab` spawns a new tab in the current kitty
  # window. The `--keep-focus` flag means we don't yank the operator
  # away from the controlling tab between the two spawns. We pipe the
  # command through `bash -lc` so PATH/nvm/pnpm inherit correctly even
  # if the user is on a custom shell.
  kitten @ launch \
    --type=tab \
    --tab-title="$title" \
    --cwd="$REPO_ROOT" \
    --keep-focus \
    -- bash -lc "$cmd ; echo ; echo '--- $title exited; press any key to close ---'; read -n 1 -s -r"
}

case "${1:-}" in
  --status)
    show_status
    exit 0
    ;;
  --stop)
    stop_all
    exit 0
    ;;
esac

if [[ -z "${KITTY_WINDOW_ID:-}" ]] || ! command -v kitten >/dev/null 2>&1; then
  print_manual_instructions
  exit 0
fi

# Probe remote control. If kitty.conf is missing `allow_remote_control yes`,
# `kitten @ ls` exits non-zero. Fall back to manual instructions in that case.
if ! kitten @ ls >/dev/null 2>&1; then
  echo "kitty remote control is disabled."
  echo "Add 'allow_remote_control yes' to ~/.config/kitty/kitty.conf and reload kitty."
  echo
  print_manual_instructions
  exit 0
fi

spawn_in_kitty 'fartol-edge' "$EDGE_CMD"
spawn_in_kitty 'fartol-web' "$WEB_CMD"

cat <<EOF
Spawned two kitty tabs:
  - fartol-edge  (HTTP :3000 + SI bridge on /dev/ttyUSB0)
  - fartol-web   (Vite dev :5173)

Open http://localhost:5173 once both have logged "Ready" / "Server listening".
Stop both with:    bash scripts/dev.sh --stop
Status check:      bash scripts/dev.sh --status
EOF
