// Owns the real stdout. Ink renders into a fake stdout; we capture that text and
// write chrome + Doom frame to absolute screen positions in a single write.
import { PassThrough } from "node:stream";
import type { Layout } from "./layout.js";

// Ink prefixes each render with erase-lines / clear sequences; we position absolutely instead.
const INK_PREFIX = /^(?:\x1b\[2K|\x1b\[1A|\x1b\[G|\x1b\[2J|\x1b\[3J|\x1b\[H)+/;

export type InkStdout = PassThrough & { columns: number; rows: number; isTTY: boolean };

export class Compositor {
  readonly inkStdout: InkStdout;
  private chrome: string[] = [];
  private frame: string[] = [];
  private blocked = false;
  private dirty = false;
  private started = false;
  frames = 0;

  constructor(private out: NodeJS.WriteStream, private layout: Layout) {
    const s = new PassThrough() as InkStdout;
    s.columns = layout.cols;
    s.rows = layout.rows;
    s.isTTY = true;
    s.on("data", (b: Buffer) => this.onInk(b.toString("utf8")));
    this.inkStdout = s;
  }

  start() {
    this.started = true;
    this.out.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
  }
  stop() {
    this.started = false;
    this.out.write("\x1b[0m\x1b[?25h\x1b[?1049l");
  }

  setLayout(l: Layout) {
    this.layout = l;
    this.inkStdout.columns = l.cols;
    this.inkStdout.rows = l.rows;
    this.inkStdout.emit("resize");
    this.frame = [];
    this.write("\x1b[2J");
    this.paintAll();
  }

  setFrame(lines: string[]) {
    this.frame = lines;
    this.frames++;
    this.write(this.frameStr());
  }

  private onInk(chunk: string) {
    const lines = chunk.replace(INK_PREFIX, "").replace(/\x1b\[\?2026[hl]/g, "").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    this.chrome = lines;
    this.paintAll();
  }

  private frameStr() {
    const { frameTop, frameLeft } = this.layout;
    let s = "";
    for (let i = 0; i < this.frame.length; i++) {
      s += `\x1b[${frameTop + 1 + i};${frameLeft + 1}H${this.frame[i]}`;
    }
    return s + "\x1b[0m";
  }

  private paintAll() {
    let s = "";
    for (let i = 0; i < this.chrome.length && i < this.layout.rows; i++) {
      s += `\x1b[${i + 1};1H${this.chrome[i]}\x1b[0m\x1b[K`;
    }
    this.write(s + this.frameStr());
  }

  private write(s: string) {
    if (!this.started) return;
    if (this.blocked) {
      this.dirty = true; // drop frames while the terminal catches up
      return;
    }
    if (!this.out.write(s)) {
      this.blocked = true;
      this.out.once("drain", () => {
        this.blocked = false;
        if (this.dirty) {
          this.dirty = false;
          this.paintAll();
        }
      });
    }
  }
}
