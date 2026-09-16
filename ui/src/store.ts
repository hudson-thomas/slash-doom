// Mutable UI state fed by the engine; Ink reads it on an 8 Hz tick (see App.tsx).
import { EMPTY_STATS, type Stats } from "./engine.js";
import { computeLayout, type Layout } from "./layout.js";
import type { RenderMode } from "./theme.js";

export interface ToolCall {
  tool: string;
  arg: string;
  result: string;
  error?: boolean;
}

export interface Store {
  stats: Stats;
  log: ToolCall[];
  layout: Layout;
  mode: RenderMode;
  startedAt: number;
  frames: number;
  fps: number;
  narration: string; // latest N line from the narrator
  override: { text: string; until: number } | null; // temporary spinner text (death, level change)
  pushLog(text: string): void;
  onEvent(ev: string): void;
}

const API_529 =
  'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}} · Retrying in 4 seconds… (attempt 1/10)';

export function createStore(layout: Layout): Store {
  return {
    stats: EMPTY_STATS,
    log: [{ tool: "Bash", arg: "make -C engine && ./build/doom-term -iwad freedoom1.wad", result: "engine starting…" }],
    layout,
    mode: "blocks",
    startedAt: Date.now(),
    frames: 0,
    fps: 0,
    narration: "",
    override: null,
    pushLog(text: string) {
      this.log.push(toolCallFor(text));
      if (this.log.length > 20) this.log.shift();
    },
    onEvent(ev: string) {
      const [kind, arg] = ev.split(" ");
      const map = this.stats.map;
      if (kind === "dead") {
        this.log.push({ tool: "Bash", arg: "doom --continue", result: API_529, error: true });
        this.override = { text: "Compacting conversation", until: Date.now() + 6000 };
      } else if (kind === "respawn") {
        this.log.push({ tool: "Bash", arg: "doom --continue", result: "Resumed from checkpoint." });
        this.override = null;
      } else if (kind === "level-done") {
        this.log.push({ tool: "TodoWrite", arg: "", result: `☒ Clear ${map}  ☐ Find the exit  ☐ Rip and tear` });
        this.override = { text: "Summarizing conversation", until: Date.now() + 5000 };
      } else if (kind === "level-start") {
        this.log.push({ tool: "Read", arg: `${map}.wad`, result: `Read ${map} (1 sector, 0 secrets found)` });
      } else if (kind === "hurt" && +arg >= 20) {
        this.log.push({ tool: "Bash", arg: "npm test", result: `${arg} tests failed`, error: true });
      }
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
