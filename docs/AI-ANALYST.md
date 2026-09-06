# SensZone 报告 JSON × AI 分析师指南

把本软件导出的 JSON 报告喂给你自己的 AI 助手（ChatGPT / Claude / 本地模型等），让它替你解读数据。本文档包含：使用步骤、**可直接复制的提示词**、以及字段速查表。

## 使用步骤

1. 在报告页点击"导出 JSON"得到 `senszone-report-<时间戳>.json`
2. 复制下方提示词全文，发给你的 AI
3. 把 JSON 内容粘贴在提示词后面（文件小可直接粘贴；超过模型上下文时只粘贴 `report` 部分即可，`records`/`trackResults` 是原始逐试次数据，选贴）

---

## 可直接复制的提示词

```text
你是 FPS 鼠标灵敏度测量数据的分析助手。我会给你一份 SensZone（灵敏域）导出的 JSON 测量报告，
请严格按下面的方法论与规则解读，最后按要求格式输出。

【测量原理背景】
- cm/360：鼠标移动 360° 所需的桌面距离，数值越大灵敏度越低。
- 测试为双任务：离散甩枪（flick，单次限时 1.5s，移动起始计时无反应时惩罚）+
  平滑轨迹跟踪（tracking，15s，测 RMS 偏差/在靶率/准星滞后 ms）。
- 每个 session 测 6 个灵敏度条件（锚点 ×0.3/0.44/0.67/1.0/1.5/2.25 对数间隔），每条件丢弃前 1/3 热身试次。
- 完成时间 MT 经 ANCOVA 难度归一（ID=3.0 bits 基准），二次拟合后给出最优 cm/360 与
  置信区间，并检测"平台区间"（成绩 ≤ 最优 ×1.08 的等价带）——结论以平台为准而非单点。
- 方法论对齐论文：Boudaoud et al.《Mouse Sensitivity Effects in First-Person Targeting Tasks》。

【解读硬规则——逐条遵守】
1. 平台区间（plateau.lo–hi）优先于点估计（global.optCm360）：平台内的档位统计等价，
   不要在平台内区分"最好"。
2. 若 anchorCm360（用户当前灵敏度）落在平台内：结论是"当前设置已最优"，只可建议微调，
   不可建议大改。
3. 数据不足自动降级：global.method 不是 "quadratic"（如 "empirical"/"insufficient"）
   表示拟合失败或样本过少，此时只能描述各条件原始成绩，不得给出灵敏度建议。
4. 置信区间检查：ci 宽度超过 optCm360 ×0.25 时说明波动大，结论只谈方向不谈数值。
5. rawMode 不是 "raw" 表示鼠标输入可能受系统加速污染，此警告优先级最高，
   应建议修复输入链路后重测，而不是解读数据。
6. warnings 数组非空时（如命中率 <85%），数据质量问题优先于任何灵敏度结论。
7. adjMT 已按 ID=3.0 bits 归一，可跨灵敏度档比较；meanMT（原始 MT）不可跨档比较。
8. 验证时间（meanVerify，最后一次移动结束→开枪）随灵敏度上升 = 论文机制：
   高敏代价来自确认/犹豫时间增长而非转动变慢；若各档验证时间接近，说明风格主导。
9. meanSubmov >1.5 提示二次瞄准频繁；overshootRate 高且 meanSignedErr 为正 = 过冲主导，
   为负 = 欠冲主导（低敏典型）。
10. 跟枪：lagMs 随灵敏度单调上升说明高敏跟不稳；rms 最小的档位是跟枪最优档。
11. 跨会话比较：两次报告的 anchorCm360 或 settings.sens 不同时，optCm360 绝对值不可直接
    比较（测的是不同锚点下的相对曲线），只能比较"平台是否包含锚点"、平台宽度、命中率、
    验证时间等锚点无关指标。
12. 建议幅度：任何灵敏度调整建议单次不超过 10%，并说明预期方向（如"提高灵敏度以缩短
    180° 转身桌面距离"）；连续微调优于一步到位。

【输出格式】
1. 数据质量判定：rawMode / warnings / 命中率 / 样本量 / 拟合方法，先说能不能信。
2. 平台判定：甩枪平台 + 跟枪平台（含 reliable 标志），锚点是否在平台内。
3. 风格画像：flickStyle（swipe/mixed/land）与 meanSwip、验证/停顿时间的解读。
4. 跟枪诊断：rms / onTargetPct / lagMs 随灵敏度的趋势。
5. 建议：最多 3 条，每条给出依据；若数据不支持改动，明确说"保持现状"。
禁止：忽视警告直接下结论；用 meanMT 跨档比较；基于单会话建议大幅改变灵敏度。
```

---

## JSON 字段速查表

导出结构：`{ report, records, trackResults }`。

### report（聚合报告，核心）

| 字段 | 含义 |
|---|---|
| ts | 报告时间戳（ms） |
| settings | game / aspect / customFov / dpi / sens / yaw / trialsPerCond / padWidthCm / sessionId——测试时的用户配置 |
| anchorCm360 | 用户当前灵敏度的 cm/360（锚点） |
| rawMode | 输入模式：`raw`=原始输入（可信）；`adjusted`=可能受系统加速污染 |
| trialsPerCond | 每条件试次数 |
| conds | 逐条件聚合统计（见下表） |
| global | 全域拟合：method（quadratic=成功 / empirical=降级 / insufficient=数据不足）、optCm360（最优点估计）、ci（95% 置信区间 [上,下]，注意区间方向为降序）、ciWide（更宽的保守区间）、curveParams（二次曲线参数）、n |
| plateau | 曲线平台：lo–hi（cm/360 等价带）、bestCm360、conds（构成平台的档位） |
| buckets | 按 ID 分桶（low 近战 / mid 中距 / high 远程）的独立拟合，结构与 global 相同 |
| betaPerBit | ANCOVA 难度斜率（每 bit 的 MT 增量 ms） |
| flickStyle | 甩枪风格：meanSwip（swipiness 均值）+ style（swipe 甩中即打 / mixed / land 停稳再打） |
| warnings | 警告数组（key + vars），非空时数据质量存疑 |
| counts | { trials: 有效试次, hits: 命中数 } |
| track | 跟枪任务报告（见下），仅双任务/跟枪模式存在 |

### report.conds[]（逐条件）

| 字段 | 含义 |
|---|---|
| idx / mult | 条件序号 / 锚点倍率 |
| cm360 / gameSens | 该条件对应的 cm/360 与换算游戏灵敏度 |
| n / nRaw / hitRate | 归一后样本数 / 原始样本数 / 命中率 |
| meanMT / sdMT | 原始平均 MT 与标准差（**不可跨档比较**） |
| adjMT / adjSE | ANCOVA 归一后 MT（**跨档可比**）及其标准误 |
| meanTp | 吞吐量 ID/MT（bit/s，Shannon 式） |
| meanSignedErr | 带符号端点误差（°，正=过冲 负=欠冲） |
| overshootRate | 过冲试次占比 |
| meanSubmov | 平均子动作数（论文 Algorithm 1；>1.5 提示二次瞄准频繁） |
| meanSwip | swipiness（开枪时刻/首子动作速度峰值时刻 ÷2；≥1 ≈ 停稳再打） |
| meanVerify / meanPause | 验证时间（末次移动结束→开枪）/ 停顿时间（子动作间隔总和），ms |
| meanId | 该条件实际平均 ID（bits） |
| used | 是否参与拟合 |

### report.track（跟枪）

| 字段 | 含义 |
|---|---|
| reliable | 可靠性门槛（置信区间宽度比）是否通过；false 时跟枪结论仅参考 |
| global / plateau | 同甩枪（最优 cm/360 与平台） |
| conds[].rms | RMS 瞄准偏差（°，越小越好） |
| conds[].onTargetPct | 在靶时间占比 |
| conds[].lagMs | 准星相对目标的速度互相关滞后（ms，正=跟得慢） |
| conds[].blocks | 逐秒块统计（用于 RMS 曲线图） |

### records[]（逐试次原始数据，可选分析）

condId、trialIdx、cond、sens、target（widthDeg/azDeg/elDeg/idBits）、mtMs（命中耗时，miss 为 null）、effMs、hit、missReason（脱靶原因）、endpointErrDeg / signedErrDeg（落点误差）、submovements、firstPeakVel、swipiness、verificationMs、pauseMs、waitMs。

### trackResults[]（跟枪逐条件原始）

condId、cond、sens、rms、onTargetPct、lagMs、blocks、nSamples、kind（warmup/正式）。
