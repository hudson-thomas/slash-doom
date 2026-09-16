# mcp/ — Claude Code plays Doom

An MCP server exposing the engine as tools, so real Claude Code can play the game and narrate it.

Tools: `doom_start`, `doom_look` (80x24 ASCII screen + stats), `doom_press` (hold keys), `doom_type` (cheats), `doom_stop`.
Prompt: `/doom:play`.

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
Demo layout: Claude Code on the left, the watcher on the right. `q` quits the watcher; the game keeps running.
