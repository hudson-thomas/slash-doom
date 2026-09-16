#!/usr/bin/env node
// Stand-in for build/doom-term that speaks the same protocol (see CONTRACT.md) without Doom.
// Emits a moving colour test pattern plus S/L lines, honours s/m/f/k/c/q. Use for UI dev:
//   spawn("node", ["engine/dev/fake-engine.mjs"])   instead of   spawn("engine/build/doom-term", [...])
import readline from "node:readline";

let cols = 0, rows = 0, mode = "blocks", fps = 20, tics = 0, kills = 0, ammo = 50, health = 100;
let lastKey = "", msg = "", pending = [];
const RAMP = " .:-=+*#%@";

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", l => {
  const [c, ...a] = l.trim().split(" ");
  if (c === "s") { cols = +a[0] | 0; rows = +a[1] | 0; }
  else if (c === "m") mode = a[0];
  else if (c === "f") fps = Math.max(1, Math.min(35, +a[0] | 0));
  else if (c === "k") { lastKey = a[0]; if (a[0] === "fire" && ammo > 0) { ammo--; if (Math.random() < 0.3) { kills++; pending.push("L Killed an imp."); } } }
  else if (c === "c") pending.push(a[0] === "iddqd" ? "L Degreelessness Mode On" : `L typed ${a[0]}`);
  else if (c === "q") process.exit(0);
});
rl.on("close", () => process.exit(0));

const px = (x, y, t) => {            // test pattern: sky, floor, sweeping "wall"
  const horizon = 0.55, wall = 0.5 + 0.3 * Math.sin(t / 20 + x * 6);
  if (y < horizon - wall / 3) return [40, 60, 120];                       // sky
  if (y < horizon) { const s = 120 + 100 * Math.sin(x * 12 + t / 7); return [s, s * 0.6, s * 0.4]; } // wall
  const f = 60 + 60 * ((Math.floor(x * 16 + t / 3) + Math.floor(y * 24)) % 2); return [f, f, f * 0.8];
};

function frame() {
  if (!cols || !rows) return;
  tics += Math.round(35 / fps);
  const out = [`F ${rows}`];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const x = c / cols, y0 = (2 * r) / (2 * rows), y1 = (2 * r + 1) / (2 * rows);
      const [tr, tg, tb] = px(x, y0, tics), [br, bg, bb] = px(x, y1, tics);
      if (mode === "blocks") line += `\x1b[38;2;${tr | 0};${tg | 0};${tb | 0}m\x1b[48;2;${br | 0};${bg | 0};${bb | 0}m▀`;
      else {
        const lum = (0.3 * tr + 0.59 * tg + 0.11 * tb) / 255, ch = RAMP[Math.min(9, Math.floor(Math.pow(lum, 0.55) * 9.99))];
        line += mode === "mono" ? ch : `\x1b[38;2;${tr | 0};${tg | 0};${tb | 0}m${ch}`;
      }
    }
    out.push(line + (mode === "mono" ? "" : "\x1b[0m"));
  }
  out.push(`S health=${health} armor=0 ammo=${ammo} kills=${kills} items=0 secrets=0 map=E1M1 tics=${tics} weapon=pistol x=${(tics * 3) % 1000} y=256 angle=${tics % 360} sector=${100 + (tics >> 6) % 20}`);
  if (tics % 140 < 3) pending.push(`L Picked up a ${["shotgun.", "medikit.", "box of shells."][(tics >> 7) % 3]}`);
  while (pending.length) out.push(pending.shift());
  process.stdout.write(out.join("\n") + "\n");
}
process.stdout.write("L fake engine ready (no Doom)\n");
setInterval(() => frame(), 1000 / fps);
