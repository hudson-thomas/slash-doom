# FableNight: Doom, with medium effort

Real Doom running inside a terminal UI that looks like Claude Code 2.1.

- `engine/`: doomgeneric + terminal backend (C). `make -C engine` builds `engine/build/doom-term`.
- `ui/`: Ink (TypeScript) Claude Code lookalike that hosts the game.
- `CONTRACT.md`: the stdin/stdout protocol between the two.

## Run

```sh
cp .env.example .env      # put ANTHROPIC_API_KEY in it for live narration (optional)
./demo.sh                 # builds engine, starts the UI if ui/ exists, else the raw player
./demo.sh raw             # raw player with Claude narration, no chrome
```

Raw player keys: arrows/WASD move, `f` fire, space use, Esc menu, backtick cycles render modes
(blocks, braille, ascii, mono), `g` god mode, `k` all weapons, Ctrl-C quits.

- `mcp/`: MCP server so real Claude Code can play Doom (`doom_look`/`doom_press`). See `mcp/README.md`.
- `narrator/`: `node narrator/wrap.mjs` wraps the engine and adds `N <text>` lines from `claude-fable-5-1`.

## Install as a Claude Code plugin

The repo is a Claude Code plugin (`doom`) and its own marketplace (`.claude-plugin/`):

```sh
claude plugin marketplace add hudson-thomas/FableNight   # or a local path to this repo
claude plugin install doom@fablenight
```

Then in Claude Code: `/doom:play [map] [skill]` (Claude plays and narrates) or `/doom:host` (humans play, Claude
commentates). First launch installs the MCP deps and builds the engine + fetches Freedoom in the background
(needs `node`, `make`, a C compiler, `git`, `curl`, `unzip`; log in `$TMPDIR/doom-plugin-setup.log`); until that
finishes `doom_start` uses the fake engine. To try it without installing: `claude --plugin-dir .`
