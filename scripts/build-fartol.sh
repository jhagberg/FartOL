#!/usr/bin/env bash
# Authored for fartol. Not ported from upstream.
#
# Repo-root convenience wrapper for the FartOL tarball build. Delegates to
# apps/edge/scripts/build-tarball.sh so the build chain lives next to the
# package being packed.
#
# Locked by: .planning/phases/01-single-laptop-training-mvp/01-18-PLAN.md task 1.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
exec bash "$ROOT/apps/edge/scripts/build-tarball.sh" "$@"
