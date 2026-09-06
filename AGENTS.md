# AGENTS.md — SensZone 开发约定

面向 AI 代理与新贡献者的项目约定。项目定位与术语先读 `README.md`，设计依据读 `docs/DEVELOPMENT.md`。

## 硬性约定

1. **零运行时依赖**：`src/` 与 `index.html` 不得引入任何第三方库/CDN/构建步骤。纯 Canvas 2D + 原生 JS（classic script，非 module）。
2. **IIFE + 全局命名空间**：所有 `src/*.js` 用 IIFE 包裹，挂载到 `SZ` 命名空间，写法参照 `src/math.js` 首尾：

   ```js
   (function (SZ) {
     'use strict';
     // ...
     SZ.exportedName = exportedName;
   })(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
   ```

3. **UI 文案必须走 `src/i18n.js`**：zh-CN / en 两份字符串同步增删，禁止在 `ui.js`/任务模块里硬编码用户可见文案。
4. **改动后必须跑测试并全部 PASS**：

   ```
   node test/smoke.cjs   # 冒烟：数学/算法/渲染契约 + 全 src 语法守卫
   node test/flow.cjs    # 全会话集成：flick 命中流 / 脱靶流 / 双任务流
   ```

5. **发版流程**：版本号单源在 `src/version.js` 的 `SZ.VERSION`（详见下文"发版约定"）。

## 代码风格

- 单引号、printWidth 100（与 `.prettierrc` 一致）；`node test/*.cjs` 属 Node 环境，`src/` 属 browser 环境。
- 渲染路径禁止每帧分配临时数组/对象（GC 抽帧教训，360Hz 下必现）；共享可变对象复用。
- 经典 script 加载顺序敏感：`version.js` 必须是 `index.html` 第一个脚本。

## 发版约定

- 运行 `node scripts/bump-version.mjs <版本号>`（如 `1.4`）统一更新：`index.html` 全部 `?v=` 参数、`README.md` 标题版本号。
- `--check` 模式校验各处版本一致（不一致退出码 1），CI 可用。
- 发新版需手动同步 `sw.js` 顶部的缓存版本号（注释标明与 `SZ.VERSION` 对应）。

## CI

本地命令与 CI 一致：`npm run lint`（eslint + prettier --check）+ `npm test`（smoke + flow 顺序执行）。GitHub Actions 见 `.github/workflows/ci.yml`。
