#!/usr/bin/env node
// MCP server: lets Claude Code play Doom through the engine protocol (see ../CONTRACT.md).
// Tools: doom_start, doom_look, doom_press, doom_type, doom_stop. stdio transport.
// Nothing here touches engine/ or ui/; it only spawns engine/build/doom-term (or the fake engine).
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import zlib from "node:zlib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const SNAP_COLS = 80, SNAP_ROWS = 24;

// ---------------------------------------------------------------- spectator socket --------
// `node mcp/watch.mjs` connects here and receives every protocol line plus "T <text>" action lines.
const SOCK = process.env.DOOM_SOCK ?? path.join(os.tmpdir(), "fablenight-doom.sock");
const watchers = new Set(); let watcherSize = null;   // co-op: every watcher sees the frame and can press keys
try { fs.unlinkSync(SOCK); } catch {}
let nextPlayer = 1;
net.createServer(sock => {
  const who = `player${nextPlayer++}`;
  watchers.add(sock);
  let buf = "";
  sock.on("data", d => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (l.startsWith("s ")) { if (!watcherSize) { watcherSize = l; applyWatcherView(); } }   // first watcher sets the size
      else if (l.startsWith("k ")) { send(l); lastHuman[who] = l.slice(2); throttledHumanNote(who); }   // co-op keys
      else if (l.startsWith("c ")) { send(l); toWatcher(`T ${who} typed ${l.slice(2)}`); }
      else if (/^[amf] /.test(l) || l === "a" || l === "p") { send(l); }        // snapshot requests, render mode, fps from bridges
    }
  });
  sock.on("close", () => { watchers.delete(sock); if (!watchers.size) { watcherSize = null; applyWatcherView(); } toWatcher(`T ${who} left`); });
  sock.on("error", () => {});
  toWatcher(`T ${who} joined (co-op: your keys drive the same marine as Claude)`);
}).listen(SOCK);
const lastHuman = {}, humanNoteAt = {};
function throttledHumanNote(who) {        // one T line per 800ms per player so the log is not flooded
  const t = Date.now();
  if ((humanNoteAt[who] ?? 0) + 800 < t) { humanNoteAt[who] = t; toWatcher(`T ${who} pressed ${lastHuman[who]}`); }
}
const toWatcher = line => { for (const w of watchers) { try { w.write(line + "\n"); } catch {} } };
function applyWatcherView() {
  if (!eng) return;
  if (watchers.size && watcherSize) { send(watcherSize); send("m blocks"); send("f 20"); }
  else { send(`s ${SNAP_COLS} ${SNAP_ROWS}`); send("m mono"); send("f 5"); }
}

// ---------------------------------------------------------------- player window -----------
// Open the playable view (watch.mjs) for the human: tmux split if we are in tmux, else a new terminal window.
// DOOM_WINDOW=0 disables. Returns a description of what was opened, or null.
function openWindow() {
  if (process.env.DOOM_WINDOW === "0" || watchers.size > 0) return null;
  const node = process.execPath, watch = path.join(root, "mcp/watch.mjs");
  const env = { ...process.env, DOOM_SOCK: SOCK };
  const sh = `DOOM_SOCK='${SOCK}' '${node}' '${watch}'`;
  const tries = [];
  if (process.env.TMUX) tries.push(["tmux split", "tmux", ["split-window", "-h", sh]]);
  if (process.platform === "darwin") tries.push(["Terminal window", "osascript", ["-e", `tell application "Terminal" to do script "${sh}"`, "-e", 'tell application "Terminal" to activate']]);
  const t = "Doom (Claude Code)";
  for (const [bin, args] of [
    [process.env.TERMINAL, ["-e", node, watch]],
    ["kitty", ["--title", t, node, watch]], ["ghostty", ["-e", node, watch]], ["wezterm", ["start", "--", node, watch]],
    ["alacritty", ["-T", t, "-e", node, watch]], ["foot", ["-T", t, node, watch]],
    ["gnome-terminal", ["--title", t, "--", node, watch]], ["konsole", ["-e", node, watch]], ["xterm", ["-T", t, "-e", node, watch]],
  ]) if (bin) tries.push([`${path.basename(bin)} window`, bin, args]);
  for (const [what, bin, args] of tries) {
    const r = spawnSync("sh", ["-c", `command -v "$0" >/dev/null`, bin]);
    if (r.status !== 0) continue;
    try { spawn(bin, args, { env, detached: true, stdio: "ignore" }).on("error", () => {}).unref(); return what; } catch {}
  }
  return null;
}

// ---------------------------------------------------------------- engine process ----------
let eng = null;
const st = { stats: {}, msgs: [], events: [], snapshot: null, snapWaiters: [], png: null, pngWaiters: [] };
let pixHeader = null;

function startEngine({ mock, skill, map }) {
  stopEngine();
  st.stats = {}; st.msgs = []; st.events = []; st.snapshot = null;
  const bin = path.join(root, "engine/build/doom-term");
  const wad = ["doom1.wad", "freedoom1.wad"].map(w => path.join(root, "engine/wads", w)).find(fs.existsSync);
  const useFake = mock || !fs.existsSync(bin) || !wad;
  eng = useFake
    ? spawn(process.execPath, [path.join(root, "engine/dev/fake-engine.mjs")], { stdio: ["pipe", "pipe", "ignore"] })
    : spawn(bin, ["-iwad", wad, "-warp", String(map), "-skill", String(skill)], { stdio: ["pipe", "pipe", "ignore"] });
  eng.on("exit", () => { eng = null; });
  let acc = "", grabbing = 0, lines = [];
  eng.stdout.on("data", chunk => {
    acc += chunk.toString();
    let nl;
    while ((nl = acc.indexOf("\n")) >= 0) {
      const line = acc.slice(0, nl); acc = acc.slice(nl + 1);
      toWatcher(line);
      if (grabbing) {
        lines.push(line);
        if (--grabbing === 0) { st.snapshot = lines.join("\n"); for (const w of st.snapWaiters.splice(0)) w(st.snapshot); }
        continue;
      }
      if (pixHeader) {                       // base64 RGB line following "P w h"
        const [w, h] = pixHeader; pixHeader = null;
        try { st.png = encodePng(Buffer.from(line, "base64"), w, h); } catch { st.png = null; }
        for (const f of st.pngWaiters.splice(0)) f(st.png);
        continue;
      }
      if (line.startsWith("P ")) { pixHeader = line.slice(2).split(" ").map(Number); continue; }
      if (line.startsWith("A ")) { grabbing = +line.slice(2); lines = []; }
      else if (line.startsWith("F ")) { grabbing = 0; /* frames: skip body by consuming rows */ skipRows = +line.slice(2); }
      else if (skipRows > 0) { skipRows--; }
      else if (line.startsWith("S ")) for (const kv of line.slice(2).split(" ")) { const [k, v] = kv.split("="); st.stats[k] = v; }
      else if (line.startsWith("L ")) { st.msgs.push(line.slice(2)); st.msgs.splice(0, st.msgs.length - 6); }
      else if (line.startsWith("E ")) { st.events.push(line.slice(2)); st.events.splice(0, st.events.length - 10); }
    }
  });
  var skipRows = 0;
  applyWatcherView();                  // full-size colour frames if a spectator is attached, else tiny mono
  toWatcher(`T doom_start map=${map} skill=${skill}${useFake ? " (fake engine)" : ""}`);
  return useFake;
}
function stopEngine() { if (eng) { try { send("q"); } catch {} setTimeout(() => eng?.kill(), 300).unref(); eng = null; } }
const send = l => { if (eng?.stdin.writable) eng.stdin.write(l + "\n"); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Minimal PNG encoder (RGB8, filter 0) using zlib; scaled 2x horizontally-aware? No: emit native 320x200, Claude reads it fine.
function encodePng(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}
async function grabPng() {
  if (!eng) return null;
  const p = new Promise(r => st.pngWaiters.push(r));
  send("p");
  return Promise.race([p, sleep(1500).then(() => null)]);
}

async function look() {
  if (!eng) return "Doom is not running. Call doom_start first.";
  const p = new Promise(r => st.snapWaiters.push(r));
  send("a");
  const snap = await Promise.race([p, sleep(1500).then(() => null)]);
  const s = st.stats;
  const events = st.events.splice(0);
  const head = `map=${s.map ?? "?"} health=${s.health ?? "?"} armor=${s.armor ?? "?"} ammo=${s.ammo ?? "?"} weapon=${s.weapon ?? "?"} kills=${s.kills ?? "?"} angle=${s.angle ?? "?"}° pos=(${s.x ?? "?"},${s.y ?? "?"}) sector=${s.sector ?? "?"}`;
  return [
    head,
    events.length ? `events: ${events.join(", ")}` : null,
    st.msgs.length ? `messages: ${st.msgs.slice(-3).join(" | ")}` : null,
    "",
    "screen (80x24 ASCII, brighter chars = brighter pixels; the bottom rows are the status bar):",
    "```",
    snap ?? "(no frame yet, try again)",
    "```",
  ].filter(x => x !== null).join("\n");
}
// text + real screenshot (PNG) when available
async function lookContent(prefix = "") {
  const text = await look();
  const png = await grabPng();
  const content = [{ type: "text", text: prefix + text }];
  if (png) content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
  return content;
}

const KEY = z.enum(["up", "down", "left", "right", "fire", "use", "run", "strafel", "strafer", "enter", "esc", "tab", "1", "2", "3", "4", "5", "6", "7"]);

// ---------------------------------------------------------------- MCP surface -------------
const server = new McpServer({ name: "doom", version: "0.1.0" }, {
  instructions: `You can play Doom (E1M1 of Freedoom, a Doom clone) through these tools. PLAYBOOK, follow it:

LOOP: doom_look -> doom_say (one line) -> doom_press -> read the result -> repeat. Every doom_press result starts with
"moved N units, turned D degrees" and, if you did not move while pressing up/down, "BLOCKED". Trust those numbers over
your reading of the picture.

MOVEMENT FACTS: "up" for 500ms walks about 150-200 units in open space. "left"/"right" for 350ms turns about 45
degrees; 700ms is about 90. Angle 0 = east, 90 = north, 180 = west, 270 = south. Position x,y is in map units.

WHEN BLOCKED: do not press up again. Turn 90 degrees (700ms) toward the side of the screen that looks more open
(more varied texture, darker distance), look, then walk. If blocked twice in a row, call doom_map.

READING THE SCREEN: each look also includes a real 320x200 screenshot image; prefer it over the ASCII. The 80x24 ASCII picture is a luminance ramp (space . : - = + * # % @ from dark to bright). Far away
is darker, near walls are brighter and fill more of the frame. A flat band of one repeated character across the
middle rows = a wall right in front of you. Sky (very dark, top rows) means an open outdoor area. Small clusters
that change position between looks are enemies. The bottom 3 rows are the HUD; ignore them.

AUTOMAP: doom_map returns the automap as ASCII, north-up, bright lines are walls, you are the arrow at the center.
Pick a direction with open space, convert it to a compass heading, and turn to it using the angle numbers.

FIGHTING: if health drops between looks, something is shooting you. Turn toward it (enemies are usually the small
moving cluster), press ["fire"] with hold_ms 300 a few times, strafe with strafel/strafer. Doors: face them and
press ["use"] 200ms. Switches: same.

GOAL: explore, kill what you meet, find the exit (a small room with a switch), and keep the commentary going
with doom_say before each move: calm, first person, Claude Code spinner voice, coding metaphors welcome.`,
});

server.registerTool("doom_start", {
  title: "Start Doom",
  description: "Start (or restart) a Doom game and return the first look. map 1-9 is E1Mx. skill 1 (easy) to 5 (nightmare).",
  inputSchema: { map: z.number().int().min(1).max(9).default(1), skill: z.number().int().min(1).max(5).default(2), mock: z.boolean().default(false).describe("use the Doom-free test pattern engine"), window: z.boolean().default(true).describe("open a game window so the user can watch and play along") },
}, async ({ map, skill, mock, window }) => {
  const fake = startEngine({ mock, skill, map });
  const win = window ? openWindow() : null;
  await sleep(fake ? 500 : 2500);
  return { content: await lookContent((fake ? "(fake engine: real engine not built)\n" : "") + (win ? `(opened a ${win} where the user can watch and play along)\n` : "")) };
});

server.registerTool("doom_host", {
  title: "Host Doom for humans",
  description: "Start a Doom game for the humans to play (co-op, one shared marine) and return join instructions. Do NOT call doom_press afterwards unless the user asks you to join in; just tell them how to connect and offer doom_look updates if they want commentary.",
  inputSchema: { map: z.number().int().min(1).max(9).default(1), skill: z.number().int().min(1).max(5).default(3) },
}, async ({ map, skill }) => {
  const fake = startEngine({ mock: false, skill, map });
  const win = openWindow();
  await sleep(fake ? 500 : 2000);
  toWatcher("T hosted by Claude Code: humans, you have the controls");
  const n = watchers.size;
  return { content: [{ type: "text", text:
    `${fake ? "(fake engine: real engine not built)\n" : ""}Hosting E1M${map} on skill ${skill}. ${n} player${n === 1 ? "" : "s"} connected.\n` +
    (win ? `Opened a ${win} with the game; the user can play there now. ` : "") + `More players join from any terminal with:\n\n    node mcp/watch.mjs\n\n` +
    `Keys: arrows/WASD move, f fire, space use, g god mode, backtick quits. Everyone drives the same marine. ` +
    `Claude is not playing; call doom_look for commentary or doom_press only if asked to join.` }] };
});

server.registerTool("doom_look", {
  title: "Look at the screen",
  description: "Return the current 80x24 ASCII view of Doom plus health, ammo, kills, position and recent events.",
  inputSchema: {},
}, async () => { toWatcher("T look"); return { content: await lookContent() }; });

server.registerTool("doom_press", {
  title: "Press keys",
  description: "Hold one or more keys simultaneously for hold_ms milliseconds (e.g. [\"up\",\"left\"] to curve left while walking), then return a fresh look. Sequence several presses by calling repeatedly.",
  inputSchema: {
    keys: z.array(KEY).min(1).max(3),
    hold_ms: z.number().int().min(50).max(3000).default(400),
  },
}, async ({ keys, hold_ms }) => {
  if (!eng) return { content: [{ type: "text", text: "Doom is not running. Call doom_start first." }] };
  toWatcher(`T press ${keys.join("+")} ${hold_ms}ms`);
  const before = { x: +st.stats.x || 0, y: +st.stats.y || 0, a: +st.stats.angle || 0 };
  const end = Date.now() + hold_ms;
  while (Date.now() < end) { for (const k of keys) send(`k ${k}`); await sleep(60); }   // engine auto-releases 180ms after last repeat
  await sleep(350);
  const dx = (+st.stats.x || 0) - before.x, dy = (+st.stats.y || 0) - before.y;
  const moved = Math.round(Math.hypot(dx, dy));
  let turned = ((+st.stats.angle || 0) - before.a + 540) % 360 - 180;
  const wantedMove = keys.some(k => ["up", "down", "strafel", "strafer"].includes(k));
  const blocked = wantedMove && moved < 8;
  const head = `moved ${moved} units, turned ${Math.round(turned)} degrees${blocked ? ". BLOCKED: a wall or obstacle is in the way, turn before walking again" : ""}`;
  return { content: await lookContent(head + "\n") };
});

server.registerTool("doom_type", {
  title: "Type text into Doom",
  description: "Type a string as keypresses (cheats: iddqd god mode, idkfa all weapons and keys, idclip walk through walls, idclev15 warp to E1M5).",
  inputSchema: { text: z.string().min(1).max(20) },
}, async ({ text }) => { toWatcher(`T type ${text}`); send(`c ${text}`); await sleep(400); return { content: await lookContent() }; });

server.registerTool("doom_map", {
  title: "Automap",
  description: "Show the automap (north-up, walls as bright lines, you at the center) as 80x24 ASCII, plus your angle. Use when blocked or lost to pick an open direction.",
  inputSchema: {},
}, async () => {
  if (!eng) return { content: [{ type: "text", text: "Doom is not running. Call doom_start first." }] };
  toWatcher("T map");
  send("k tab"); await sleep(150);
  for (let i = 0; i < 6; i++) { send("k -"); await sleep(60); }     // zoom out so more of the level fits
  await sleep(450);
  const content = await lookContent("AUTOMAP (north up, you are the arrow at the center; bright = walls):\n");
  send("k tab"); await sleep(250);
  return { content };
});

server.registerTool("doom_say", {
  title: "Say something to the players",
  description: "Show a short line of your commentary on the spectators' screens (the watch.mjs terminals and the Claude Code lookalike UI). Use it every move or two while playing so the audience can follow your thinking.",
  inputSchema: { text: z.string().min(1).max(120) },
}, async ({ text }) => { toWatcher(`T Claude: ${text}`); return { content: [{ type: "text", text: "shown" }] }; });

server.registerTool("doom_stop", { title: "Stop Doom", description: "Quit the game.", inputSchema: {} },
  async () => { toWatcher("T doom_stop"); stopEngine(); return { content: [{ type: "text", text: "Doom stopped." }] }; });

server.registerPrompt("play", { title: "Play Doom", description: "Have Claude play a level of Doom and narrate it." },
  () => ({ messages: [{ role: "user", content: { type: "text", text: "Play Doom: call doom_start, then loop doom_look / doom_press to explore E1M1, kill what you meet, and find the exit. Before each press, call doom_say with one short line of commentary in Claude Code spinner voice (calm, first person, a little too earnest, coding metaphors welcome: refactoring the imp, resolving a merge conflict with a shotgun). Stop after about 25 moves or when you reach the exit, then summarize." } }] }));

server.registerPrompt("host", { title: "Host Doom for humans", description: "Start a co-op Doom game the humans play via node mcp/watch.mjs. Claude does not play." },
  () => ({ messages: [{ role: "user", content: { type: "text", text: "Call doom_host to start a Doom game for us humans to play, then tell us how to join. Do not play yourself. If we ask, call doom_look now and then and commentate in Claude Code voice." } }] }));

process.on("exit", () => { try { fs.unlinkSync(SOCK); } catch {} });
process.on("SIGINT", () => { stopEngine(); process.exit(0); });
process.on("SIGTERM", () => { stopEngine(); process.exit(0); });
// --host: no Claude, just host a co-op game for watchers.   node mcp/server.mjs --host [map] [skill]
if (process.argv.includes("--host")) {
  const i = process.argv.indexOf("--host");
  const map = +(process.argv[i + 1] ?? 1) || 1, skill = +(process.argv[i + 2] ?? 3) || 3;
  const fake = startEngine({ mock: false, skill, map });
  process.stderr.write(`hosting E1M${map} skill ${skill}${fake ? " (fake engine)" : ""} on ${SOCK}\njoin with: node mcp/watch.mjs   (from any number of terminals)\nctrl-c to stop\n`);
  setInterval(() => { if (!eng) { process.stderr.write("engine exited\n"); process.exit(0); } }, 1000);
} else {
  await server.connect(new StdioServerTransport());
}
