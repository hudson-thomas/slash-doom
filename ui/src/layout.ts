// Row budget for the screen. Everything except the frame is Ink chrome.
export const HEADER_ROWS = 3;
export const GAP = 1;
export const LOG_ROWS = 4; // two tool calls (⏺ line + ⎿ result)
export const SPINNER_ROWS = 1;
export const STATUS_ROWS = 1;

export interface Layout {
  cols: number;
  rows: number;
  frameTop: number; // 0-based screen row of the first frame line
  frameLeft: number; // 0-based column
  frameCols: number;
  frameRows: number;
  totalRows: number; // rows the Ink tree must occupy
}

export function computeLayout(cols = 100, rows = 40): Layout {
  const frameTop = HEADER_ROWS + GAP;
  const below = GAP + LOG_ROWS + SPINNER_ROWS + STATUS_ROWS;
  const frameRows = Math.max(4, rows - 1 - frameTop - below);
  return {
    cols,
    rows,
    frameTop,
    frameLeft: 1,
    frameCols: Math.max(10, cols - 2),
    frameRows,
    totalRows: frameTop + frameRows + below,
  };
}
