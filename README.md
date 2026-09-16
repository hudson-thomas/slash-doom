# FableNight: Doom, with medium effort

Real Doom running inside a terminal UI that looks like Claude Code 2.1.

- `engine/`: doomgeneric + terminal backend (C). `make -C engine` builds `engine/build/doom-term`.
- `ui/`: Ink (TypeScript) Claude Code lookalike that hosts the game.
- `CONTRACT.md`: the stdin/stdout protocol between the two.

## Run

```sh
make -C engine            # first run downloads doomgeneric and Freedoom
node engine/dev/play.mjs  # raw engine, no chrome
# UI: see ui/README.md
```
