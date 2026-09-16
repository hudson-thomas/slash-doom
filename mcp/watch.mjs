#!/usr/bin/env node
// Spectator AND co-op controller for the Doom MCP server: shows the game Claude Code is playing, full colour,
// with Claude's actions underneath. Your keys drive the same marine (arrows/WASD move, f fire, space use).
// Several people can run this at once. Run in a second terminal:  node mcp/watch.mjs   (ctrl-c or ` quits)
import net from "node:net";
import os from "node:os";
import path from "node:path";

const SOCK = process.env.DOOM_SOCK ?? path.join(os.tmpdir(), "fablenight-doom.sock");
const STATUS_ROWS = 4;
const out = process.stdout;
let actions = ["waiting for Claude Code to call doom_start…  (your keys work too: arrows/WASD, f fire, space use, g god)"], stat = "", acc = "", sock = null;
const KEYS = {
  "\x1b[A": "up", "\x1b[B": "down", "\x1b[D": "left", "\x1b[C": "right",
  " ": "use", "\r": "enter", "\x1b": "esc", "\t": "tab",
  w: "up", s: "down", a: "left", d: "right", f: "fire", ",": "strafel", ".": "strafer",
  "\x1b[1;2A": "run", "\x1b[1;5A": "fire",
};

const paint = (rows) => {
  const tail = [
    "\x1b[0m\x1b[K" + stat,
    ...actions.slice(-3).map(a => "\x1b[K\x1b[38;2;215;119;87m⏺\x1b[0m " + a),
  ];
  out.write("\x1b[H" + (rows ? rows.join("\n") + "\n" : "") + tail.join("\n"));
};
const connect = () => {
  sock = net.connect(SOCK);
  sock.on("connect", () => { size(); actions.push("connected to MCP server"); paint(); });
  sock.on("error", () => {});
  sock.on("close", () => { actions.push("MCP server gone, retrying…"); paint(); setTimeout(connect, 1000); });
  sock.on("data", onData);
};
const size = () => sock?.writable && sock.write(`s ${out.columns || 80} ${(out.rows || 24) - STATUS_ROWS}\n`);
out.on("resize", size);

let grabbing = 0, rows = [];
function onData(chunk) {
  acc += chunk.toString();
  let nl;
  while ((nl = acc.indexOf("\n")) >= 0) {
    const line = acc.slice(0, nl); acc = acc.slice(nl + 1);
    if (line.startsWith("T ")) { actions.push(line.slice(2)); actions.splice(0, actions.length - 8); paint(); continue; }
    if (grabbing) { rows.push(line); if (--grabbing === 0) paint(rows); continue; }
    if (line.startsWith("F ")) { grabbing = +line.slice(2); rows = []; }
    else if (line.startsWith("A ")) { grabbing = 0; skip = +line.slice(2); }
    else if (skip > 0) skip--;
    else if (line.startsWith("S ")) stat = line.slice(2).replace(/ (x|y|tics|angle|sector)=\S+/g, "");
    else if (line.startsWith("E ")) { actions.push("event: " + line.slice(2)); paint(); }
    else if (line.startsWith("L ")) { actions.push("doom: " + line.slice(2)); paint(); }
  }
}
var skip = 0;
process.stdin.setRawMode?.(true); process.stdin.resume();
process.stdin.on("data", b => {
  const s = b.toString();
  if (s === "`" || s === "\x03") return quit();
  if (s === "g") return sock?.writable && sock.write("c iddqd\n");
  if (s === "k") return sock?.writable && sock.write("c idkfa\n");
  const name = KEYS[s] ?? (s.length === 1 && s >= "0" && s <= "9" ? s : null);
  if (name && sock?.writable) sock.write(`k ${name}\n`);
});
out.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
connect(); paint();
function quit() { out.write("\x1b[?25h\x1b[?1049l"); process.exit(0); }
