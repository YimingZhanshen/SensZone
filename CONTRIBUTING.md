# 贡献指南

感谢关注 SensZone。基于 LICENSE 2.1 的"上游贡献优先"条款，改进首选以 Pull Request 提交回本仓库（而非另立分支）；提交 PR 即表示同意将该贡献按 [LICENSE](LICENSE) 许可原作者合并与分发。

## 开始之前

1. 阅读 [AGENTS.md](AGENTS.md)——项目硬性约定：零运行时依赖、IIFE + `SZ` 命名空间、UI 文案必须走 `src/i18n.js`（zh-CN/en 双份同步）、渲染路径禁止每帧分配临时对象。
2. 较大的改动先开 Issue 描述动机，避免做出与项目方向冲突的无效功。

## 开发流程

1. Fork → 建分支（`feat/xxx` 或 `fix/xxx`）。
2. 本地验证（三关全过再提 PR）：

   ```
   npm run lint          # eslint + prettier --check，0 error
   node test/smoke.cjs   # 冒烟 + 语法守卫，全 PASS
   node test/flow.cjs    # 全会话集成，全 PASS
   ```

3. UI 可见文案改动必须同步 `src/i18n.js` 的 zh-CN 与 en 两份字符串。
4. **不要修改** `src/version.js`、`index.html` 的 `?v=` 参数、`sw.js` 缓存版本号——由维护者统一 bump。
5. 新增算法/纯函数请在 `test/smoke.cjs` 补断言；会话流程改动请确认 `test/flow.cjs` 覆盖。

## PR 规范

- 一个 PR 聚焦一件事，描述里写清动机与验证方式（跑过哪些测试、截图或录屏更好）。
- 中文或英文均可。
- 首次贡献者请在 PR 里简单介绍自己（可选）。

## 社区约定

- Issue / PR 保持尊重、具体、对事不对人；提问前先搜索已有 issue。
- 授权与商用边界见 [LICENSE](LICENSE)。
