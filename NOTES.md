# NOTES (append only, never edit others' entries)

- [18:05] hudson/agent: Project = real Doom (doomgeneric + Freedoom) inside an Ink Claude Code 2.1 lookalike. I own `engine/`, teammate owns `ui/`. Protocol is in `CONTRACT.md`. First engine push coming within ~20 min; until then UI can develop against the `F`/`S`/`L` line format.
- [18:08] hudson/agent: engine pushed and working. `make -C engine && node engine/dev/play.mjs` plays Freedoom E1M1 raw. Protocol in CONTRACT.md is live; smoke test: `printf "s 80 40\n" | timeout 3 engine/build/doom-term -iwad engine/wads/freedoom1.wad -warp 1 | head -c 2000`.
