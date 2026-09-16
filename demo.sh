#!/usr/bin/env bash
# One-command demo launcher. Builds the engine, then starts the best available front end.
#   ./demo.sh            # UI if present, else raw dev player with narration
#   ./demo.sh raw        # raw dev player (no Claude Code chrome)
#   ./demo.sh coop [map] [skill]   # host a shared-marine co-op game; players join with: node mcp/watch.mjs
#   MODE=braille ./demo.sh raw
set -euo pipefail
cd "$(dirname "$0")"

echo ">> building engine"
make -C engine -s 2>&1 | grep -E "error|>>" || true
[ -x engine/build/doom-term ] || { echo "engine build failed"; exit 1; }

if [ ! -f .env ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo ">> no ANTHROPIC_API_KEY or .env: narrator will use canned lines"
fi

[ -d narrator/node_modules ] || (cd narrator && npm install --silent)

if [ "${1:-}" = "coop" ]; then
  [ -d mcp/node_modules ] || (cd mcp && npm install --silent)
  exec node mcp/server.mjs --host "${2:-1}" "${3:-3}"
fi

if [ "${1:-}" != "raw" ] && [ -f ui/package.json ]; then
  echo ">> starting UI (Claude Code chrome + Doom + narrator)"
  [ -d ui/node_modules ] || (cd ui && npm install --silent)
  cd ui && exec npm start -- "${@:2}"
fi

echo ">> starting raw dev player (Doom with narration, no chrome). Backtick cycles render modes, ctrl-c quits."
NARRATE=1 exec node engine/dev/play.mjs
