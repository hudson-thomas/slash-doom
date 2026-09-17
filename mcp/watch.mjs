#!/usr/bin/env node
// Spectator AND co-op controller for the Doom MCP server: shows the game Claude Code is playing, full colour,
// with Claude's actions underneath. Your keys drive the same marine (arrows/WASD move, f fire, space use).
// Several people can run this at once. Run in a second terminal:  node mcp/watch.mjs   (ctrl-c or ` quits)
//
// Render modes: on terminals with an inline-image protocol (WezTerm, iTerm2, Kitty, Ghostty) it draws the real
// 320x200 framebuffer as an image, which is far sharper than half-blocks on macOS. `m` cycles, --mode= forces.
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { encodePng, resampleRgb } from "./png.mjs";

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

// ---------------------------------------------------------------- render mode ---------------
// "iterm"/"kitty" draw the engine's raw pixel frames ("p" -> "P w h" + base64 RGB) as a real image.
// "blocks" is the original path: ANSI half-block rows the engine renders at terminal-cell resolution.
const detect = () => {
  const prog = process.env.TERM_PROGRAM ?? "", term = process.env.TERM ?? "";
  if (process.env.KITTY_WINDOW_ID || /kitty|ghostty/i.test(term) || /ghostty/i.test(prog)) return "kitty";
  if (/wezterm/i.test(prog) || /iterm/i.test(prog) || /iterm/i.test(process.env.LC_TERMINAL ?? "")) return "iterm";
  return "blocks";
};
const MODES = ["auto", "iterm", "kitty", "blocks"];
const forced = (process.argv.find(a => a.startsWith("--mode")) ?? "").split("=")[1];
if (forced && !MODES.includes(forced)) {
  process.stderr.write(`watch.mjs: unknown --mode=${forced}; expected one of ${MODES.join(", ")}\n`);
  process.exit(2);
}
const imageMode = detect();
let mode = forced && forced !== "auto" ? forced : imageMode;
const isImage = () => mode === "iterm" || mode === "kitty";

// A 4:3 image in a cols x rows cell box, assuming terminal cells are about 1:2 (w:h).
const fit = (cols, rows) => {
  let r = rows, c = Math.round(rows * 8 / 3);
  if (c > cols) { c = cols; r = Math.max(1, Math.round(cols * 3 / 8)); }
  return { c, r, pad: Math.max(0, (cols - c) >> 1) };
};
const itermImage = (png, c, r) =>
  `\x1b]1337;File=inline=1;width=${c};height=${r};preserveAspectRatio=1;doNotMoveCursor=1;size=${png.length}:` +
  png.toString("base64") + "\x07";
const kittyImage = (png, c, r) => {
  const b64 = png.toString("base64");
  let s = "\x1b_Ga=d,d=I,i=1,q=2\x1b\\";                      // drop last frame's placement
  for (let i = 0; i < b64.length; i += 4096) {
    const more = i + 4096 < b64.length ? 1 : 0, part = b64.slice(i, i + 4096);
    s += i === 0 ? `\x1b_Ga=T,f=100,i=1,c=${c},r=${r},q=2,m=${more};${part}\x1b\\`
                 : `\x1b_Gm=${more},q=2;${part}\x1b\\`;
  }
  return s;
};

// ---------------------------------------------------------------- painting ------------------
let image = null, imageRows = 0, textRows = [];
const paint = (rows) => {
  if (rows) textRows = rows;
  const box = (out.rows || 24) - STATUS_ROWS;
  const tail = [
    "\x1b[0m\x1b[K" + stat,
    ...actions.slice(-3).map(a => "\x1b[K\x1b[38;2;215;119;87m⏺\x1b[0m " + a),
  ];
  if (isImage()) {
    out.write("\x1b[H" + (image ?? "") + `\x1b[${Math.max(imageRows, box) + 1};1H` + tail.join("\n"));
    return;
  }
  out.write("\x1b[H" + (textRows.length ? textRows.join("\n") + "\n" : "") + tail.join("\n"));
};
const onPixels = (rgb, w, h) => {
  pixPending = false;
  if (!isImage()) return;
  const { c, r, pad } = fit(out.columns || 80, (out.rows || 24) - STATUS_ROWS);
  const h2 = Math.round(w * 3 / 4);                            // 320x200 -> 320x240, Doom's intended 4:3, so the
  let png;                                                     // terminal's own cell metrics get the aspect right
  try { png = encodePng(resampleRgb(rgb, w, h, w, h2), w, h2, 3); } catch { return; }  // level 3: ~37KB in ~2ms
  imageRows = r;
  image = (pad ? `\x1b[${pad + 1}G` : "") + (mode === "kitty" ? kittyImage(png, c, r) : itermImage(png, c, r));
  paint();
};

// ---------------------------------------------------------------- socket --------------------
let pixPending = false;
const askPixels = () => {
  if (!isImage() || pixPending || !sock?.writable) return;
  pixPending = true; sock.write("p\n");
  setTimeout(() => { pixPending = false; }, 1000).unref();     // engine idle or gone: allow a retry
};
const connect = () => {
  sock = net.connect(SOCK);
  sock.on("connect", () => { size(); actions.push("connected to MCP server"); paint(); askPixels(); });
  sock.on("error", () => {});
  sock.on("close", () => { actions.push("MCP server gone, retrying…"); paint(); setTimeout(connect, 1000); });
  sock.on("data", onData);
};
const size = () => sock?.writable && sock.write(`s ${out.columns || 80} ${(out.rows || 24) - STATUS_ROWS}\n`);
out.on("resize", () => { size(); out.write("\x1b[2J"); paint(); });
setInterval(askPixels, 50).unref();                            // image modes pull frames; blocks are pushed

let grabbing = 0, rows = [], pixHdr = null;
function onData(chunk) {
  acc += chunk.toString();
  let nl;
  while ((nl = acc.indexOf("\n")) >= 0) {
    const line = acc.slice(0, nl); acc = acc.slice(nl + 1);
    if (line.startsWith("T ")) { actions.push(line.slice(2)); actions.splice(0, actions.length - 8); paint(); continue; }
    // Image modes still receive the engine's half-block frames and drop them: the engine's render mode is shared
    // by every watcher, so we leave it on blocks rather than degrade someone else's terminal.
    if (grabbing) { rows.push(line); if (--grabbing === 0 && !isImage()) paint(rows); continue; }
    if (pixHdr) { const [w, h] = pixHdr; pixHdr = null; try { onPixels(Buffer.from(line, "base64"), w, h); } catch {} continue; }
    if (line.startsWith("P ")) { pixHdr = line.slice(2).split(" ").map(Number); }
    else if (line.startsWith("F ")) { grabbing = +line.slice(2); rows = []; }
    else if (line.startsWith("A ")) { grabbing = 0; skip = +line.slice(2); }
    else if (skip > 0) skip--;
    else if (line.startsWith("S ")) stat = line.slice(2).replace(/ (x|y|tics|angle|sector)=\S+/g, "");
    else if (line.startsWith("E ")) { actions.push("event: " + line.slice(2)); paint(); }
    else if (line.startsWith("L ")) { actions.push("doom: " + line.slice(2)); paint(); }
  }
}
var skip = 0;
const cycle = () => {
  const ring = imageMode === "blocks" ? ["blocks"] : [imageMode, "blocks"];
  mode = ring[(ring.indexOf(mode) + 1) % ring.length];
  actions.push(ring.length === 1
    ? `no inline-image protocol here (TERM_PROGRAM=${process.env.TERM_PROGRAM || "?"}); staying on blocks`
    : `render mode: ${mode}`);
  image = null; out.write("\x1b[2J"); paint(); askPixels();
};
process.stdin.setRawMode?.(true); process.stdin.resume();
process.stdin.on("data", b => {
  const s = b.toString();
  if (s === "`" || s === "\x03") return quit();
  if (s === "m") return cycle();
  if (s === "g") return sock?.writable && sock.write("c iddqd\n");
  if (s === "k") return sock?.writable && sock.write("c idkfa\n");
  const name = KEYS[s] ?? (s.length === 1 && s >= "0" && s <= "9" ? s : null);
  if (name && sock?.writable) sock.write(`k ${name}\n`);
});
// Restore the terminal even when killed: without this, `kill <pid>` leaves the alt screen up and the cursor
// hidden, and the shell prompt comes back inside it.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, quit);
out.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
if (isImage()) actions.push(`render mode: ${mode} (inline image, 320x200); press m for blocks`);
connect(); paint();
function quit() { out.write("\x1b[?25h\x1b[?1049l"); process.exit(0); }
