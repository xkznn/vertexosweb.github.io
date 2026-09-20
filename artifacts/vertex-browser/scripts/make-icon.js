const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;

/* ---- PNG encoder (truecolor RGBA) ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- drawing helpers ---- */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function boxDist(x, y, cx, cy, half, rad) {
  const qx = Math.abs(x - cx) - half;
  const qy = Math.abs(y - cy) - half;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rad;
}

function sat(v) { return clamp(v, 0, 1); }

/* ---- composition ---- */

const rgba = Buffer.alloc(S * S * 4);
const M = 20;         // margin
const RAD = 44;       // corner radius
const HALF = S / 2 - M;
const CX = S / 2, CY = S / 2;

// Cheveron "V"
const Wv = [
  { x: 0.42 * S, y: 0.30 * S },
  { x: 0.50 * S, y: 0.70 * S },
  { x: 0.58 * S, y: 0.30 * S },
];
const HW = 0.042 * S;   // stroke half-width
const GLOW = 0.085 * S;

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const t = y / S;

    // rounded-rect card background
    const d = boxDist(x, y, CX, CY, HALF, RAD);
    const aBg = sat(0.5 - d);

    // vertical gradient
    const r0 = Math.round(10 + 26 * t);
    const g0 = Math.round(20 + 34 * t);
    const b0 = Math.round(42 + 42 * t);

    // top sheen + bottom vignette
    const sheen = sat(1 - (y / (S * 0.35))) * 0.12;
    const vig = sat((y - S * 0.4) / (S * 0.55)) * 0.10;

    // gradient near the chevron arms lightens
    const d1 = distSeg(x, y, Wv[0].x, Wv[0].y, Wv[1].x, Wv[1].y);
    const d2 = distSeg(x, y, Wv[1].x, Wv[1].y, Wv[2].x, Wv[2].y);
    const dV = Math.min(d1, d2);

    // glow
    const glow = sat(GLOW - dV) * 0.55;
    const gR = Math.round(46 * glow);
    const gG = Math.round(230 * glow);
    const gB = Math.round(255 * glow);

    // stroke
    const aStroke = sat(HW + 0.55 - dV);
    const sR = Math.round(90 + 165 * aStroke * aStroke * 0.5);
    const sG = Math.round(220 + 35 * aStroke);
    const sB = Math.round(255);

    const idx = (y * S + x) * 4;
    rgba[idx] = clamp(Math.round(r0 + sheen * 255) + gR + sR * aStroke, 0, 255);
    rgba[idx + 1] = clamp(Math.round(g0 + sheen * 255) + gG + sG * aStroke, 0, 255);
    rgba[idx + 2] = clamp(Math.round(b0 + sheen * 255 + vig * 150) + gB + sB * aStroke, 0, 255);
    rgba[idx + 3] = Math.round(aBg * 255);

    // subtle inner border
    if (aBg > 0 && Math.abs(d) < 1.4 && d < 0) {
      const e = sat(1.4 + d) * 0.5;
      rgba[idx] = Math.min(rgba[idx] + Math.round(255 * 0.06 * e), 255);
      rgba[idx + 3] = Math.round(aBg * 255 * (1 - e * 0.6));
    }
  }
}

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePNG(S, S, rgba));
console.log(`icon written: ${out} (${fs.statSync(out).size} bytes)`);