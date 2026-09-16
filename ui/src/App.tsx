// Ink tree: the Claude Code chrome. The Doom frame lives in <FrameSlot/> and is painted by the compositor.
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { Store } from "./store.js";
import { DIM, ORANGE, SPINNER_GLYPHS, VERBS, VERB_THRESHOLDS } from "./theme.js";
import { LOG_ROWS } from "./layout.js";

const TICK_MS = 125; // 8 Hz chrome refresh; frames paint independently at engine rate

export function App({ store }: { store: Store }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);
  const { layout } = store;
  return (
    <Box flexDirection="column" width={layout.cols} height={layout.totalRows}>
      <Header store={store} />
      <Box height={1} />
      <Box height={layout.frameRows} />
      <Box height={1} />
      <ToolLog store={store} />
      <Spinner store={store} tick={tick} />
      <StatusLine store={store} />
    </Box>
  );
}

function Header({ store }: { store: Store }) {
  const { weapon, map, sector } = store.stats;
  const cwd = `~/doomclaude/${map}/sector-${sector}`;
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={ORANGE}>{" ▐▛███▜▌"}</Text>
        <Text>{"   "}</Text>
        <Text bold>Claude Code</Text>
        <Text> v2.1.0</Text>
      </Box>
      <Box>
        <Text color={ORANGE}>{"▝▜█████▛▘"}</Text>
        <Text>{"  "}</Text>
        <Text color={DIM}>Fable 5.1 · {weapon} with medium effort</Text>
      </Box>
      <Box>
        <Text color={ORANGE}>{"  ▘▘ ▝▝"}</Text>
        <Text>{"    "}</Text>
        <Text color={DIM}>{cwd}</Text>
      </Box>
    </Box>
  );
}

function ToolLog({ store }: { store: Store }) {
  const entries = store.log.slice(-Math.floor(LOG_ROWS / 2));
  return (
    <Box flexDirection="column" height={LOG_ROWS}>
      {entries.map((e, i) => (
        <Box key={`${store.log.length}-${i}`} flexDirection="column">
          <Text>
            <Text color={ORANGE}>⏺ </Text>
            <Text bold>{e.tool}</Text>
            <Text>({e.arg})</Text>
          </Text>
          <Text color={DIM}>
            {"  ⎿  "}
            {e.result}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function Spinner({ store, tick }: { store: Store; tick: number }) {
  const glyph = SPINNER_GLYPHS[tick % SPINNER_GLYPHS.length];
  const kills = store.stats.kills;
  let verb = VERBS[0];
  for (let i = 0; i < VERB_THRESHOLDS.length; i++) if (kills >= VERB_THRESHOLDS[i]) verb = VERBS[i];
  const elapsed = Math.floor((Date.now() - store.startedAt) / 1000);
  return (
    <Text>
      <Text color={ORANGE}>{glyph} </Text>
      <Text color={ORANGE}>{verb}… </Text>
      <Text color={DIM}>
        (esc to interrupt · {elapsed}s · ↑ {fmtTokens(tokens(store))} tokens)
      </Text>
    </Text>
  );
}

function StatusLine({ store }: { store: Store }) {
  const s = store.stats;
  const cost = (tokens(store) / 1e6) * 15;
  return (
    <Text color={DIM}>
      {"  "}↓ {fmtTokens(tokens(store))} tokens · ${cost.toFixed(2)} · health {s.health}% · armor {s.armor} · ammo {s.ammo} · kills {s.kills} · {s.map} · {store.fps}fps · {store.mode}
    </Text>
  );
}

const tokens = (store: Store) => store.stats.tics * 7 + store.stats.kills * 350 + store.stats.items * 40;
const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
