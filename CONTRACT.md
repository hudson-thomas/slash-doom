# CONTRACT: ui/ <-> engine/

The UI spawns the engine as a child process and talks over stdin/stdout. Text protocol,
newline-delimited. Changes must be additive; breaking changes need a heads-up in NOTES.md.

## Launch

```sh
engine/build/doom-term -iwad engine/wads/freedoom1.wad -warp 1 -skill 3   # -warp skips the attract demo, starts E1M1
```

Build with `make -C engine` (downloads doomgeneric + Freedoom on first run).

## UI -> engine (stdin)

| Line              | Meaning |
|-------------------|---------|
| `s <cols> <rows>` | Set frame size in terminal cells. Each cell holds 2 vertical pixels, so effective resolution is cols x 2*rows. Send on start and on terminal resize. |
| `k <name>`        | Key press. The engine auto-releases after ~180 ms without a repeat (terminals never send key-up). UI never sends releases, just forward every keypress event. |
| `q`               | Quit cleanly. |

Key names: `up down left right fire use run enter esc tab pause y n 1 2 3 4 5 6 7`
plus any single printable ASCII char (e.g. `k a`). Suggested UI mapping: arrows -> up/down/left/right,
ctrl or `f` -> fire, space -> use, shift -> run, WASD -> up/left/down/right (strafe via `,`/`.` is
Doom-native, optional).

## engine -> UI (stdout)

| Line | Meaning |
|------|---------|
| `F <rows>` then exactly `rows` lines | One frame. Each line is a complete ANSI truecolor row (`\e[38;2;r;g;bm\e[48;2;r;g;bm▀`... ending `\e[0m`). Print each verbatim; no wrapping needed if cols <= terminal width. |
| `S health=<n> armor=<n> ammo=<n> kills=<n> items=<n> secrets=<n> map=E1M1 tics=<n>` | Game stats, once per frame. Use for the fake token/cost line. |
| `L <text>` | Doom's on-screen messages ("Picked up a shotgun.") and engine notices. Show as fake tool-call/thinking text. |

Frame rate is capped at ~20 fps by the engine. Frames are only emitted after an `s` line.

## Smoke test without the UI

```sh
node engine/dev/play.mjs          # play raw in the terminal
printf 's 80 40\n' | timeout 3 engine/build/doom-term -iwad engine/wads/freedoom1.wad | head -c 2000
```
