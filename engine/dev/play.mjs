#!/usr/bin/env node
// Standalone player: runs the engine and paints frames straight to this terminal.
// Usage: [MODE=ascii|mono] node engine/dev/play.mjs [extra doom args]   backtick cycles render modes
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, "..");
const bin = path.join(engineDir, "build", "doom-term");
const wad = ["doom1.wad", "freedoom1.wad"].map(w => path.join(engineDir, "wads", w)).find(fs.existsSync);
if (!fs.existsSync(bin) || !wad) { console.error("run: make -C engine"); process.exit(1); }

const MODES = ["blocks", "ascii", "mono"];
let modeIdx = Math.max(0, MODES.indexOf(process.env.MODE ?? "blocks"));
const extra = process.argv.length > 2 ? process.argv.slice(2) : ["-warp", "1", "-skill", "3"];
const child = spawn(bin, ["-iwad", wad, ...extra], { stdio: ["pipe", "pipe", "ignore"] });
const send = s => child.stdin.write(s + "\n");

const STATUS_ROWS = 2;
const size = () => send(`s ${process.stdout.columns} ${process.stdout.rows - STATUS_ROWS}`);
process.stdout.on("resize", size);

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[H");
size();
send(`m ${MODES[modeIdx]}`);

const KEYS = {
  "\x1b[A": "up", "\x1b[B": "down", "\x1b[D": "left", "\x1b[C": "right",
  " ": "use", "\r": "enter", "\x1b": "esc", "\t": "tab", "\x7f": "backspace",
  w: "up", s: "down", a: "left", d: "right", f: "fire", ",": "strafel", ".": "strafer",
  "\x1b[1;2A": "run", "\x1b[1;2B": "run",
};
process.stdin.on("data", buf => {
  const s = buf.toString();
  if (s === "\x03") { send("q"); quit(); }
  if (s === "`") { modeIdx = (modeIdx + 1) % MODES.length; log = `mode: ${MODES[modeIdx]}`; return send(`m ${MODES[modeIdx]}`); }
  if (s === "\x1b[1;5A" || s === "\x1b[1;5B") return send("fire"), send("k up");
  const name = KEYS[s] ?? (s.length === 1 ? s : null);
  if (name) send(`k ${name}`);
});

let stat = "", log = "engine starting";
let acc = "";
child.stdout.on("data", chunk => {
  acc += chunk.toString();
  for (;;) {
    const nl = acc.indexOf("\n");
    if (nl < 0) break;
    const line = acc.slice(0, nl);
    if (line.startsWith("F ")) {
      const rows = +line.slice(2);
      const parts = acc.split("\n");
      if (parts.length < rows + 2) break;              // wait for full frame
      const body = parts.slice(1, rows + 1);
      acc = parts.slice(rows + 1).join("\n");
      process.stdout.write("\x1b[H" + body.join("\n") + "\n\x1b[0m\x1b[K" + stat + "\n\x1b[K" + log);
      continue;
    }
    acc = acc.slice(nl + 1);
    if (line.startsWith("S ")) stat = line.slice(2);
    else if (line.startsWith("L ")) log = line.slice(2);
  }
});

function quit() { process.stdout.write("\x1b[?25h\x1b[?1049l"); process.exit(0); }
child.on("exit", quit);
