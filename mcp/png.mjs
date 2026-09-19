// SPDX-License-Identifier: GPL-2.0-or-later
// Shared by server.mjs (screenshots for Claude) and watch.mjs (inline-image render modes):
// a minimal PNG encoder and a nearest-neighbour resampler for the engine's raw "P w h" RGB frames.
import zlib from "node:zlib";

// Minimal PNG encoder (RGB8, filter 0) using zlib. level 1 is plenty for a 20fps terminal stream.
export function encodePng(rgb, w, h, level = 6) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level })), chunk("IEND", Buffer.alloc(0))]);
}

// Nearest-neighbour resample. Used to stretch Doom's 320x200 buffer to its intended 4:3 (320x240).
export function resampleRgb(rgb, w, h, w2, h2) {
  if (w === w2 && h === h2) return rgb;
  const dst = Buffer.alloc(w2 * h2 * 3);
  for (let y = 0; y < h2; y++) {
    const sy = Math.min(h - 1, Math.floor(y * h / h2));
    if (w === w2) { rgb.copy(dst, y * w2 * 3, sy * w * 3, (sy + 1) * w * 3); continue; }
    for (let x = 0; x < w2; x++) {
      const s = (sy * w + Math.min(w - 1, Math.floor(x * w / w2))) * 3;
      rgb.copy(dst, (y * w2 + x) * 3, s, s + 3);
    }
  }
  return dst;
}
