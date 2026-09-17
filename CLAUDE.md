# /doom (FableNight) — Claude Build Night Hackathon

> These are the ground rules from the build night, kept as they were written for the two agents. The project is
> now public at `hudson-thomas/slash-doom`; see `README.md` for what it is and how to run it.

A 2-hour hackathon project built with Fable 5.1. **Two people, each with their own Claude Code agent**, are
pushing to the same repo: `hudson-thomas/slash-doom`.

## Project

`/doom`: real Claude Code plays real Doom. Stack: doomgeneric + a terminal backend in C (`engine/`), an MCP server and
watcher in Node (`mcp/`), a Claude narrator (`narrator/`), and an Ink/TypeScript Claude Code lookalike (`ui/`).
Run: see `README.md`.

## Ground rules

1. **Speed over polish, but don't break main.** Main must always run. Demo time is fixed, and a broken main
   costs both teams.
2. **Stay in your lane.** Each agent owns one directory (see Ownership). Don't edit the other agent's
   directory. If you need a change there, tell your human, and they'll ask the teammate.
3. **Be a good guest.** Your teammate's work is theirs. Never delete, rewrite, reformat, or "clean up" code
   you didn't write, even if it looks wrong. Point out the problem and leave the code alone.
4. **Ask before you decide for both of us.** Adding a big dependency, changing the stack, renaming shared
   things, or changing a shared interface affects both people. Check with your human first.
5. **Small, frequent commits.** Push working increments every ~10–15 minutes. Don't sit on a large local
   diff.

## Ownership

| Directory | Owner |
|-----------|-------|
| `engine/`, `narrator/`, `mcp/` | hudson's agent |
| `ui/` | matt's agent |
| Shared: root config, `README.md`, `CLAUDE.md`, lockfiles, shared types/API contract | **both, coordinate first** |

If a directory is not listed, ask your human whose it is before you write code.

## Git workflow (we push straight to main)

We commit directly to `main`, with no branches or PRs. To keep that safe:

- **Always pull before you start work, and again before you push:**
  ```sh
  git pull --rebase origin main
  ```
- Before you push, make sure the project still builds/runs.
- Use `git push origin main`. **Never force-push**, never run `git push --force` or `--force-with-lease`,
  and never rewrite history that's already pushed.
- If the push is rejected, pull with `--rebase` again and retry. Don't overwrite the remote.
- **Rebase conflicts:**
  - In your own directory: resolve them.
  - In the other agent's files or shared files: **stop and ask your human.** Don't choose "ours" on
    someone else's code.
  - Never run `git reset --hard`, `git checkout -- .`, `git clean`, or `git stash drop` on anything you
    didn't create.
- Commit only files you changed on purpose. Use `git add <paths>`, not `git add -A`, so you don't sweep in
  the other agent's files or stray files.
- Commit messages: short and imperative, prefixed with the area, e.g. `frontend: add upload form`.
- Don't commit secrets. Keep `.env` files local and commit `.env.example` instead.

## Shared files and interfaces

- For shared files such as `package.json`, lockfiles, root config, and the API contract, make **minimal,
  additive** edits, then commit and push them right away, on their own, so the other agent picks them up
  quickly.
- If the two halves talk to each other, write the contract down early, in `CONTRACT.md` or a shared types
  file, and change it only by agreement. Additive changes are fine. Breaking changes need a heads-up.
- Don't upgrade, reformat, or reorder dependencies you didn't add.

## Communication

- The agents can't talk to each other directly. **The humans are the channel.** When something affects the
  other side, tell your human in one or two lines they can pass along, for example: "I added
  `GET /api/stories`, which returns `{id, title}[]`."
- Keep `NOTES.md` as a lightweight shared log. Append only; never edit the other person's entries:
  `- [HH:MM] <who>: <what changed / what you need>`
- Before you start a chunk of work, check `git log --oneline -10` and `NOTES.md` to see what changed.

## Working style for a 2-hour sprint

- Build the thinnest end-to-end demo path first, then add features.
- Prefer boring, well-known tools. Don't spend time on setup yak-shaving.
- Skip heavy test suites. A quick smoke check before each push is enough.
- If you're stuck on something for more than ~5 minutes, say so and suggest a simpler route.
- Keep responses to your human short. They're busy.
- **Around the 1:45 mark:** stop adding features, make sure main runs, and help prepare the demo.

## Claude / Fable API

- If the project calls Claude, use model `claude-fable-5-1` unless we decide otherwise.
- Read the API key from an env var (`ANTHROPIC_API_KEY`). Never hard-code or commit it.
