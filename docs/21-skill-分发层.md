# 21 - Skill 分发层（S1）：装个 skill 即用

> 立项依据：[竞品格局研究报告](research_jobhunter-competitors_20261005.md)（2026-10-05）——JobHunter 的第一差距是**分发形态**（全栈安装门槛 vs 竞品「装个 skill 即用」），而非功能。
> 本阶段定调：**skill = 引流层（轻体验），Web OS = 深度层（重能力）**，分层承接而非替代。
> 与 [V4 路线图](20-V4-路线图定稿.md)的关系：S1 与 V4.1（Ranking Engine）**并行**，改动面零交集。

## 1. 交付内容（2026-10-05）

新增目录，`src/` 现有代码零改动：

```
.claude-plugin/plugin.json        # Claude Code plugin 清单（career-ops 同款布局）
skills/
  README.md                       # 安装说明 + 五入口一览 + 分层关系
  diagnose-resume/SKILL.md        # 简历诊断（读本地 PDF/MD/TXT → 结构化 → 打分/建议）
  parse-jd/SKILL.md               # JD 结构化解析（JobStructured 同构）
  job-match/                      # 岗位匹配
    SKILL.md                      #   流程：解析 → 脚本评分 → AI 解读（评分已定不重打分）
    scripts/match-scorer.mjs      #   规则评分器零依赖移植（stdin JSON → stdout JSON）
  tailor-resume/SKILL.md          # 定制分析（关键词覆盖 + 差距四分类 + 带溯源改写）
  greeting/SKILL.md               # 打招呼语（≤60 字、只用真实事实）
```

新增测试（25 个用例，全绿）：

- `src/server/core/__tests__/match-scorer-parity.test.ts`（11）：mjs 移植版与 TS 版用 11 组种子输入对拍，逐字段一致（含权重归一化、全 0 回落、非法权重忽略、薪资覆盖优先级等分支）。
- `src/server/ai/__tests__/skill-docs.test.ts`（14）：五个 SKILL.md 的 frontmatter 契约、示例输出 JSON 对 `shared/types` 同构校验、tailor 示例的溯源约束校验（evidence 必须指向 matched/partial）、greeting ≤60 字、深度模式引导段落、plugin 清单存在性。

## 2. 关键决策

### 2.1 为什么「即用」成立：模型即运行时

Web 版 AI 能力 = 提示词（`prompts.ts` 7 个场景）+ 确定性评分（`match-scorer.ts` 纯函数）+ 少量代码。放进 skill 后：

- **模型由 AI CLI 自带**（Claude Code / ZCode 的模型即运行时）——用户不需要 API key、不需要 gateway、不需要 DB；
- 7 个 prompt 场景中的 5 个（诊断/JD 解析/匹配解读/定制/打招呼）是「LLM 拿文本 → 出结构化 JSON」，指令可直接平移；
- 简历解析在 skill 形态下由 CLI 原生读 PDF 完成，`pdf-parse`/`mammoth` 依赖整体省掉。

### 2.2 match-scorer 双实现的取舍

skill 必须脱离 `node_modules` 自包含，因此评分器**复制移植**为 `match-scorer.mjs`（约 200 行纯函数），不是共享导入。代价是双实现漂移风险——守门机制：

- 对拍测试 11 组种子逐字段对比，任一侧改动必须双向同步（测试文件头部有醒目注释）；
- 后续 V4.1 若改评分内核（如混合排序），默认权重路径的行为变化必须同步 mjs 并扩对拍种子。

### 2.3 禁编造约束逐字平移

JobHunter 的产品红线（parse_resume 8 条规则、tailor 四条硬约束、greeting 三条约束、「评分已定不重打分」）**逐字平移**进 SKILL.md，文档契约测试锁定 tailor 的 evidence 溯源约束。skill 形态没有代码层兜底，约束完全靠指令强度——这是与 Web 版的诚实差异，不是等价替换。

### 2.4 能力边界：skill 层 vs Web 层

| 能力 | skill 层 | Web 层 | 说明 |
|---|---|---|---|
| 简历诊断 / JD 解析 / 匹配解读 / 定制 / 打招呼 | ✅ | ✅ | 同一套提示词与评分规则 |
| 确定性五维评分 | ✅（脚本） | ✅（TS） | 对拍测试守门 |
| 跨会话持久化 / 投递看板 / 提醒 | ❌ | ✅ | 需要 DB，20 张表 |
| Discovery 权重调节 UI | ❌（对话式传参） | ✅（滑杆实时重排） | |
| Agent 半自动投递 + 审计 | ❌ | ✅ | 安全状态机 + agent_events |
| 多用户 / 鉴权 / AI 用量核算 | ❌ | ✅ | |
| 评分确定性（同一输入同分） | ✅ | ✅ | skill 的 AI 部分（解读）不受影响 |
| 职位雷达（公开列表页聚合） | ✅（2026-10-06 追加：只读聚合+防编造，不入库） | ✅（入库+三级去重+审计） | 同一套 radar_extract 防编造约束 |

每个 SKILL.md 尾部固定「深度模式」引导（三步启动或 Codespaces 一键），形成轻 → 重的转化漏斗；主 README 顶部已加引导段。

### 2.5 不做清单（S1）

- ~~职位雷达~~：**S1 时不带入（合规边界未讨论）；2026-10-06 用户拍板加入 → `skills/radar/` 已交付**（合规边界照搬 Web 版哲学：只读公开页、只聚合信息、绝不代投、URL 防编造硬约束逐字平移、单页克制不爬站；差异=不入库改为会话内去重+本地存档，CLI 模型即引擎故无需自备 API Key）；
- **Agent 投递 / 看板等 DB 能力**：Web 层职责，不复制；
- **plugin marketplace 提交**：机制 NEEDS_VERIFICATION，S1 只走手动安装路径（`skills/README.md` 有说明），验证后更新为一行安装；
- **独立 skills 仓库**：用户已拍板同仓库（career-ops 布局），README 流量直接转化。

## 3. 已知风险（如实记录）

1. **双实现漂移**：靠对拍测试守门；若只在 mjs 侧修 bug 不同步 TS（或反过来），测试会红——但前提是测试被执行，CI 已覆盖。
2. **指令约束的强度**：skill 形态下「禁编造」无代码兜底，弱模型可能漂移；文档契约只能锁住示例，不能锁住运行时行为。缓解：约束逐字平移保持原强度，呈现步骤强制提醒用户核对真实经历。
3. **`.docx` 读取**：CLI 原生不读 docx，SKILL.md 已明确引导用户转 PDF 或粘贴文本，不引入依赖。
4. **marketplace 安装命令未验证**：手册路径（复制到 `~/.claude/skills/`）为主，marketplace 一行安装待验证后替换。

## 4. S2 展望（未排期，不承诺）

- **skill 产出 → Web 导入**：JSON 已同构，Web 版可提供「粘贴 skill 输出建档」入口，闭环轻 → 重漏斗；
- **统计与召回**：skill 内可选匿名使用上报（默认关，隐私优先），为录用墙提供素材入口；
- **录用墙联动**：用户在 skill 内拿到 offer → 引导去 Web 仓库开 HIRED issue（借鉴 career-ops 的零成本社会证明机制）。

## 5. 完成标准核对

- [x] match-scorer.mjs 与 TS 版对拍 11 组种子逐字段一致
- [x] 五场景 SKILL.md 示例输出通过 shared/types 同构校验（zod，14 用例）
- [x] mjs 冒烟：标准输入评分正确（权重归一化路径 98.9 与手算一致）
- [ ] **Claude Code 实装冒烟（需人工）**：复制五目录到 `~/.claude/skills/` → 跑 diagnose-resume（demo 简历）+ parse-jd（真实 JD）+ job-match 全链路——AI CLI 行为本机无法自动化，留人工验收
- [x] vitest 全绿（279 基线 + 25 新增）+ tsc 过
- [x] 禁编造约束逐字平移（tailor 溯源约束有测试断言）
