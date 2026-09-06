#!/usr/bin/env node
// 版本号单源工具（零依赖，Node 内置模块）。
// 用法：
//   node scripts/bump-version.mjs 1.4     把版本号统一写为 1.4
//   node scripts/bump-version.mjs --check 校验各处版本一致（不一致退出码 1）
// 单源 = src/version.js 的 SZ.VERSION；脚本同步改写：
//   1) src/version.js  SZ.VERSION
//   2) index.html      全部 src/*.js?v=N 缓存参数
//   3) README.md       标题中的版本号
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_JS = path.join(ROOT, 'src', 'version.js');
const INDEX_HTML = path.join(ROOT, 'index.html');
const README_MD = path.join(ROOT, 'README.md');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

const read = (p) => fs.readFileSync(p, 'utf8');

function versionFromVersionJs() {
  const m = read(VERSION_JS).match(/SZ\.VERSION\s*=\s*'([^']+)'/);
  if (!m) throw new Error('src/version.js 中未找到 SZ.VERSION 定义');
  return m[1];
}

function rewriteVersionJs(version) {
  const before = read(VERSION_JS);
  if (!/SZ\.VERSION\s*=\s*'[^']+'/.test(before))
    throw new Error('src/version.js 中未找到 SZ.VERSION 定义');
  fs.writeFileSync(
    VERSION_JS,
    before.replace(/SZ\.VERSION\s*=\s*'[^']+'/, "SZ.VERSION = '" + version + "'"),
  );
}

function rewriteIndexHtml(version) {
  const before = read(INDEX_HTML);
  if (!/src\/[a-z0-9-]+\.js\?v=/.test(before))
    throw new Error('index.html 中未找到任何 ?v= 脚本参数');
  fs.writeFileSync(INDEX_HTML, before.replace(/(src\/[a-z0-9-]+\.js\?v=)[^"']+/g, '$1' + version));
}

function rewriteReadme(version) {
  const before = read(README_MD);
  if (!/^# SensZone（灵敏域）v/i.test(before)) throw new Error('README.md 标题缺少版本号');
  fs.writeFileSync(README_MD, before.replace(/^(# SensZone（灵敏域）)v[\d.]+/m, '$1v' + version));
}

function rewritePackageJson(version) {
  const before = read(PACKAGE_JSON);
  if (!/"version"\s*:\s*"[^"]+"/.test(before))
    throw new Error('package.json 中未找到 version 字段');
  fs.writeFileSync(
    PACKAGE_JSON,
    before.replace(/("version"\s*:\s*")[^"]+(")/, '$1' + version + '$2'),
  );
}

function check() {
  const v = versionFromVersionJs();
  const problems = [];
  const html = read(INDEX_HTML);
  const params = [...html.matchAll(/src\/[a-z0-9-]+\.js\?v=([^"']+)/g)].map((m) => m[1]);
  if (params.length === 0) problems.push('index.html 没有任何 ?v= 参数');
  const distinct = [...new Set(params)];
  if (distinct.length > 1) problems.push('index.html 存在多个不同 ?v= 值：' + distinct.join(', '));
  if (distinct.length === 1 && distinct[0] !== v)
    problems.push('index.html ?v=' + distinct[0] + ' ≠ version.js ' + v);
  if (
    html.indexOf('src/version.js') === -1 ||
    html.indexOf('src/version.js') > html.indexOf('src/math.js')
  ) {
    problems.push('index.html 未把 src/version.js 作为第一个脚本');
  }
  const title = read(README_MD).match(/^# SensZone（灵敏域）v([^ \n]+)/m);
  if (!title) problems.push('README.md 标题缺少版本号');
  else if (title[1] !== v) problems.push('README.md 标题 v' + title[1] + ' ≠ version.js ' + v);
  const pkg = read(PACKAGE_JSON).match(/"version"\s*:\s*"([^"]+)"/);
  if (!pkg) problems.push('package.json 缺少 version 字段');
  else if (pkg[1] !== v) problems.push('package.json version ' + pkg[1] + ' ≠ version.js ' + v);
  if (problems.length) {
    console.error('版本不一致：\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('版本一致：v' + v + '（version.js / index.html ?v= / README 标题 / package.json）');
}

const arg = process.argv[2];
if (arg === '--check') {
  check();
} else if (arg && /^\d+\.\d+/.test(arg)) {
  rewriteVersionJs(arg);
  rewriteIndexHtml(arg);
  rewriteReadme(arg);
  rewritePackageJson(arg);
  console.log('已统一版本号：v' + arg);
  check();
} else {
  console.error('用法：node scripts/bump-version.mjs <版本号> | --check');
  process.exit(2);
}
