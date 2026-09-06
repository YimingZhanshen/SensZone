#!/usr/bin/env node
// 生成 PWA 图标（零依赖：Node 内置 zlib 手写最小 PNG 编码器）。
// 图形与 index.html 的 favicon SVG 同款：圆环 + 中心点 + 四向外准星刻度。
// 用法：node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'icons');

const BG = [4, 7, 13]; // #04070d
const FG = [0, 255, 204]; // #00ffcc

// CRC32（PNG 规范）
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePng(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 判定像素是否落在图形上（以中心为原点的距离/坐标，单位 = 图标边长）
function isForeground(nx, ny) {
  // nx, ny ∈ [-1, 1]，0 为中心
  const x = nx * 32;
  const y = ny * 32; // 与 favicon viewBox 32 对齐
  const dx = x - 16;
  const dy = y - 16;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const stroke = 2.5;
  // 圆环 r=9 ± stroke/2
  if (Math.abs(dist - 9) <= stroke / 2) return true;
  // 中心点 r=2
  if (dist <= 2) return true;
  // 四向刻度：从距中心 7 到 14，粗 2.5（|dx| 或 |dy| ≤ 1.25）
  const t = 1.25;
  if (Math.abs(dx) <= t && dy >= -14 && dy <= -7) return true;
  if (Math.abs(dx) <= t && dy >= 7 && dy <= 14) return true;
  if (Math.abs(dy) <= t && dx >= -14 && dx <= -7) return true;
  if (Math.abs(dy) <= t && dx >= 7 && dx <= 14) return true;
  return false;
}

function renderIcon(size) {
  // 2× 超采样抗锯齿
  const SS = 2;
  const big = Buffer.alloc(size * SS * size * SS * 3);
  for (let py = 0; py < size * SS; py++) {
    for (let px = 0; px < size * SS; px++) {
      const nx = ((px + 0.5) / (size * SS)) * 2 - 1;
      const ny = ((py + 0.5) / (size * SS)) * 2 - 1;
      const col = isForeground(nx, ny) ? FG : BG;
      const i = (py * size * SS + px) * 3;
      big[i] = col[0];
      big[i + 1] = col[1];
      big[i + 2] = col[2];
    }
  }
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * size * SS + (x * SS + sx)) * 3;
          r += big[i];
          g += big[i + 1];
          b += big[i + 2];
        }
      }
      const o = (y * size + x) * 3;
      out[o] = Math.round(r / (SS * SS));
      out[o + 1] = Math.round(g / (SS * SS));
      out[o + 2] = Math.round(b / (SS * SS));
    }
  }
  return encodePng(size, size, out);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(OUT_DIR, 'icon-' + size + '.png');
  fs.writeFileSync(file, renderIcon(size));
  console.log('generated', path.relative(ROOT, file), size + 'x' + size);
}
