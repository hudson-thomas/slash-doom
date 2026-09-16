#!/usr/bin/env node
// Bridge: makes a hosted MCP game look like a local engine. stdin lines go to the game socket (keys, cheats,
// size, mode, snapshot requests); socket lines come out on stdout. "T" action lines become "L Claude: ..." so the
// Claude Code lookalike shows them in its tool log. Use via the narrator's ENGINE hook:
//   ENGINE=node:mcp/bridge.mjs ./demo.sh        (with a game hosted by Claude Code's /doom:play or ./demo.sh coop)
import net from "node:net";
import os from "node:os";
import path from "node:path";
const SOCK = process.env.DOOM_SOCK ?? path.join(os.tmpdir(), "fablenight-doom.sock");
const sock = net.connect(SOCK);
sock.on("error", e => { process.stdout.write(`L bridge: no hosted game at ${SOCK} (${e.code}). Start one with /doom:play or ./demo.sh coop\n`); setTimeout(() => process.exit(1), 100); });
let acc = "";
sock.on("data", d => {
  acc += d.toString();
  let nl;
  while ((nl = acc.indexOf("\n")) >= 0) {
    const line = acc.slice(0, nl); acc = acc.slice(nl + 1);
    process.stdout.write((line.startsWith("T ") ? "L " + line.slice(2).replace(/^Claude: /, "Claude: ") : line) + "\n");
  }
});
sock.on("close", () => process.exit(0));
let inbuf = "";
process.stdin.on("data", d => {
  inbuf += d.toString();
  let nl;
  while ((nl = inbuf.indexOf("\n")) >= 0) {
    const l = inbuf.slice(0, nl); inbuf = inbuf.slice(nl + 1);
    if (l === "q") process.exit(0);
    if (sock.writable) sock.write(l + "\n");
  }
});
process.stdin.on("end", () => process.exit(0));
