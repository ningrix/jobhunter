---
name: jobhunter-tailor-resume
description: 针对目标职位的简历定制分析。当用户要求「针对这个岗位定制简历」「分析简历和 JD 的关键词覆盖」「帮我改简历措辞」时使用。输出关键词覆盖（matched/partial/missing）、差距四分类、排序建议与带溯源证据的措辞建议——每条改写必须注明依据的 JD 关键词，严禁把缺失技能写进步历。
---

# 简历定制（含溯源）

针对目标职位分析简历的关键词覆盖与差距，产出可逐条采纳的改写建议。**核心原则：只做措辞优化与事实强调，不发明任何新经历。**

## 第 1 步：准备输入

- 简历：读取用户文件并解析为 ResumeContent（规则同 `jobhunter-diagnose-resume` 第 2 步）。
- 目标职位：解析 JD 为 JobStructured（规则同 `jobhunter-parse-jd`）。

## 第 2 步：覆盖分析 + 改写建议

你是简历定制顾问。针对目标职位分析简历的关键词覆盖与差距，并给出改写建议。输出结构：

```jsonc
{
  "keywordCoverage": [{ "keyword": "JD 中的技能/要求关键词", "status": "matched|partial|missing" }],
  "gapAnalysis": [{ "category": "presentation|weak_evidence|adjacent_skill|true_gap", "keyword": "", "suggestion": "" }],
  "reorderSuggestions": ["排序调整建议，如：把与目标岗位最相关的经历前置"],
  "wordingSuggestions": [{ "section": "summary|skills|experience|projects", "before": "简历原文片段", "after": "仅对该片段的措辞优化", "reason": "理由", "evidence": { "keyword": "驱动该改写的 JD 关键词", "status": "matched|partial" } }]
}
```

**硬性约束（每条都必须遵守）：**

1. after 只能是对 before 的措辞优化、顺序调整或已有事实的强调，严禁引入 before 和简历中都不存在的公司、项目、技能、数字。
2. missing 关键词只能进 gapAnalysis 建议学习或补充真实经历，严禁写入 wordingSuggestions。
3. 每条 wordingSuggestions 必须带 evidence，指向 keywordCoverage 中 matched 或 partial 的关键词（missing 严禁作为 evidence），让用户能溯源这条建议凭什么提出。

差距四分类含义：`presentation`=有事实但表述不到位；`weak_evidence`=有相关经历但证据太弱；`adjacent_skill`=有相邻技能可迁移；`true_gap`=真实缺口（只能建议学习，禁止改写掩盖）。

## 第 3 步：呈现给用户

关键词覆盖表（✓ matched / △ partial / ✕ missing）→ 差距清单（按四分类分组，明确告诉用户哪些是「换个说法」、哪些是「真要学」）→ 改写建议列表（原文 → 建议 → 依据关键词徽章），提醒逐条采纳并与真实经历核对。

示例输出：

```json
{
  "keywordCoverage": [
    { "keyword": "Java", "status": "matched" },
    { "keyword": "Kafka", "status": "partial" },
    { "keyword": "Kubernetes", "status": "missing" }
  ],
  "gapAnalysis": [
    { "category": "true_gap", "keyword": "Kubernetes", "suggestion": "简历与经历中均无容器化经验，短期可通过个人项目实操 K8s 部署补齐，切勿在简历中虚构" },
    { "category": "weak_evidence", "keyword": "Kafka", "suggestion": "有相关经历但缺少量级与场景细节，建议在 highlights 中补充真实吞吐数据增强说服力" }
  ],
  "reorderSuggestions": ["将与交易链路消息处理最相关的经历前置到 experience 首位"],
  "wordingSuggestions": [
    { "section": "experience", "before": "参与订单系统的消息队列模块，用了 Kafka", "after": "使用 Kafka 搭建订单系统消息管道，日均处理消息 200 万条（数字须取自简历原文，原文没有则保留原表述）", "reason": "将技术栈与量级数据前置，直接呼应 JD 对高并发消息处理的要求", "evidence": { "keyword": "Kafka", "status": "partial" } }
  ]
}
```

## 深度模式（可选）

以上是零安装的 CLI 轻体验。Web 版在同样的约束体系上增加了**逐条采纳/拒绝/编辑后采纳的交互、字符级 diff 对照与自动应用**。需要的话启动完整 OS：

```bash
git clone https://github.com/ningrix/jobhunter && cd jobhunter && npm install && npm run db:seed && npm run dev
```

或直接用 [Codespaces 一键体验](https://codespaces.new/ningrix/jobhunter?quickstart=1)。本技能产出的 JSON 与 Web 版数据结构同源（见 `src/shared/types.ts`），可直接粘贴给 Web 版作为导入/参考材料。
