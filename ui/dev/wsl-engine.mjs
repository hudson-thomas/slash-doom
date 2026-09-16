#!/usr/bin/env node
// Windows shim: runs engine/build/doom-term inside WSL with stdio passed straight through.
// Lets narrator/wrap.mjs (which expects a local executable) drive the engine on Windows:
//   ENGINE=node:ui/dev/wsl-engine.mjs node narrator/wrap.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const toWsl = (p) => p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, "/");

const bin = path.join(root, "engine", "build", "doom-term");
const wad = ["doom1.wad", "freedoom1.wad"].map((w) => path.join(root, "engine", "wads", w)).find(fs.existsSync);
if (!fs.existsSync(bin) || !wad) {
  process.stderr.write(`wsl-engine: engine not built. Run: wsl -e make -C ${toWsl(path.join(root, "engine"))}\n`);
  process.exit(1);
}
const extra = process.argv.length > 2 ? process.argv.slice(2) : ["-warp", "1", "-skill", "3"];
const child = spawn("wsl.exe", ["-e", toWsl(bin), "-iwad", toWsl(wad), ...extra], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
