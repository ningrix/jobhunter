---
name: jobhunter-diagnose-resume
description: 简历诊断与优化建议。当用户要求「诊断简历」「给简历打分」「优化简历」「看看简历有什么问题」时使用。读取本地简历文件（PDF/MD/TXT），解析为结构化内容后按 JobHunter 评分体系输出 0-100 分、问题清单与逐条改写建议，全程严禁编造。
---

# 简历诊断

给用户的一份简历做结构化诊断：解析 → 打分 → 问题清单 → 逐条改写建议。

## 第 1 步：获取简历

- 用户提供文件路径时，直接读取（支持 PDF / Markdown / 纯文本）。
- `.docx` 无法直接读取：请用户粘贴文本内容，或另存为 PDF 后再给路径。
- 用户未给路径时先询问，不要猜测文件位置。

## 第 2 步：解析为结构化简历

把简历原文解析为以下 JSON 结构（与 Web 版 `ResumeContent` 同源）：

```jsonc
{
  "basics": { "name": "", "phone": "", "email": "", "city": "", "title": "求职意向岗位", "summary": "" },
  "summary": "个人优势概述，可为空字符串",
  "skills": ["技能名"],
  "experience": [{ "company": "", "title": "", "start": "YYYY-MM", "end": "YYYY-MM 或 至今", "highlights": ["工作亮点，尽量量化"] }],
  "education": [{ "school": "", "major": "", "degree": "大专|本科|硕士|博士", "start": "", "end": "" }],
  "projects": [{ "name": "", "role": "", "description": "", "highlights": [] }]
}
```

解析规则（每条都是硬约束）：

1. 日期一律归一化为 YYYY-MM：「2021.3」「2021年3月」→ 2021-03；「至今/now/present」→ 至今；只有年份时月份补 01。
2. experience 一段工作一条：同公司多段经历拆成多条；实习经历也计入；不要把教育经历混进 experience。
3. degree 只能取 大专|本科|硕士|博士：「专科」→大专、「研究生」→硕士，无法判断留空。
4. skills 只提取明确的技能/工具/证书关键词（如 Java、SQL、Excel、Photoshop、日语N2），每项 2-12 字并去重；不要把整句职责描述当技能。
5. highlights 保留带数字的成果（如「耗时从 40 分钟降到 10 分钟」），每条一句话最多 4 条；没有量化信息就客观概括，禁止编造数字。
6. 忽略页眉页脚、水印、乱码、模板广告；phone/email 只取原文真实值，取不到留空。
7. city 取期望工作城市或现居城市；title 取求职意向，原文没有就留空。
8. 原文信息不足时对应字段留空字符串或空数组，严格禁止编造任何内容。

## 第 3 步：诊断

以资深简历顾问视角诊断（可顺带询问目标岗位，未指定则按通用标准）：

```jsonc
{
  "score": "0到100的整数",
  "issues": ["存在的问题，如：经历缺少量化数据"],
  "suggestions": [{ "section": "basics|summary|skills|experience|education|projects", "before": "原文", "after": "建议改写后的文本", "reason": "修改理由" }]
}
```

**硬性约束：只能基于原文信息提供建议，严禁编造经历、数据或技能。**

## 第 4 步：呈现给用户

用可读格式汇报（不要甩裸 JSON）：总分与一句话总评 → 问题清单（按严重度排序）→ 建议表格（原文 → 建议改写 → 理由），并提醒用户**逐条采纳，改写内容必须与真实经历核对**。

示例输出（结构示意）：

```json
{
  "score": 62,
  "issues": ["工作亮点缺少量化数据，如「优化了查询性能」未说明提升幅度", "个人优势概述为空，缺少核心卖点提炼"],
  "suggestions": [
    { "section": "experience", "before": "负责订单系统的性能优化，查询速度有提升", "after": "负责订单系统查询性能优化，通过索引重构将 P95 查询耗时从 1.2s 降至 180ms（此处数字仅为示例格式，必须使用用户原文中的真实数据）", "reason": "补齐量化数据，用真实数字支撑成果表达" }
  ]
}
```

## 深度模式（可选）

以上是零安装的 CLI 轻体验。若需要**投递看板、进度持久化、Discovery 权重调节、Agent 半自动投递与全链路审计**，请启动完整 Web OS：

```bash
git clone https://github.com/ningrix/jobhunter && cd jobhunter && npm install && npm run db:seed && npm run dev
```

或直接用 [Codespaces 一键体验](https://codespaces.new/ningrix/jobhunter?quickstart=1)。本技能产出的 JSON 与 Web 版数据结构同源（见 `src/shared/types.ts`），可直接粘贴给 Web 版作为导入/参考材料。
