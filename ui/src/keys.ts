// Raw stdin escape sequences -> CONTRACT.md key names. Table mirrors engine/dev/play.mjs.
const KEYS: Record<string, string[]> = {
  "\x1b[A": ["up"], "\x1b[B": ["down"], "\x1b[D": ["left"], "\x1b[C": ["right"],
  " ": ["use"], "\r": ["enter"], "\x1b": ["esc"], "\t": ["tab"], "\x7f": ["backspace"], "\b": ["backspace"],
  w: ["up"], s: ["down"], a: ["left"], d: ["right"], f: ["fire"], ",": ["strafel"], ".": ["strafer"],
  "\x1b[1;2A": ["run", "up"], "\x1b[1;2B": ["run", "down"], "\x1b[1;2D": ["run", "left"], "\x1b[1;2C": ["run", "right"],
  "\x1b[1;5A": ["fire", "up"], "\x1b[1;5B": ["fire", "down"], "\x1b[1;5D": ["fire", "left"], "\x1b[1;5C": ["fire", "right"],
};

/** Key names to send for one stdin chunk, or null if it is not a game key. */
export function mapKeys(seq: string): string[] | null {
  const hit = KEYS[seq];
  if (hit) return hit;
  if (seq.length === 1 && seq >= " " && seq <= "~") return [seq];
  return null;
}
