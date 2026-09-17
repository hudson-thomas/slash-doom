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
| `m <mode>`        | Render mode: `blocks` (default, truecolor half-blocks), `ascii` (coloured ASCII luminance ramp, one char per cell), `mono` (plain ASCII, zero escape codes), `braille` (2x4 dithered dots per cell, coloured, sharpest text-only look). Switch any time. |
| `c <text>`        | Type a string into Doom as keypresses. Cheats: `c iddqd` god mode, `c idkfa` all weapons/keys, `c idclip` no-clip, `c idclev15` warp to E1M5, `c iddt` (twice, with automap open via `k tab`) reveal map. |
| `f <fps>`         | Optional. Frame rate cap, 1..35, default 20. Lower it if the UI cannot keep up. |
| `r <ms>`          | Optional. Auto-release delay for held keys, default 180. Raise if movement stutters, lower if turning overshoots. |
| `a`               | Request one 80x24 mono `A` snapshot with the next frame. |
| `p`               | Request one raw-pixel `P` frame (the full 320x200 framebuffer). Used for screenshots and for front ends that draw images instead of cells. |
| `q`               | Quit cleanly. |

Key names: `up down left right fire use run enter esc tab pause y n 1 2 3 4 5 6 7`
plus any single printable ASCII char (e.g. `k a`). Suggested UI mapping: arrows -> up/down/left/right,
ctrl or `f` -> fire, space -> use, shift -> run, WASD -> up/left/down/right (strafe via `,`/`.` is
Doom-native, optional).

## engine -> UI (stdout)

| Line | Meaning |
|------|---------|
| `F <rows>` then exactly `rows` lines | One frame. Each line is a complete ANSI truecolor row (`\e[38;2;r;g;bm\e[48;2;r;g;bm▀`... ending `\e[0m`). Print each verbatim; no wrapping needed if cols <= terminal width. The image is letterboxed to 4:3 inside the box (black bars), so give the engine the whole available area. |
| `S health=<n> armor=<n> ammo=<n> kills=<n> items=<n> secrets=<n> map=E1M1 tics=<n> weapon=<name> x=<n> y=<n> angle=<0-359> sector=<n>` | Game stats, once per frame. Use for the fake token/cost line. `weapon` is a slug like `shotgun` (fake model line: "shotgun with medium effort"); `sector` is the current map sector (fake cwd: `~/E1M1/sector-42`). Parse as key=value pairs and ignore unknown keys; more may be added. |
| `E <event>` | Game events: `dead`, `respawn`, `level-done`, `level-start`, `kill <total>`, `hurt <amount>`. Use `dead` for the fake "API Error: 529 overloaded / compacting conversation" crash gag. |
| `A <rows>` then `rows` lines | 80x24 plain-ASCII snapshot, only sent after an `a` request (used by the narrator; UIs can ignore). |
| `P <w> <h>` then one base64 line | Raw RGB8 framebuffer, `w*h*3` bytes base64-encoded on a single line, only sent after a `p` request. Native resolution, no letterboxing, no scaling. Stretch to 4:3 for Doom's intended aspect. |
| `N <text>` | One-line narration in Claude Code voice, emitted by `narrator/wrap.mjs` (not by the raw engine). Show as the spinner/thinking text. |
| `L <text>` | Doom's on-screen messages ("Picked up a shotgun.") and engine notices. Show as fake tool-call/thinking text. |

Frame rate is capped at ~20 fps by the engine. Frames are only emitted after an `s` line.

## Unknown lines

UIs must ignore lines with prefixes they do not know. New line types are additive.

## Narrator (real Claude)

`node narrator/wrap.mjs -- <engine args>` spawns the engine and proxies the protocol unchanged, adding `N <text>` lines every few seconds and on events: one line of Claude Code style narration from `claude-fable-5-1`. Spawn it instead of `doom-term`. Needs Anthropic credentials (`ANTHROPIC_API_KEY` or an `ant auth` profile); without them it emits canned lines so the demo never breaks. `NARRATE_MS=6000` tunes the cadence.

## Developing the UI without Doom

`node engine/dev/fake-engine.mjs` speaks this exact protocol (all commands, all modes, S/L lines) and
draws a moving test pattern. No C build or WAD needed. Spawn it in place of `doom-term` while
building the UI, then switch to the real binary. `FAKE=1 node engine/dev/play.mjs` shows it in the dev player.

## Smoke test without the UI

```sh
node engine/dev/play.mjs          # play raw in the terminal
printf 's 80 40\n' | timeout 3 engine/build/doom-term -iwad engine/wads/freedoom1.wad | head -c 2000
```
