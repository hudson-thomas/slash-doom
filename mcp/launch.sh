#!/usr/bin/env bash
# Plugin entry point: make sure deps exist, then run the MCP server on stdio.
# stdout belongs to MCP, so all setup output goes to a log file.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
log="${TMPDIR:-/tmp}/doom-plugin-setup.log"
[ -d "$root/mcp/node_modules/@modelcontextprotocol" ] || (cd "$root/mcp" && npm install --no-audit --no-fund >>"$log" 2>&1)
# Engine build (clone + 24MB WAD + compile) can outlast the MCP startup timeout, so do it in the
# background; until it finishes doom_start falls back to the fake engine.
if [ ! -x "$root/engine/build/doom-term" ] || ! ls "$root"/engine/wads/*.wad >/dev/null 2>&1; then
  (cd "$root/engine" && ./get-deps.sh && make) >>"$log" 2>&1 </dev/null &
fi
exec node "$root/mcp/server.mjs"
