// Spawns doom-term (or the fake engine) and speaks the CONTRACT.md line protocol.
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

export interface Stats {
  health: number;
  armor: number;
  ammo: number;
  kills: number;
  items: number;
  secrets: number;
  map: string;
  tics: number;
  weapon: string;
  x: number;
  y: number;
  angle: number;
  sector: number;
  [k: string]: string | number;
}
export const EMPTY_STATS: Stats = {
  health: 100, armor: 0, ammo: 50, kills: 0, items: 0, secrets: 0,
  map: "E1M1", tics: 0, weapon: "pistol", x: 0, y: 0, angle: 0, sector: 0,
};

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const toWsl = (p: string) =>
  p.replace(/^([A-Za-z]):[\\/]/, (_, d: string) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, "/");

export class Engine extends EventEmitter {
  private acc = "";
  private pendingRows = 0;
  private frameLines: string[] = [];

  constructor(private child: ChildProcess) {
    super();
    child.stdout!.on("data", (b: Buffer) => this.onData(b.toString("utf8")));
    child.on("exit", (code) => this.emit("exit", code));
    child.on("error", (e) => this.emit("log", `engine error: ${e.message}`));
  }

  send(line: string) {
    if (this.child.stdin?.writable) this.child.stdin.write(line + "\n");
  }
  size(cols: number, rows: number) { this.send(`s ${cols} ${rows}`); }
  key(name: string) { this.send(`k ${name}`); }
  mode(m: string) { this.send(`m ${m}`); }
  fps(n: number) { this.send(`f ${n}`); }
  cheat(t: string) { this.send(`c ${t}`); }
  quit() {
    this.send("q");
    setTimeout(() => this.child.kill(), 300).unref();
  }

  private onData(s: string) {
    this.acc += s;
    let pos = 0;
    for (;;) {
      const nl = this.acc.indexOf("\n", pos);
      if (nl < 0) break;
      let line = this.acc.slice(pos, nl);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      pos = nl + 1;
      if (this.pendingRows > 0) {
        this.frameLines.push(line);
        if (--this.pendingRows === 0) {
          this.emit("frame", this.frameLines);
          this.frameLines = [];
        }
      } else if (line.startsWith("F ")) {
        this.pendingRows = Math.max(0, +line.slice(2) | 0);
        this.frameLines = [];
      } else if (line.startsWith("S ")) {
        this.emit("stats", parseStats(line.slice(2)));
      } else if (line.startsWith("L ")) {
        this.emit("log", line.slice(2));
      }
    }
    this.acc = this.acc.slice(pos);
  }
}

function parseStats(s: string): Stats {
  const out: Stats = { ...EMPTY_STATS };
  for (const kv of s.split(/\s+/)) {
    const eq = kv.indexOf("=");
    if (eq < 0) continue;
    const k = kv.slice(0, eq);
    const v = kv.slice(eq + 1);
    out[k] = /^-?\d+$/.test(v) ? +v : v;
  }
  return out;
}

export function spawnEngine({ mock }: { mock: boolean }): Engine {
  const engineDir = path.join(REPO_ROOT, "engine");
  if (mock) {
    const fake = path.join(engineDir, "dev", "fake-engine.mjs");
    return new Engine(spawn(process.execPath, [fake], { stdio: ["pipe", "pipe", "ignore"] }));
  }
  const bin = path.join(engineDir, "build", "doom-term");
  const wad = ["doom1.wad", "freedoom1.wad"].map((w) => path.join(engineDir, "wads", w)).find(fs.existsSync);
  if (!fs.existsSync(bin) || !wad) {
    throw new Error(
      `engine not built (missing ${bin} or WAD).\n` +
        `Run: make -C engine   (on Windows: wsl -e make -C ${toWsl(engineDir)})\n` +
        `Or run with --mock.`,
    );
  }
  const args = ["-iwad", wad, "-warp", "1", "-skill", "3"];
  const child =
    process.platform === "win32"
      ? spawn("wsl.exe", ["-e", toWsl(bin), ...args.map(toWsl)], { stdio: ["pipe", "pipe", "ignore"] })
      : spawn(bin, args, { stdio: ["pipe", "pipe", "ignore"] });
  return new Engine(child);
}
