# mcp/ — Claude Code plays Doom

An MCP server exposing the engine as tools, so real Claude Code can play the game and narrate it.

Tools: `doom_start`, `doom_look` (80x24 ASCII screen + stats), `doom_press` (hold keys), `doom_type` (cheats), `doom_host` (start a game for humans, Claude does not play), `doom_stop`.
Prompts: `/doom:play` (Claude plays), `/doom:host` (Claude hosts, humans play via `node mcp/watch.mjs`).

## Setup (per machine, does not touch the repo)

```sh
make -C engine && (cd mcp && npm install)
claude mcp add --scope local doom -- node "$PWD/mcp/server.mjs"   # from the repo root
```

Then in Claude Code: "play Doom" or `/doom:play`. Claude looks at the ASCII frame, decides, presses keys, looks again.

## Watch it play

In a second terminal, before or after Claude starts:

```sh
node mcp/watch.mjs
```

Full-colour view of the game Claude is playing, with Claude's key presses and Doom events listed underneath.
Demo layout: Claude Code on the left, the watcher on the right. Backtick quits the watcher; the game keeps running.

### Render modes

The watcher picks the sharpest mode your terminal supports, from `TERM_PROGRAM`/`TERM`:

| Terminal | Mode | What you get |
|----------|------|--------------|
| WezTerm, iTerm2 (also over ssh via `LC_TERMINAL`) | `iterm` | The real 320x200 framebuffer as an inline image, stretched to Doom's 4:3 |
| Kitty, Ghostty | `kitty` | Same, via the Kitty graphics protocol |
| Terminal.app, plain xterm, tmux | `blocks` | ANSI truecolor half-blocks, as before |

`m` cycles between the image mode and blocks; `--mode=iterm|kitty|blocks|auto` forces one.

Why it matters: in `blocks` the engine renders at terminal-cell resolution, and each cell is two pixels tall, so a
default 80x24 window letterboxes Doom into roughly **53x40 pixels**. Height is the binding constraint, which is why
the picture looks chunky with black bars down the sides. The image modes bypass the cell grid entirely. If you are
stuck on `blocks`, a smaller font and a bigger window is the only lever: 200x60 cells gives you 200x120 instead.

## Full circle: Claude Code playing Doom inside "Claude Code"

With a game hosted (Claude's `/doom:play`, or `./demo.sh coop`), point the lookalike UI at it instead of its own engine:

```sh
ENGINE=node:mcp/bridge.mjs ./demo.sh
```

The chrome shows the shared game, Claude's `doom_say` commentary and key presses appear in the tool log, and your keys
still drive the marine. Real Claude Code on one side, fake Claude Code on the other, same Doom.

## Multiplayer (co-op, one marine)

Every watcher is also a controller: arrows/WASD move, `f` fires, space opens doors, `g` god mode. All watchers and
Claude drive the same marine at the same time. Run `node mcp/watch.mjs` in as many terminals as you like
(or from several machines sharing the repo path via `DOOM_SOCK=<path>`). It is chaos by design: "pair programming".

Without Claude at all: `./demo.sh coop [map] [skill]` (or `node mcp/server.mjs --host`) hosts the game, then everyone
runs `node mcp/watch.mjs`. Co-op keys work as usual: arrows/WASD, `f` fire, space use, `g` god mode, backtick quits.
