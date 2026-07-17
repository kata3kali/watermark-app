// Generates simple placeholder PWA icons (192 & 512 PNG) with zero
// dependencies by writing the PNG format directly (zlib is built into node).
// Design mirrors public/icons/icon.svg: dark bg, diagonal stripes, blue ring.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x11, 0x14, 0x18];
const STRIPE = [0x2e, 0x35, 0x40];
const BLUE = [0x4f, 0x9c, 0xf9];

function pixel(x, y, size) {
  const c = size / 2;
  const dx = x - c;
  const dy = y - c;
  const d = Math.hypot(dx, dy);
  // center dot
  if (d < size * 0.066) return BLUE;
  // ring
  if (d > size * 0.19 && d < size * 0.27) return BLUE;
  // diagonal stripes (period-based)
  const period = size * 0.195;
  const band = ((x + y) % period + period) % period;
  if (band < size * 0.066) return STRIPE;
  return BG;
}

// --- minimal PNG writer (8-bit RGB, no interlace) ---

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, makePng(size));
  console.log('wrote', file);
}
