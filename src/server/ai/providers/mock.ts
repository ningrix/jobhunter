import { AppError, ErrorCode } from "@/shared/errors";
import type {
  JobStructured,
  KeywordCoverage,
  MatchExplanation,
  ResumeAnalysisResult,
  ResumeContent,
  ResumeTailorResult,
  TailorGap,
} from "@/shared/types";
import { totalExperienceYears } from "@/server/core/match-scorer";

export interface ChatRequest {
  scene: string;
  prompt: string;
  /** 结构化输入，Mock Provider 使用；OpenAI Provider 忽略 */
  input: unknown;
  json: boolean;
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  embed?(text: string): Promise<{ vector: number[]; model: string }>;
}

// ———————————————————— 工具：确定性内容扫描 ————————————————————

const SKILL_DICT = [
  "React", "Vue", "TypeScript", "JavaScript", "Node.js", "Next.js", "Python", "Java", "Go",
  "C++", "SQL", "MySQL", "PostgreSQL", "Redis", "MongoDB", "Docker", "Kubernetes", "Git",
  "Linux", "Spring Boot", "微服务", "Kafka", "RocketMQ", "Flink", "Spark", "Hive",
  "数据分析", "机器学习", "深度学习", "PyTorch", "TensorFlow", "大模型", "LLM", "RAG",
  "Prompt", "Agent", "推荐系统", "爬虫", "自动化测试", "性能优化",
];

const CITY_DICT = [
  "北京", "上海", "深圳", "广州", "杭州", "成都", "武汉", "南京", "西安", "苏州",
  "杭州", "长沙", "重庆", "天津", "合肥", "郑州", "厦门", "青岛", "济南", "远程",
];

const EDU_DICT = ["博士", "硕士", "本科", "大专"];

export function scanSkills(text: string): { name: string; weight: number }[] {
  const lower = text.toLowerCase();
  const found: { name: string; count: number }[] = [];
  for (const skill of SKILL_DICT) {
    const re = new RegExp(skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const count = (lower.match(re) ?? []).length;
    if (count > 0) found.push({ name: skill, count });
  }
  return found
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map((s, i) => ({ name: s.name, weight: Math.max(1, Math.min(5, 5 - i)) }));
}

export function scanCity(text: string): string | undefined {
  return CITY_DICT.find((c) => text.includes(c));
}

export function scanEducation(text: string): string | undefined {
  return EDU_DICT.find((e) => text.includes(e));
}

export function scanSalary(text: string): { min: number; max: number } | undefined {
  // 15-25K / 15~25k / 15K-25K
  let m = text.match(/(\d{1,3})\s*[-~到]\s*(\d{1,3})\s*[Kk千]/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  // 15-25万/年
  m = text.match(/(\d{1,3})\s*[-~到]\s*(\d{1,3})\s*万/);
  if (m) return { min: Math.round(Number(m[1]) * 10 / 12), max: Math.round(Number(m[2]) * 10 / 12) };
  return undefined;
}

export function scanYears(text: string): number {
  const m = text.match(/(\d{1,2})\s*年(?:以上|及以上)?[^，。\n]*经验/);
  return m ? Number(m[1]) : 0;
}

function estTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 2));
}

// ———————————————————— Mock Provider ————————————————————

export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock-1";

  async chat(req: ChatRequest): Promise<ChatResult> {
    const input = req.input as Record<string, unknown>;
    let result: unknown;
    switch (req.scene) {
      case "parse_resume":
        result = mockParseResume(input as { text: string });
        break;
      case "parse_jd":
        result = mockParseJd(input as { text: string });
        break;
      case "optimize_resume":
        result = mockOptimizeResume(input as { content: ResumeContent; jobTitle?: string });
        break;
      case "match_analysis":
        result = mockMatchAnalysis(
          input as {
            rule: {
              totalScore: number;
              dimensionScores: Record<string, number>;
              gaps: { dimension: string; detail: string }[];
            };
            resume: ResumeContent;
            job: { title: string; companyName: string; structured?: JobStructured | null };
          },
        );
        break;
      case "tailor_resume":
        result = mockTailorResume(
          input as {
            resume: ResumeContent;
            job: { title: string; companyName: string; structured?: JobStructured | null };
          },
        );
        break;
      case "generate_greeting":
        result = mockGenerateGreeting(
          input as {
            resumeFacts: { skills: string[]; experienceCount: number; summary?: string };
            job: { title: string; companyName: string };
            reference: string;
          },
        );
        break;
      default:
        throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `Mock 未实现场景: ${req.scene}`);
    }
    const content = JSON.stringify(result);
    return {
      content,
      provider: this.name,
      model: this.model,
      promptTokens: estTokens(req.prompt),
      completionTokens: estTokens(content),
    };
  }

  async embed(text: string): Promise<{ vector: number[]; model: string }> {
    // 确定性哈希向量：64 维，按 3-gram 哈希分桶后归一化
    const DIM = 64;
    const vec = new Array<number>(DIM).fill(0);
    const t = text.toLowerCase();
    for (let i = 0; i < t.length - 2; i++) {
      const h = (t.charCodeAt(i) * 31 + t.charCodeAt(i + 1) * 17 + t.charCodeAt(i + 2)) >>> 0;
      vec[h % DIM] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return { vector: vec.map((v) => v / norm), model: "mock-embed-1" };
  }
}

function mockParseResume({ text }: { text: string }): ResumeContent {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "";
  const phone = text.match(/1[3-9]\d{9}/)?.[0] ?? "";
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const name = /^[\u4e00-\u9fa5]{2,4}$/.test(firstLine) ? firstLine : firstLine.slice(0, 4) || "待补充";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    basics: {
      name,
      phone,
      email,
      city: scanCity(text) ?? "",
      title: text.match(/求职(意向|目标)[:：]?\s*(\S{2,20})/)?.[2] ?? "",
      summary: "",
    },
    summary: "",
    skills: scanSkills(text).map((s) => s.name),
    experience: lines.length
      ? [{ company: "待补充", title: "待补充", start: "", end: "", highlights: lines.slice(0, 3) }]
      : [],
    education: scanEducation(text)
      ? [{ school: "待补充", major: "待补充", degree: scanEducation(text)!, start: "", end: "" }]
      : [],
    projects: [],
  };
}

function mockParseJd({ text }: { text: string }): JobStructured {
  const salary = scanSalary(text);
  const title =
    text.match(/招聘[:：]?\s*(\S{2,20})/)?.[1] ??
    text.split("\n").map((l) => l.trim()).find(Boolean) ??
    "未知岗位";
  return {
    title: title.slice(0, 30),
    city: scanCity(text),
    salaryMin: salary?.min,
    salaryMax: salary?.max,
    experienceYearsMin: scanYears(text),
    education: scanEducation(text) ?? "不限",
    skills: scanSkills(text),
    responsibilities: text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(职责|工作内容|-|•|\d[.、])/.test(l) && l.length > 4)
      .slice(0, 8)
      .map((l) => l.replace(/^[-•\d.、\s]*/, "")),
    requirements: text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(要求|任职|-|•|\d[.、])/.test(l) && l.length > 4)
      .slice(0, 8)
      .map((l) => l.replace(/^[-•\d.、\s]*/, "")),
  };
}

/** 确定性 JD 规则解析（不依赖 LLM）：供 Normalizer 与 Mock Provider 复用 */
export function ruleParseJd(text: string): JobStructured {
  // 带 HTML 的粘贴内容：标签替换为换行，避免标签混入首行标题
  const clean = text.replace(/<[^>]+>/g, "\n");
  return mockParseJd({ text: clean });
}

function mockOptimizeResume({
  content,
}: {
  content: ResumeContent;
  jobTitle?: string;
}): ResumeAnalysisResult {
  const issues: string[] = [];
  const suggestions: ResumeAnalysisResult["suggestions"] = [];
  let score = 60;
  if (content.skills.length >= 5) score += 10;
  else issues.push("技能清单偏少（少于 5 项），建议补充与目标岗位相关的技能");
  if (content.experience.some((e) => e.highlights.length > 0)) score += 10;
  else issues.push("工作经历缺少亮点描述");
  if (content.experience.some((e) => /\d/.test(e.highlights.join("")))) score += 10;
  else issues.push("经历亮点缺少量化数据（如性能提升 30%、日活 10 万）");
  if (content.basics.summary || content.summary) score += 5;
  else issues.push("缺少个人优势概述");
  if (content.education.length > 0) score += 5;
  else issues.push("缺少教育背景");
  score = Math.min(95, score);

  if (!content.basics.summary && !content.summary) {
    suggestions.push({
      section: "summary",
      before: "",
      after: `${content.basics.title || "求职者"}，${content.experience.length || 1} 段经历，熟悉 ${content.skills.slice(0, 3).join("、") || "相关领域"}，有完整项目落地经验`,
      reason: "开头增加 2-3 句个人优势概述，帮助 HR 快速建立印象",
    });
  }
  const noQuant = content.experience.find((e) => e.highlights.length > 0 && !/\d/.test(e.highlights.join("")));
  if (noQuant) {
    suggestions.push({
      section: "experience",
      before: noQuant.highlights[0] ?? "",
      after: "建议在描述中加入量化结果，如「优化后接口 P99 延迟下降 40%」",
      reason: "量化数据是简历可信度与竞争力的核心",
    });
  }
  if (content.skills.length > 0 && content.skills.length < 5) {
    suggestions.push({
      section: "skills",
      before: content.skills.join("、"),
      after: "建议按「语言/框架/工具/领域」分组补齐相关技能",
      reason: "技能分组清晰可提升关键词命中率",
    });
  }
  return { score, issues, suggestions };
}

function mockMatchAnalysis(input: {
  rule: { totalScore: number; dimensionScores: Record<string, number>; gaps: { dimension: string; detail: string }[] };
  resume: ResumeContent;
  job: { title: string; companyName: string; structured?: JobStructured | null };
}): MatchExplanation {
  const DIM_LABEL: Record<string, string> = {
    skills: "技能",
    experience: "经验",
    education: "学历",
    city: "城市",
    salary: "薪资",
  };
  const { rule, resume, job } = input;

  const strengths: string[] = [];
  for (const [dim, score] of Object.entries(rule.dimensionScores)) {
    if (score < 80) continue;
    if (dim === "skills" && job.structured?.skills?.length) {
      const resumeSet = new Set(resume.skills.map((s) => s.trim().toLowerCase()));
      const matched = job.structured.skills
        .filter((js) => resumeSet.has(js.name.trim().toLowerCase()))
        .map((js) => js.name);
      strengths.push(
        matched.length ? `技能匹配：命中 ${matched.join("、")}` : "技能维度评分高",
      );
    } else {
      strengths.push(`${DIM_LABEL[dim] ?? dim}匹配度高（${Math.round(score)} 分）`);
    }
  }

  const gaps = rule.gaps.map((g) => `${DIM_LABEL[g.dimension] ?? g.dimension}：${g.detail}`);

  const risks: string[] = [];
  const needYears = job.structured?.experienceYearsMin ?? 0;
  const myYears = totalExperienceYears(resume);
  if (needYears > 0 && myYears < needYears) {
    risks.push(`岗位要求 ${needYears} 年经验，简历约 ${myYears} 年，面试需准备针对性的说服材料`);
  }
  if ((rule.dimensionScores.salary ?? 100) < 50) {
    risks.push("薪资低于期望，投递前先确认薪酬预期");
  }
  if (rule.totalScore < 55) {
    risks.push("整体匹配度偏低，建议先补强核心技能再投递");
  }

  const summary =
    rule.totalScore >= 75
      ? `你的背景与 ${job.companyName} 的 ${job.title} 岗位匹配度较高，建议尽快投递并针对性突出相关经历。`
      : rule.totalScore >= 55
        ? `你与 ${job.companyName} 的 ${job.title} 岗位基本匹配，但存在明显差距，建议先按差距清单补齐再投递。`
        : `你与 ${job.companyName} 的 ${job.title} 岗位匹配度偏低，建议谨慎投递或先补强核心技能。`;

  return { summary, strengths, gaps, risks };
}

/**
 * AI 打招呼语（确定性 Mock）：只使用输入中的事实，硬性 ≤60 字符。
 * 措辞与 apply-flow 的模板兜底语可区分，便于测试断言来源。
 */
function mockGenerateGreeting(input: {
  resumeFacts: { skills: string[]; experienceCount: number; summary?: string };
  job: { title: string; companyName: string };
  reference: string;
}): { greeting: string } {
  void input.reference;
  const { resumeFacts, job } = input;
  const head = `您好！看到贵司「${job.title.slice(0, 12)}」在招`;
  const tail =
    resumeFacts.experienceCount > 0
      ? `，我有 ${resumeFacts.experienceCount} 段相关经历，期待与您沟通。`
      : "，我对该方向很有热情，期待与您沟通。";
  return { greeting: head + tail };
}

/** 关键词覆盖判定：matched（精确命中）/ partial（互为子串）/ missing */
function coverageStatus(keyword: string, resumeSkills: string[]): KeywordCoverage["status"] {
  const lower = keyword.toLowerCase();
  if (resumeSkills.some((s) => s.toLowerCase() === lower)) return "matched";
  const partial = resumeSkills.some((s) => {
    const sl = s.toLowerCase();
    return sl.length >= 3 && lower.length >= 3 && (sl.includes(lower) || lower.includes(sl));
  });
  return partial ? "partial" : "missing";
}

/**
 * JD → 简历定制分析（确定性 Mock）。
 * 严禁编造：wordingSuggestions 只复用 mockOptimizeResume 对原文的措辞优化；
 * missing 关键词只进 gapAnalysis（true_gap），绝不进入改写建议。
 */
function mockTailorResume(input: {
  resume: ResumeContent;
  job: { title: string; companyName: string; structured?: JobStructured | null };
}): ResumeTailorResult {
  const { resume, job } = input;
  const resumeSkills = resume.skills.map((s) => s.trim());
  const jobSkills = job.structured?.skills ?? [];

  const keywordCoverage = jobSkills.map((js) => ({
    keyword: js.name,
    status: coverageStatus(js.name, resumeSkills),
  }));

  const highlightText = [
    resume.summary ?? resume.basics.summary ?? "",
    ...resume.experience.flatMap((e) => e.highlights),
    ...resume.projects.flatMap((p) => [p.description, ...(p.highlights ?? [])]),
  ]
    .join("\n")
    .toLowerCase();

  const gapAnalysis: TailorGap[] = [];
  for (const cov of keywordCoverage) {
    const mentioned = highlightText.includes(cov.keyword.toLowerCase());
    if (cov.status === "matched" && !mentioned) {
      gapAnalysis.push({
        category: "presentation",
        keyword: cov.keyword,
        suggestion: `「${cov.keyword}」已在你的技能清单中，但未出现在个人优势或经历亮点里，建议前置提及`,
      });
    } else if (cov.status === "partial") {
      const near = resumeSkills.find(
        (s) =>
          s.toLowerCase().includes(cov.keyword.toLowerCase()) ||
          cov.keyword.toLowerCase().includes(s.toLowerCase()),
      );
      gapAnalysis.push({
        category: "adjacent_skill",
        keyword: cov.keyword,
        suggestion: `你的「${near}」与 JD 要求的「${cov.keyword}」相近，建议在相关描述中显式使用完整表述`,
      });
    } else if (cov.status === "missing") {
      gapAnalysis.push({
        category: "true_gap",
        keyword: cov.keyword,
        suggestion: `暂无「${cov.keyword}」相关经验：建议学习或补充真实相关项目；不要虚构经历`,
      });
    }
  }

  const reorderSuggestions: string[] = [];
  const matchedNames = keywordCoverage.filter((c) => c.status === "matched").map((c) => c.keyword);
  if (resume.skills.length >= 3 && matchedNames.length > 0) {
    reorderSuggestions.push(`把命中 JD 的技能（${matchedNames.slice(0, 3).join("、")}）移到技能清单最前面`);
  }
  if (resume.experience.length > 1) {
    reorderSuggestions.push(`把与「${job.title}」最相关的一段经历调整到工作经历第一位`);
  }
  if (resume.projects.length > 0 && resume.experience.length === 0) {
    reorderSuggestions.push("应届/无工作经验场景：把项目经历前置到教育背景之后");
  }

  // 措辞建议：复用 optimize 分析器（其建议仅基于原文事实，满足「不引入新事实」约束）
  const optimize = mockOptimizeResume({ content: resume, jobTitle: job.title });
  const wordingSuggestions = optimize.suggestions.filter((s) => s.section !== "skills" || true);

  return { keywordCoverage, gapAnalysis, reorderSuggestions, wordingSuggestions };
}
