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
