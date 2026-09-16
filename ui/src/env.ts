// Imported first: Ink renders into a fake stdout, so chalk cannot detect colour support itself.
process.env.FORCE_COLOR ??= "3";
