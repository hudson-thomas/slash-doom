// Animated Clawd logo. Reacts to game state read from the store on the 8 Hz chrome tick:
// blinks when idle, flinches red when hurt, bounces when a kill lands, flashes on fire,
// goes grey with X eyes when dead, cycles colours on level complete.
import React, { useRef } from "react";
import { Box, Text } from "ink";
import type { Store } from "./store.js";
import { ORANGE } from "./theme.js";

type Mood = "idle" | "blink" | "hurt" | "happy" | "fire" | "dead" | "party";

const FACE: Record<Exclude<Mood, "party" | "fire">, string[]> = {
  idle:  [" ▐▛███▜▌ ", "▝▜█████▛▘", "  ▘▘ ▝▝  "],
  blink: [" ▐▛███▜▌ ", "▝▜▀▀▀▀▀▛▘", "  ▘▘ ▝▝  "],
  hurt:  [" ▐▛███▜▌ ", "▝▜█▚▚▚█▛▘", "  ▘▘ ▝▝  "],
  happy: [" ▐▛███▜▌ ", "▝▜█▀ ▀█▛▘", "  ▘▘ ▝▝  "],
  dead:  [" ▐▛███▜▌ ", "▝▜█ᕽ ᕽ█▛▘", "  ▘▘ ▝▝  "],
};
const PARTY = ["#D97757", "#F2C14E", "#6BCB77", "#4D96FF", "#C77DFF"];

interface Memo { health: number; kills: number; ammo: number; until: number; mood: Mood }

export function Clawd({ store, tick }: { store: Store; tick: number }) {
  const m = useRef<Memo>({ health: store.stats.health, kills: store.stats.kills, ammo: store.stats.ammo, until: 0, mood: "idle" });
  const s = store.stats;
  const now = Date.now();
  const set = (mood: Mood, ms: number) => { m.current.mood = mood; m.current.until = now + ms; };

  // event detection from stat deltas, priority: dead > hurt > happy > fire
  const dead = s.health <= 0 || (store.override?.text ?? "").startsWith("Compacting");
  const party = (store.override?.text ?? "").startsWith("Summarizing");
  if (dead) set("dead", 500);
  else if (party) set("party", 500);
  else if (s.health < m.current.health) set("hurt", 700);
  else if (s.kills > m.current.kills) set("happy", 900);
  else if (s.ammo < m.current.ammo && m.current.until < now) set("fire", 200);
  m.current.health = s.health; m.current.kills = s.kills; m.current.ammo = s.ammo;

  let mood: Mood = m.current.until > now ? m.current.mood : "idle";
  if (mood === "idle" && tick % 40 === 0) mood = "blink";          // blink every ~5s for one tick

  const shake = mood === "hurt" ? (tick % 2 ? " " : "") : "";
  const bounce = mood === "happy" && tick % 2 === 0;
  const color = mood === "hurt" ? "red" : mood === "dead" ? "gray" : mood === "fire" ? "#F2C14E"
              : mood === "party" ? PARTY[tick % PARTY.length] : ORANGE;
  const face = FACE[(mood === "party" || mood === "fire" ? "happy" : mood) as keyof typeof FACE];
  const lines = bounce ? [face[1], face[2], "         "] : face;

  return (
    <Box flexDirection="column" width={10}>
      {lines.map((l, i) => <Text key={i} color={color}>{shake + l}</Text>)}
    </Box>
  );
}
