#!/usr/bin/env bash
# One-command demo launcher. Builds the engine, then starts the best available front end.
#   ./demo.sh            # UI if present, else raw dev player with narration
#   ./demo.sh raw        # raw dev player (no Claude Code chrome)
#   MODE=braille ./demo.sh raw
set -euo pipefail
cd "$(dirname "$0")"

echo ">> building engine"
make -C engine -s 2>&1 | grep -E "error|>>" || true
[ -x engine/build/doom-term ] || { echo "engine build failed"; exit 1; }

if [ ! -f .env ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo ">> no ANTHROPIC_API_KEY or .env: narrator will use canned lines"
fi

if [ "${1:-}" != "raw" ] && [ -f ui/package.json ]; then
  echo ">> starting UI"
  if [ ! -d ui/node_modules ]; then (cd ui && (command -v bun >/dev/null && bun install || npm install)); fi
  cd ui
  if command -v bun >/dev/null; then exec bun run start; else exec npm start; fi
fi

echo ">> starting raw dev player (Doom with narration, no chrome). Backtick cycles render modes, ctrl-c quits."
[ -d narrator/node_modules ] || (cd narrator && npm install --silent)
NARRATE=1 exec node engine/dev/play.mjs
