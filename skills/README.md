# JobHunter Skills — 装个 skill 即用

六个求职轻场景，零安装、零 API key、零数据库：AI CLI（Claude Code / ZCode 等）自带的模型就是运行时。评分规则与防编造约束和 [JobHunter Web 版](https://github.com/ningrix/jobhunter)同源（`src/server/core/match-scorer.ts` / `src/server/ai/prompts.ts`）。

## 六个入口

| Skill | 用途 | 一句话 |
|---|---|---|
| `jobhunter-diagnose-resume` | 简历诊断 | 0-100 分 + 问题清单 + 逐条改写建议，严禁编造 |
| `jobhunter-parse-jd` | JD 解析 | 招聘信息 → 结构化 JSON（岗位/薪资/加权技能） |
| `jobhunter-job-match` | 岗位匹配 | 确定性五维评分（脚本计算）+ AI 优势/差距/风险解读 |
| `jobhunter-tailor-resume` | 简历定制 | 关键词覆盖 + 差距四分类 + 带溯源证据的措辞建议 |
| `jobhunter-greeting` | 打招呼语 | ≤60 字开场白，只用真实事实 |
| `jobhunter-radar` | 职位雷达 | 抓公开列表页 → 防编造抽取 → 条件过滤，只读聚合不代投 |

## 安装

**Claude Code（手动，当前推荐）：**

```bash
git clone https://github.com/ningrix/jobhunter
mkdir -p ~/.claude/skills
cp -r jobhunter/skills/diagnose-resume jobhunter/skills/parse-jd jobhunter/skills/job-match jobhunter/skills/tailor-resume jobhunter/skills/greeting jobhunter/skills/radar ~/.claude/skills/
```

**ZCode：** 同上，目标目录换成 `~/.zcode/skills/`。

**Claude Code plugin marketplace：** 仓库根已带 `.claude-plugin/plugin.json`，marketplace 提交与 `/plugin` 安装命令待验证（NEEDS_VERIFICATION），验证通过后此处会更新为一行安装。

## 与 Web 版的关系（分层，不是替代）

- **skill 层（本目录）**：单次轻任务——诊断、解析、匹配、定制、打招呼。AI CLI 的模型即运行时，产出 JSON 与 Web 版数据结构同源。
- **Web OS 层**：需要**持久化**（投递看板/流水线/提醒）、**多用户与鉴权**、**Discovery 权重调节**、**Agent 半自动投递与审计**、**AI 用量核算**时使用：`npm install && npm run db:seed && npm run dev`，或 [Codespaces 一键体验](https://codespaces.new/ningrix/jobhunter?quickstart=1)。

每个 SKILL.md 尾部都有同样的「深度模式」引导，形成轻 → 重的转化漏斗。
