# ui/ — Claude Code lookalike that hosts Doom

Ink + TypeScript (run with `tsx`, no build step). Spawns the engine from `../engine` and speaks the
protocol in `../CONTRACT.md`. Chrome (header, tool log, spinner, status line) is Ink; the Doom frame is
blitted straight to the terminal by `src/compositor.ts` so it runs at full engine frame rate.

## Run

```sh
cd ui && npm install
npm start          # real Doom: needs engine built (make -C engine). On Windows the engine runs in WSL:
                   #   wsl -e bash -c 'sudo apt install -y build-essential unzip curl'
                   #   wsl -e make -C /mnt/c/<path-to-repo>/engine
npm run mock       # no Doom needed: uses engine/dev/fake-engine.mjs
```

If `../narrator/node_modules` exists (`cd narrator && npm i`), the engine is routed through
`narrator/wrap.mjs` and its `N` lines drive the spinner text (real Claude with `ANTHROPIC_API_KEY`,
canned lines without). Pass `--no-narrator` to bypass it. `--exit-after <ms>` quits automatically
(smoke tests). On Windows the narrator reaches the WSL engine via `dev/wsl-engine.mjs`.

Use Windows Terminal / any truecolor terminal. Keys: arrows or WASD move, `f` fire, space use/open,
shift+arrows run, `,`/`.` strafe, tab automap, esc menu, backtick cycles render mode
(blocks → braille → ascii → mono), ctrl+c quits.

## Files

- `src/index.tsx` — entry, wiring, keyboard, resize, shutdown
- `src/engine.ts` — spawn (`wsl.exe` on Windows) + F/S/L parser
- `src/compositor.ts` — captures Ink output, splices in the frame, single atomic write
- `src/App.tsx` — Header / ToolLog / Spinner / StatusLine
- `src/store.ts` — engine-fed state, Doom message → fake tool call mapping
- `src/keys.ts`, `src/layout.ts`, `src/theme.ts`
