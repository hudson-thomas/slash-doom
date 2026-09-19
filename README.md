# /doom

Slash Doom: Claude Code plays Doom, with medium effort.

Type `/doom` in real Claude Code and Claude plays real Doom (doomgeneric + Freedoom): it looks at the screen, presses
keys through MCP tools, and narrates every move in its calmest spinner voice. You can watch in full colour and grab
the controls too; everyone drives the same marine.

Built in two hours at the Claude Fable 5.1 Build Night in Brisbane, Australia by
[@hudson-thomas](https://github.com/hudson-thomas) and [@mb-910](https://github.com/mb-910).

## Play it in Claude Code

Needs `node`, `make`, a C compiler, `git`, `curl`, `unzip`. Tested on Linux; macOS should work; on Windows use WSL. From the repo root:

```sh
make -C engine && (cd mcp && npm install)                          # builds Doom, fetches Freedoom (~24MB)
claude mcp add --scope local doom -- node "$PWD/mcp/server.mjs"    # registers the Doom tools for this project
claude
```

Then `/doom` (or `/doom 3 4` for E1M3 on skill 4). In a second terminal, `node mcp/watch.mjs` shows the game in full
colour with Claude's moves listed underneath, and your keys work as well: co-op, one marine. On WezTerm,
iTerm2, Kitty or Ghostty the watcher draws the real 320x200 framebuffer as an inline image instead of half-blocks
(`m` cycles, `--mode=` forces). More in `mcp/README.md`
(hosting a game for humans only, multiplayer, the tool list).

## Second act: Doom inside a fake Claude Code

`ui/` is a parody: an Ink (TypeScript) terminal UI made to look like Claude Code, hosting the same game, with Claude
narrating your run in the spinner line.

```sh
cp .env.example .env      # put ANTHROPIC_API_KEY in it for live narration (optional)
./demo.sh                 # builds engine, starts the lookalike UI
./demo.sh raw             # raw terminal player with Claude narration, no chrome
./demo.sh coop            # host a co-op game with no Claude; join with node mcp/watch.mjs
```

Raw player keys: arrows/WASD move, `f` fire, space use, Esc menu, backtick cycles render modes
(blocks, braille, ascii, mono), `g` god mode, `k` all weapons, Ctrl-C quits.

## What's in here

- `engine/`: doomgeneric + terminal backend (C). `make -C engine` builds `engine/build/doom-term`.
- `mcp/`: MCP server that exposes the game as tools (`doom_start`, `doom_look`, `doom_press`, ...), plus the watcher.
- `.claude/commands/doom.md`: the `/doom` slash command.
- `ui/`: the Claude Code lookalike.
- `narrator/`: `node narrator/wrap.mjs` wraps the engine and adds narration lines from `claude-fable-5-1`.
- `CONTRACT.md`: the stdin/stdout protocol between engine and front ends.
- `CLAUDE.md`, `NOTES.md`: the ground rules and the agents' shared log from the build night, kept as they were.

## Licence

GPL-2.0-or-later, see `LICENSE`. The engine links against
Doom source code, which is GPL, so the project as a whole is too.

Not included in this repo, fetched by `engine/get-deps.sh` at build time:

- [doomgeneric](https://github.com/ozkl/doomgeneric) (GPL-2.0), based on id Software's Doom source and Chocolate Doom.
- [Freedoom](https://freedoom.github.io/) game data (BSD-3-Clause).

Not affiliated with or endorsed by Anthropic or id Software. "Claude" and "Claude Code" are trademarks of Anthropic;
"Doom" is a trademark of id Software. The `ui/` Claude Code lookalike is a parody made for a hackathon.
