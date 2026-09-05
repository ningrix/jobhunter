import type { ResumeContent, JobStructured } from "@/shared/types";

/**
 * 各 AI 场景的 Prompt 模板。输入对象由任务处理器准备，
 * Mock Provider 直接消费 input，OpenAI 兼容 Provider 使用此处生成的 prompt。
 */
export const PROMPTS: Record<string, (input: unknown) => string> = {
  parse_resume: (input) => {
    const { text } = input as { text: string };
    return [
      "你是简历解析引擎。把下面的简历原文解析为 JSON，字段结构如下：",
      `{
  "basics": { "name": "", "phone": "", "email": "", "city": "", "title": "求职意向岗位", "summary": "" },
  "summary": "个人优势概述，可为空字符串",
  "skills": ["技能名"],
  "experience": [{ "company": "", "title": "", "start": "YYYY-MM", "end": "YYYY-MM 或 至今", "highlights": ["工作亮点，尽量量化"] }],
  "education": [{ "school": "", "major": "", "degree": "大专|本科|硕士|博士", "start": "", "end": "" }],
  "projects": [{ "name": "", "role": "", "description": "", "highlights": [] }]
}`,
      "只输出 JSON，不要输出任何其他内容。缺失字段用空字符串或空数组。",
      "",
      "简历原文：",
      text,
    ].join("\n");
  },

  parse_jd: (input) => {
    const { text } = input as { text: string };
    return [
      "你是职位描述解析引擎。把下面的 JD 解析为 JSON，字段结构如下：",
      `{
  "title": "岗位名称",
  "city": "工作城市",
  "salaryMin": 数字(K/月，如 15 表示 15K),
  "salaryMax": 数字(K/月),
  "experienceYearsMin": 数字(最低工作年限，无要求为 0),
  "education": "学历要求（不限|大专|本科|硕士|博士）",
  "skills": [{ "name": "技能名", "weight": 1到5(5为核心要求) }],
  "responsibilities": ["岗位职责"],
  "requirements": ["任职要求"]
}`,
      "只输出 JSON，不要输出任何其他内容。",
      "",
      "JD 原文：",
      text,
    ].join("\n");
  },

  optimize_resume: (input) => {
    const { content, jobTitle } = input as { content: ResumeContent; jobTitle?: string };
    return [
      "你是资深简历顾问。针对下面的简历内容给出诊断与优化建议，目标岗位：" +
        (jobTitle ?? "未指定") +
        "。只输出 JSON：",
      `{
  "score": 0到100的整数,
  "issues": ["存在的问题，如：经历缺少量化数据"],
  "suggestions": [{ "section": "basics|summary|skills|experience|education|projects", "before": "原文", "after": "建议改写后的文本", "reason": "修改理由" }]
}`,
      "注意：只能基于原文信息提供建议，严禁编造经历、数据或技能。",
      "",
      "简历内容 JSON：",
      JSON.stringify(content, null, 2),
    ].join("\n");
  },

  tailor_resume: (input) => {
    const { resume, job } = input as {
      resume: ResumeContent;
      job: { title: string; companyName: string; structured?: JobStructured | null };
    };
    return [
      "你是简历定制顾问。针对目标职位分析简历的关键词覆盖与差距，并给出改写建议。只输出 JSON：",
      `{
  "keywordCoverage": [{ "keyword": "JD 中的技能/要求关键词", "status": "matched|partial|missing" }],
  "gapAnalysis": [{ "category": "presentation|weak_evidence|adjacent_skill|true_gap", "keyword": "", "suggestion": "" }],
  "reorderSuggestions": ["排序调整建议，如：把与目标岗位最相关的经历前置"],
  "wordingSuggestions": [{ "section": "summary|skills|experience|projects", "before": "简历原文片段", "after": "仅对该片段的措辞优化", "reason": "理由" }]
}`,
      "硬性约束：",
      "1. after 只能是对 before 的措辞优化、顺序调整或已有事实的强调，严禁引入 before 和简历中都不存在的公司、项目、技能、数字。",
      "2. missing 关键词只能进 gapAnalysis 建议学习或补充真实经历，严禁写入 wordingSuggestions。",
      "3. 只输出 JSON。",
      "",
      "简历技能：" + resume.skills.join("、"),
      "简历经历：" + JSON.stringify(resume.experience),
      "简历项目：" + JSON.stringify(resume.projects),
      "个人优势：" + (resume.summary ?? resume.basics.summary ?? ""),
      "",
      "目标职位：" + job.companyName + " - " + job.title,
      "职位技能要求：" + JSON.stringify(job.structured?.skills ?? []),
    ].join("\n");
  },

  generate_greeting: (input) => {
    const { resumeFacts, job, reference } = input as {
      resumeFacts: { skills: string[]; experienceCount: number; summary?: string };
      job: { title: string; companyName: string; structured?: { skills?: { name: string }[] } | null };
      reference: string;
    };
    return [
      "你是求职打招呼语撰写助手。基于给定的简历事实与职位信息，写一句发送给招聘者的中文打招呼语。只输出 JSON：",
      `{ "greeting": "打招呼语文本" }`,
      "硬性约束：",
      "1. greeting 不超过 60 个字符（招聘平台打招呼输入框的上限）。",
      "2. 只能使用下面给出的简历事实与职位信息，严禁编造任何经历、公司、项目、数字或技能。",
      "3. 语气自然友好、像真人写的，不要堆砌空泛套话。",
      "4. 只输出 JSON。",
      "",
      "简历事实：技能 " +
        resumeFacts.skills.join("、") +
        "；共 " +
        resumeFacts.experienceCount +
        " 段工作/项目经历" +
        (resumeFacts.summary ? "；个人优势：" + resumeFacts.summary : ""),
      "目标职位：" + job.companyName + " - " + job.title,
      "职位关键词：" + (job.structured?.skills ?? []).map((s) => s.name).join("、"),
      "参考语（基于同一份事实的模板版本，可参考其信息组织，不要照抄）：",
      reference,
    ].join("\n");
  },

  match_analysis: (input) => {
    const { resume, job, rule } = input as {
      resume: ResumeContent;
      job: { title: string; companyName: string; structured?: JobStructured | null };
      rule: { totalScore: number; dimensionScores: Record<string, number>; gaps: { dimension: string; detail: string }[] };
    };
    return [
      "你是求职匹配分析师。基于规则评分结果（评分已定，不要重新打分）与简历/职位信息，给出结构化解读。只输出 JSON：",
      `{
  "summary": "2-3 句匹配总结",
  "strengths": ["优势点，如：技能命中 React、TypeScript"],
  "gaps": ["差距点，如：缺少 Docker 经验"],
  "risks": ["风险提示，如：岗位要求 5 年经验，简历约 3 年，面试需准备针对性说明"]
}`,
      "只输出 JSON，不要输出任何其他内容。",
      "",
      "规则评分结果：",
      JSON.stringify(rule),
      "",
      "简历技能：" + resume.skills.join("、"),
      "简历经历年限概述：" + JSON.stringify(resume.experience?.map((e) => ({ title: e.title, start: e.start, end: e.end }))),
      "",
      "目标职位：" + job.companyName + " - " + job.title,
      "职位技能要求：" + (job.structured?.skills ?? []).map((s) => s.name).join("、"),
    ].join("\n");
  },
};
