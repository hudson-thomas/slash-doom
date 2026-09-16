// Entry: wire engine <-> compositor <-> Ink. `--mock` uses engine/dev/fake-engine.mjs.
import "./env.js";
import React from "react";
import { render } from "ink";
import { PassThrough } from "node:stream";
import { App } from "./App.js";
import { Compositor } from "./compositor.js";
import { spawnEngine, type Engine } from "./engine.js";
import { mapKeys } from "./keys.js";
import { computeLayout } from "./layout.js";
import { createStore } from "./store.js";
import { RENDER_MODES } from "./theme.js";

const mock = process.argv.includes("--mock");
// --exit-after <ms>: quit automatically (for smoke tests)
const exitAfterIdx = process.argv.indexOf("--exit-after");
const exitAfter = exitAfterIdx > 0 ? +process.argv[exitAfterIdx + 1] : 0;
const out = process.stdout;

let layout = computeLayout(out.columns, out.rows);
const store = createStore(layout);
const comp = new Compositor(out, layout);

let engine: Engine;
try {
  engine = spawnEngine({ mock });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

comp.start();
engine.size(layout.frameCols, layout.frameRows);

engine.on("frame", (lines: string[]) => {
  store.frames++;
  comp.setFrame(lines);
});
engine.on("stats", (s) => (store.stats = s));
engine.on("log", (t: string) => store.pushLog(t));
engine.on("exit", () => quit());

// fps counter for the status line
let lastFrames = 0;
setInterval(() => {
  store.fps = store.frames - lastFrames;
  lastFrames = store.frames;
}, 1000).unref();

// Ink gets fake stdio; we own the real terminal.
const inkStdin = Object.assign(new PassThrough(), { isTTY: false, setRawMode() {}, ref() {}, unref() {} });
const ink = render(<App store={store} />, {
  stdout: comp.inkStdout as unknown as NodeJS.WriteStream,
  stdin: inkStdin as unknown as NodeJS.ReadStream,
  patchConsole: false,
  exitOnCtrlC: false,
});

// Keyboard -> engine
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (buf: Buffer) => {
    const s = buf.toString();
    if (s === "\x03" || s === "\x11") return quit(); // ctrl+c / ctrl+q
    if (s === "`") {
      store.mode = RENDER_MODES[(RENDER_MODES.indexOf(store.mode) + 1) % RENDER_MODES.length];
      engine.mode(store.mode);
      return;
    }
    const names = mapKeys(s);
    if (names) for (const n of names) engine.key(n);
  });
}

out.on("resize", () => {
  layout = computeLayout(out.columns, out.rows);
  store.layout = layout;
  comp.setLayout(layout);
  engine.size(layout.frameCols, layout.frameRows);
});

let quitting = false;
function quit() {
  if (quitting) return;
  quitting = true;
  try { engine.quit(); } catch {}
  try { ink.unmount(); } catch {}
  comp.stop();
  setTimeout(() => process.exit(0), 50);
}
if (exitAfter > 0) setTimeout(quit, exitAfter);
process.on("SIGINT", quit);
process.on("SIGTERM", quit);
process.on("uncaughtException", (e) => {
  comp.stop();
  console.error(e);
  process.exit(1);
});
