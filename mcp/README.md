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
