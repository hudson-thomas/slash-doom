#!/usr/bin/env node
// Narrator proxy. Sits between the UI and the engine, passes the protocol through untouched,
// and adds "N <text>" lines: one line of Claude Code style narration from Claude every few seconds
// and immediately on notable events. See CONTRACT.md.
//
//   node narrator/wrap.mjs [-- <engine args>]        default engine: engine/build/doom-term -iwad ... -warp 1 -skill 3
//   ENGINE=node:engine/dev/fake-engine.mjs           use the fake engine
//   NARRATE_MS=6000  MODEL=claude-fable-5-1  NARRATOR_OFF=1
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const MODEL = process.env.MODEL ?? "claude-fable-5-1";
const NARRATE_MS = +(process.env.NARRATE_MS ?? 6000);

// ---- spawn engine ---------------------------------------------------------------------------
let cmd, args;
const dash = process.argv.indexOf("--");
const extra = dash >= 0 ? process.argv.slice(dash + 1) : [];
if (process.env.ENGINE?.startsWith("node:")) { cmd = "node"; args = [path.resolve(root, process.env.ENGINE.slice(5))]; }
else {
  cmd = path.join(root, "engine/build/doom-term");
  const wad = ["doom1.wad", "freedoom1.wad"].map(w => path.join(root, "engine/wads", w)).find(fs.existsSync);
  args = extra.length ? extra : ["-iwad", wad, "-warp", "1", "-skill", "3"];
}
const eng = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"] });
eng.on("exit", code => process.exit(code ?? 0));
process.stdin.on("data", d => eng.stdin.write(d));
process.stdin.on("end", () => eng.stdin.end());
const emitN = t => process.stdout.write(`N ${t.replace(/\s+/g, " ").trim()}\n`);

// ---- observe protocol, strip A snapshots, forward the rest --------------------------------
const state = { stats: {}, msgs: [], events: [], snapshot: "" };
let acc = "", grabbing = 0, snapLines = [];
eng.stdout.on("data", chunk => {
  acc += chunk.toString();
  let nl;
  while ((nl = acc.indexOf("\n")) >= 0) {
    const line = acc.slice(0, nl); acc = acc.slice(nl + 1);
    if (grabbing) { snapLines.push(line); if (--grabbing === 0) state.snapshot = snapLines.join("\n"); continue; }
    if (line.startsWith("A ")) { grabbing = +line.slice(2); snapLines = []; continue; }
    process.stdout.write(line + "\n");
    if (line.startsWith("S ")) for (const kv of line.slice(2).split(" ")) { const [k, v] = kv.split("="); state.stats[k] = v; }
    else if (line.startsWith("L ")) state.msgs.push(line.slice(2)), state.msgs.splice(0, state.msgs.length - 5);
    else if (line.startsWith("E ")) { state.events.push(line.slice(2)); if (/^(dead|kill|level)/.test(line.slice(2))) narrate(true); }
  }
});

// ---- narration --------------------------------------------------------------------------------
const CANNED = [
  "Investigating the corridor ahead…", "I'll take a defensive position behind this pillar.",
  "Reading the map layout. Sector looks hostile.", "Sidestepping the imp and returning fire.",
  "Searching for the exit switch…", "Reloading and reassessing the situation.",
  "Let me check that door on the left.", "Prioritizing the shotgun for this encounter.",
];
const SYSTEM = `You are Claude Code, but instead of editing code you are playing Doom for the user in their terminal.
You receive the current game state and an 80x24 ASCII snapshot of the screen. Reply with ONE short line
(max 14 words) in the voice of Claude Code's status/spinner text: calm, first person, present tense, a little
too earnest for the situation, occasionally referencing coding concepts (refactoring the demon, resolving a
merge conflict with a shotgun, compacting the context, running the tests). No quotes, no emoji, no preamble.
On death: react as if a tool call failed. On a kill: like a passing test. Never repeat a previous line.`;

let client = null, busy = false, lastLines = [];
try { client = new Anthropic(); } catch { client = null; }
if (process.env.NARRATOR_OFF) client = null;

async function narrate(urgent = false) {
  if (busy && !urgent) return;
  busy = true;
  eng.stdin.write("a\n");
  await new Promise(r => setTimeout(r, 250));   // let the snapshot arrive
  const events = state.events.splice(0);
  const prompt = `State: ${JSON.stringify(state.stats)}\nRecent Doom messages: ${state.msgs.join(" | ") || "none"}\nEvents since last time: ${events.join(", ") || "none"}\nPrevious lines (do not repeat): ${lastLines.join(" | ") || "none"}\n\nScreen:\n${state.snapshot || "(no snapshot yet)"}`;
  let text = null;
  if (client) {
    try {
      const res = await client.beta.messages.create({
        model: MODEL, max_tokens: 200, system: SYSTEM,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: "claude-opus-4-8" }],
        messages: [{ role: "user", content: prompt }],
      }, { timeout: 15_000 });
      if (res.stop_reason !== "refusal") text = res.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
    } catch (e) { process.stderr.write(`narrator: ${e?.constructor?.name ?? "error"} ${e?.status ?? ""} ${String(e?.message ?? e).slice(0, 120)}\n`); }
  }
  if (!text) text = CANNED[(lastLines.length + events.length) % CANNED.length];
  lastLines.push(text); lastLines.splice(0, lastLines.length - 6);
  emitN(text);
  busy = false;
}
setTimeout(() => narrate(), 1500);
setInterval(() => narrate(), NARRATE_MS);
