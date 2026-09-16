#!/usr/bin/env node
// MCP server: lets Claude Code play Doom through the engine protocol (see ../CONTRACT.md).
// Tools: doom_start, doom_look, doom_press, doom_type, doom_stop. stdio transport.
// Nothing here touches engine/ or ui/; it only spawns engine/build/doom-term (or the fake engine).
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const SNAP_COLS = 80, SNAP_ROWS = 24;

// ---------------------------------------------------------------- spectator socket --------
// `node mcp/watch.mjs` connects here and receives every protocol line plus "T <text>" action lines.
const SOCK = process.env.DOOM_SOCK ?? path.join(os.tmpdir(), "fablenight-doom.sock");
let watcher = null, watcherSize = null;
try { fs.unlinkSync(SOCK); } catch {}
net.createServer(sock => {
  watcher = sock;
  sock.on("data", d => {                      // watcher sends "s <cols> <rows>" lines
    for (const l of d.toString().split("\n")) if (l.startsWith("s ")) { watcherSize = l; applyWatcherView(); }
  });
  sock.on("close", () => { if (watcher === sock) { watcher = null; watcherSize = null; applyWatcherView(); } });
  sock.on("error", () => {});
  toWatcher(`T spectator connected`);
}).listen(SOCK);
const toWatcher = line => { if (watcher) { try { watcher.write(line + "\n"); } catch {} } };
function applyWatcherView() {
  if (!eng) return;
  if (watcher && watcherSize) { send(watcherSize); send("m blocks"); send("f 20"); }
  else { send(`s ${SNAP_COLS} ${SNAP_ROWS}`); send("m mono"); send("f 5"); }
}

// ---------------------------------------------------------------- engine process ----------
let eng = null;
const st = { stats: {}, msgs: [], events: [], snapshot: null, snapWaiters: [] };

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

const KEY = z.enum(["up", "down", "left", "right", "fire", "use", "run", "strafel", "strafer", "enter", "esc", "tab", "1", "2", "3", "4", "5", "6", "7"]);

// ---------------------------------------------------------------- MCP surface -------------
const server = new McpServer({ name: "doom", version: "0.1.0" }, {
  instructions: `You can play Doom. Loop: doom_look -> decide -> doom_press -> doom_look. Movement keys are held for
hold_ms (default 400ms; a 90° turn is about 700ms of left/right; a corridor step is 300-600ms of up). Fire with "fire"
(hold_ms 150 per shot). Open doors and hit switches with "use" while facing them. Read the ASCII screen: walls are
mid-tone textures, the sky is dark, enemies are small bright/dark blobs that move between looks, the bottom 3 rows are
the HUD. Narrate briefly what you see and intend, in your normal voice.`,
});

server.registerTool("doom_start", {
  title: "Start Doom",
  description: "Start (or restart) a Doom game and return the first look. map 1-9 is E1Mx. skill 1 (easy) to 5 (nightmare).",
  inputSchema: { map: z.number().int().min(1).max(9).default(1), skill: z.number().int().min(1).max(5).default(2), mock: z.boolean().default(false).describe("use the Doom-free test pattern engine") },
}, async ({ map, skill, mock }) => {
  const fake = startEngine({ mock, skill, map });
  await sleep(fake ? 500 : 2500);
  return { content: [{ type: "text", text: (fake ? "(fake engine: real engine not built)\n" : "") + await look() }] };
});

server.registerTool("doom_look", {
  title: "Look at the screen",
  description: "Return the current 80x24 ASCII view of Doom plus health, ammo, kills, position and recent events.",
  inputSchema: {},
}, async () => { toWatcher("T look"); return { content: [{ type: "text", text: await look() }] }; });

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
  const end = Date.now() + hold_ms;
  while (Date.now() < end) { for (const k of keys) send(`k ${k}`); await sleep(60); }   // engine auto-releases 180ms after last repeat
  await sleep(300);
  return { content: [{ type: "text", text: await look() }] };
});

server.registerTool("doom_type", {
  title: "Type text into Doom",
  description: "Type a string as keypresses (cheats: iddqd god mode, idkfa all weapons and keys, idclip walk through walls, idclev15 warp to E1M5).",
  inputSchema: { text: z.string().min(1).max(20) },
}, async ({ text }) => { toWatcher(`T type ${text}`); send(`c ${text}`); await sleep(400); return { content: [{ type: "text", text: await look() }] }; });

server.registerTool("doom_stop", { title: "Stop Doom", description: "Quit the game.", inputSchema: {} },
  async () => { toWatcher("T doom_stop"); stopEngine(); return { content: [{ type: "text", text: "Doom stopped." }] }; });

server.registerPrompt("play", { title: "Play Doom", description: "Have Claude play a level of Doom and narrate it." },
  () => ({ messages: [{ role: "user", content: { type: "text", text: "Play Doom: call doom_start, then loop doom_look / doom_press to explore E1M1, kill what you meet, and find the exit. Narrate briefly in Claude Code voice as you go. Stop after about 25 moves or when you reach the exit." } }] }));

process.on("exit", () => { try { fs.unlinkSync(SOCK); } catch {} });
process.on("SIGINT", () => { stopEngine(); process.exit(0); });
process.on("SIGTERM", () => { stopEngine(); process.exit(0); });
await server.connect(new StdioServerTransport());
