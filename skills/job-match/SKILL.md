---
name: jobhunter-job-match
description: 岗位匹配度评估。当用户要求「这个岗位和我匹配吗」「评估匹配度」「我的简历适不适合这个职位」时使用。先解析 JD 与简历，再用与 JobHunter Web 版同源的规则评分器（五维加权：技能 40%/经验 25%/学历 15%/城市 10%/薪资 10%）确定性打分，最后给出优势/差距/风险的结构化解读。评分由脚本计算，AI 只解读不重打分。
---

# 岗位匹配评估

流程：解析 JD → 解析简历 → 规则评分器打分（确定性）→ AI 结构化解读。

## 第 1 步：解析 JD

按 `jobhunter-parse-jd` 的规则把 JD 解析为 JobStructured JSON（学历只能取 不限|大专|本科|硕士|博士；薪资单位 K/月；没提的字段留空，禁止编造）。

## 第 2 步：解析简历

读取用户简历（PDF/MD/TXT；`.docx` 请用户粘贴文本），解析为 ResumeContent JSON，解析规则与 `jobhunter-diagnose-resume` 第 2 步完全一致（日期归一化 YYYY-MM、一段工作一条、skills 只取关键词、**严格禁止编造**）。

## 第 3 步：收集偏好（可选）

询问用户：期望城市 / 期望薪资（K/月）/ 是否要自定义权重。用户没说就用默认权重（技能 40% / 经验 25% / 学历 15% / 城市 10% / 薪资 10%），不要替用户编造期望值。

## 第 4 步：跑规则评分器（确定性打分）

把以下 JSON 通过 stdin 传给本技能目录下的 `scripts/match-scorer.mjs`（零依赖，node >= 18 即可）：

```jsonc
{
  "resume": { /* 第 2 步的 ResumeContent */ },
  "profile": { "expectedCity": "上海", "salaryMin": 15, "salaryMax": 25 },   // 用户没给就传 null
  "job": { "city": "上海", "salaryMin": null, "salaryMax": null, "structured": { /* 第 1 步的 JobStructured */ } },
  "weights": { "skills": 4, "experience": 2, "education": 1, "city": 10, "salary": 1 }  // 可省略
}
```

```bash
cat input.json | node <本技能目录>/scripts/match-scorer.mjs
```

输出为 `MatchRuleResult`：`totalScore`（0-100）、`dimensionScores`（五维分）、`gaps`、`reasons`。

## 第 5 步：结构化解读

你是求职匹配分析师。**基于规则评分结果（评分已定，不要重新打分）与简历/职位信息，给出结构化解读**：

```jsonc
{
  "summary": "2-3 句匹配总结",
  "strengths": ["优势点，如：技能命中 React、TypeScript"],
  "gaps": ["差距点，如：缺少 Docker 经验"],
  "risks": ["风险提示，如：岗位要求 5 年经验，简历约 3 年，面试需准备针对性说明"]
}
```

**解读只能引用评分器输出的事实（gaps/reasons/dimensionScores）与简历原文，不得发明评分器没给出的差距或优势。**

## 呈现给用户

五维评分表（每维分数 + 评分器给的 reason）→ 总分与匹配结论 → 优势 / 差距 / 风险三个清单 → 面试准备建议（针对 gaps 给可执行的补齐动作，标注哪些是表述问题、哪些是真实能力缺口）。

示例输出（第 5 步解读部分）：

```json
{
  "summary": "整体匹配度较高：核心技能命中，经验满足要求；主要短板是缺少容器化经验，面试前建议针对性补齐。",
  "strengths": ["技能命中 Java、MySQL 等 5 项核心要求", "经验 5.6 年，超过岗位 5 年门槛", "城市与薪资区间均与期望重合"],
  "gaps": ["缺少 Docker、Kubernetes 经验（岗位要求容器化部署能力）"],
  "risks": ["岗位强调大规模线上系统治理，简历中缺少流量级数据，建议准备具体案例"]
}
```

## 深度模式（可选）

以上是零安装的 CLI 轻体验。若需要**投递看板、进度持久化、Discovery 权重调节（滑杆实时重排推荐）、Agent 半自动投递与全链路审计**，请启动完整 Web OS：

```bash
git clone https://github.com/ningrix/jobhunter && cd jobhunter && npm install && npm run db:seed && npm run dev
```

或直接用 [Codespaces 一键体验](https://codespaces.new/ningrix/jobhunter?quickstart=1)。本技能产出的 JSON 与 Web 版数据结构同源（见 `src/shared/types.ts`），可直接粘贴给 Web 版作为导入/参考材料。
