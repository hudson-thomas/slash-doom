// Claude Code 2.1 look & feel constants.
export const ORANGE = "#D97757";
export const DIM = "gray";
export const SPINNER_GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽"];
// Verb shown in the spinner line, picked by kill count bucket.
export const VERBS = ["Booting", "Exploring", "Slaying", "Ripping", "Tearing", "Dominating", "Transcending"];
export const VERB_THRESHOLDS = [0, 1, 3, 8, 15, 30, 60];
export const RENDER_MODES = ["blocks", "braille", "ascii", "mono"] as const;
export type RenderMode = (typeof RENDER_MODES)[number];
