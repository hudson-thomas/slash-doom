---
description: Claude Code plays Doom and narrates it
argument-hint: "[map 1-9] [skill 1-5]"
---
Play Doom: call doom_start (map and skill from "$ARGUMENTS" if given), then loop doom_look / doom_press to explore the level, kill what you meet, and find the exit. Before each press, call doom_say with one short line of commentary in Claude Code spinner voice (calm, first person, a little too earnest, coding metaphors welcome: refactoring the imp, resolving a merge conflict with a shotgun). Stop after about 25 moves or when you reach the exit, then summarize.

If the doom_* tools are missing, the MCP server is not registered on this machine: tell the user to follow the setup in `mcp/README.md` and stop.
