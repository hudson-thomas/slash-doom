// Mutable UI state fed by the engine; Ink reads it on an 8 Hz tick (see App.tsx).
import { EMPTY_STATS, type Stats } from "./engine.js";
import { computeLayout, type Layout } from "./layout.js";
import type { RenderMode } from "./theme.js";

export interface ToolCall {
  tool: string;
  arg: string;
  result: string;
}

export interface Store {
  stats: Stats;
  log: ToolCall[];
  layout: Layout;
  mode: RenderMode;
  startedAt: number;
  frames: number;
  fps: number;
  pushLog(text: string): void;
}

export function createStore(layout: Layout): Store {
  return {
    stats: EMPTY_STATS,
    log: [{ tool: "Bash", arg: "make -C engine && ./build/doom-term -iwad freedoom1.wad", result: "engine starting…" }],
    layout,
    mode: "blocks",
    startedAt: Date.now(),
    frames: 0,
    fps: 0,
    pushLog(text: string) {
      this.log.push(toolCallFor(text));
      if (this.log.length > 20) this.log.shift();
    },
  };
}

// Turn a Doom message into a plausible Claude Code tool call.
function toolCallFor(text: string): ToolCall {
  const t = text.replace(/\.$/, "");
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^picked up (?:a |an |the )?(.+)$/i))) return { tool: "Read", arg: m[1].replace(/\s+/g, "_"), result: text };
  if ((m = t.match(/^killed (?:a |an |the )?(.+)$/i))) return { tool: "Bash", arg: `kill -9 ${m[1].replace(/\s+/g, "_")}`, result: text };
  if (/found a secret/i.test(t)) return { tool: "Grep", arg: '"secret" --hidden', result: text };
  if (/^you (need|can't|cannot)/i.test(t)) return { tool: "Bash", arg: "open door", result: `Error: ${text}` };
  if (/degreelessness|very happy ammo|no clipping|ammo added/i.test(t)) return { tool: "Edit", arg: "player.c", result: text };
  if (/fake engine|engine/i.test(t)) return { tool: "Bash", arg: "node engine/dev/fake-engine.mjs", result: text };
  return { tool: "Bash", arg: "doom", result: text };
}

export const defaultLayout = () => computeLayout(process.stdout.columns, process.stdout.rows);
