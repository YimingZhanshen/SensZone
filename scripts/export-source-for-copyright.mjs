#!/usr/bin/env node
// 软著源程序鉴别材料导出（零依赖，幂等）。
// 用法：node scripts/export-source-for-copyright.mjs
// 行为：
//   1) 从 index.html 解析脚本加载顺序（version.js 必为第一个）
//   2) 依次拼接 index.html 与全部 src/*.js（按加载顺序）
//   3) 按每页 50 行排版；总量 ≤ 60 页（3000 行）全部导出，否则取前 1500 行 + 后 1500 行
//   4) 每页首行插入页眉：软件名称 + 版本号（读 src/version.js 单源）+ 第X页/共Y页
// 输出：docs/copyright/source-code.txt（重复运行输出一致）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'docs', 'copyright');
const LINES_PER_PAGE = 50;
const MAX_PAGES = 60;

const versionJs = fs.readFileSync(path.join(SRC_DIR, 'version.js'), 'utf8');
const version = (versionJs.match(/SZ\.VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!version) throw new Error('src/version.js 中未找到 SZ.VERSION');
const TITLE = 'SensZone（灵敏域）FPS灵敏度区间查找软件 V' + version;

const html = fs.readFileSync(INDEX, 'utf8');
const scripts = [...html.matchAll(/<script src="(src\/[a-z0-9-]+\.js)\?v=/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('index.html 中未找到脚本标签');
if (scripts[0] !== 'src/version.js') throw new Error('第一个加载的脚本应为 src/version.js');

const parts = [];
parts.push({ name: 'index.html', code: html });
scripts.forEach((rel) => {
  parts.push({ name: rel, code: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
});

const lines = [];
parts.forEach((p) => {
  lines.push('// ===== 文件: ' + p.name + ' =====');
  p.code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((l) => lines.push(l));
});

const totalPages = Math.ceil(lines.length / LINES_PER_PAGE);
let selected;
let note;
if (totalPages <= MAX_PAGES) {
  selected = lines;
  note = '(程序全部行数不足 60 页，按规则全部导出)';
} else {
  const head = lines.slice(0, 1500);
  const tail = lines.slice(-1500);
  selected = head.concat(tail);
  note = '(程序总行数超过 60 页，按规则导出前 1500 行 + 后 1500 行)';
}

const pages = [];
for (let i = 0; i < selected.length; i += LINES_PER_PAGE) {
  const pageLines = selected.slice(i, i + LINES_PER_PAGE);
  const pageNo = pages.length + 1;
  pages.push(
    TITLE +
      '  第' +
      pageNo +
      '页/共' +
      Math.ceil(selected.length / LINES_PER_PAGE) +
      '页\n' +
      pageLines.join('\n'),
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'source-code.txt');
fs.writeFileSync(out, pages.join('\n') + '\n', 'utf8');
console.log(
  'exported ' +
    path.relative(ROOT, out) +
    ' : ' +
    lines.length +
    ' source lines -> ' +
    pages.length +
    ' pages ' +
    note,
);
