---
name: jobhunter-parse-jd
description: 职位描述（JD）结构化解析。当用户要求「解析这个 JD」「提取职位要求」「把招聘信息转成 JSON」时使用。将粘贴或文件中的 JD 解析为结构化 JSON（岗位/城市/薪资/年限/学历/加权技能要求），与 JobHunter Web 版 JobStructured 结构同源，是岗位匹配与简历定制的前置步骤。
---

# JD 解析

把一段职位描述解析为结构化 JSON，供岗位匹配（`jobhunter-job-match`）与简历定制（`jobhunter-tailor-resume`）复用。

## 输入

用户粘贴的 JD 文本，或包含 JD 的文件路径（读取后取正文）。若用户给的是招聘页链接，请用户粘贴页面文本——本技能不抓取网页。

## 解析规则

你是职位描述解析引擎。把 JD 解析为以下 JSON 结构，**只输出 JSON 本身作为中间产物**：

```jsonc
{
  "title": "岗位名称",
  "city": "工作城市",
  "salaryMin": "数字(K/月，如 15 表示 15K)",
  "salaryMax": "数字(K/月)",
  "experienceYearsMin": "数字(最低工作年限，无要求为 0)",
  "education": "学历要求（不限|大专|本科|硕士|博士）",
  "skills": [{ "name": "技能名", "weight": "1到5(5为核心要求)" }],
  "responsibilities": ["岗位职责"],
  "requirements": ["任职要求"]
}
```

补充约束：

1. 薪资「25-40K」→ salaryMin 25 / salaryMax 40；「面议」或未标注 → 两个字段留空（不要猜）。
2. 「3-5 年经验」→ experienceYearsMin 取下限 3。
3. skills 的 weight 按 JD 中的强调程度判断：核心/精通=5，熟练=3-4，了解/加分项=1-2。
4. JD 没提的字段留空或空数组，禁止编造。

## 呈现给用户

除 JSON 外，用 3-5 行可读摘要汇报：岗位与城市、薪资带、经验学历门槛、核心技能（按权重排序）。用户需要 JSON 时再原样输出。

示例输出：

```json
{
  "title": "资深 Java 开发工程师",
  "city": "上海",
  "salaryMin": 25,
  "salaryMax": 40,
  "experienceYearsMin": 5,
  "education": "本科",
  "skills": [
    { "name": "Java", "weight": 5 },
    { "name": "MySQL", "weight": 4 },
    { "name": "Kafka", "weight": 3 },
    { "name": "Kubernetes", "weight": 2 }
  ],
  "responsibilities": ["负责交易链路核心服务的架构设计与演进", "主导高并发场景下的性能优化与稳定性治理"],
  "requirements": ["5 年以上 Java 开发经验", "熟悉分布式系统设计，有大规模线上系统治理经验"]
}
```

## 深度模式（可选）

以上是零安装的 CLI 轻体验。若需要**投递看板、进度持久化、Discovery 权重调节、Agent 半自动投递与全链路审计**，请启动完整 Web OS：

```bash
git clone https://github.com/ningrix/jobhunter && cd jobhunter && npm install && npm run db:seed && npm run dev
```

或直接用 [Codespaces 一键体验](https://codespaces.new/ningrix/jobhunter?quickstart=1)。本技能产出的 JSON 与 Web 版数据结构同源（见 `src/shared/types.ts`），可直接粘贴给 Web 版作为导入/参考材料。
