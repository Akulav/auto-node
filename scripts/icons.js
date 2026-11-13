#!/usr/bin/env node
/**
 * Draws AutoNode's raster icons from the same geometry as public/favicon.svg (no dependencies):
 *   public/favicon.ico          16, 32 and 48 px (browsers that skip the SVG, and the dashboard's website tiles)
 *   public/apple-touch-icon.png 180 px home-screen icon
 *   public/icon-512.png         512 px install icon (maskable: the artwork stays inside the central 80 %)
 * The same set AkulavBox serves. Run after changing the icon:  node scripts/icons.js
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BG = [0xf5, 0xf5, 0xf7]; // manifest background_color, behind the maskable / touch icons

// ---- the favicon.svg artwork, in its 128x128 space ----
const FROM = [0x3a, 0x8d, 0xff];
const TO = [0x5e, 0x5c, 0xe6];
const HEX = [[64, 24], [98.6, 44], [98.6, 84], [64, 104], [29.4, 84], [29.4, 44]];
const TRI = [[56, 50], [56, 78], [80, 64]];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
const edges = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** RGBA of one point, or null outside the tile. */
function sample(x, y) {
  if (!inRoundRect(x, y, 4, 4, 124, 124, 28)) return null;
  // stroke-width 7 around the hexagon; the play triangle is filled with a 4 px round-joined stroke
  if (edges(HEX).some(([a, b]) => segDist(x, y, a, b) <= 3.5)) return [255, 255, 255];
  if (inPoly(x, y, TRI) || edges(TRI).some(([a, b]) => segDist(x, y, a, b) <= 2)) return [255, 255, 255];
  const t = Math.min(1, Math.max(0, (x - 4 + (y - 4)) / 240));
  let c = FROM.map((v, i) => v + (TO[i] - v) * t);
  const shine = 0.28 * Math.max(0, 1 - (y - 4) / 60); // white, fading out by the middle
  c = c.map((v) => v + (255 - v) * shine);
  return c;
}

/** The artwork drawn at `size` px (RGBA), placed in a `canvas`-px square on `bg` (or transparent). */
function render(size, canvas = size, bg = null) {
  const px = Buffer.alloc(canvas * canvas * 4);
  const off = (canvas - size) / 2;
  const N = 5;
  for (let py = 0; py < canvas; py++) {
    for (let pxl = 0; pxl < canvas; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = sample(((pxl - off + (sx + 0.5) / N) * 128) / size, ((py - off + (sy + 0.5) / N) * 128) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (py * canvas + pxl) * 4;
      const cov = a / (N * N);
      if (bg) {
        const mix = (v, i) => Math.round((a ? v / a : 0) * cov + bg[i] * (1 - cov));
        px[o] = mix(r, 0); px[o + 1] = mix(g, 1); px[o + 2] = mix(b, 2); px[o + 3] = 255;
      } else {
        if (a) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); }
        px[o + 3] = Math.round(cov * 255);
      }
    }
  }
  return { px, size: canvas };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const v of buf) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png({ px, size }) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(sizes) {
  const images = sizes.map((s) => png(render(s)));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head[e] = s; head[e + 1] = s; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(images[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}

fs.writeFileSync(path.join(dir, 'favicon.ico'), ico([16, 32, 48]));
fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), png(render(150, 180, BG)));
fs.writeFileSync(path.join(dir, 'icon-512.png'), png(render(400, 512, BG)));
console.log('Icons written to public/: favicon.ico, apple-touch-icon.png, icon-512.png');
