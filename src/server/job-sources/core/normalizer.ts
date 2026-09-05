import { createHash } from "node:crypto";
import type { UnifiedJob } from "@/shared/types";
import { ruleParseJd, scanCity } from "@/server/ai/providers/mock";

// ———————————————————— 确定性规范化（指纹的前置步骤） ————————————————————

/**
 * 文本指纹规范化：去 HTML / URL / 日期、统一薪资格式（15-25K ≡ 15K~25K ≡ 1-2万(月薪)）、
 * 小写、压掉全部空白、仅保留字母数字汉字与连字符。
 */
export function normalizeJobContentForFingerprint(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ") // HTML 标签
    .replace(/https?:\/\/\S+/gi, " ") // URL
    .replace(/\d{4}[-/年.]\s?\d{1,2}[-/月.]\s?\d{1,2}日?/g, " ") // 日期等动态字段
    // 先归一「万」（月薪），再归一 K；分隔符两侧允许出现单位（15K~25K）
    .replace(/(\d+(?:\.\d+)?)\s*[-~到]\s*(\d+(?:\.\d+)?)\s*万/g, (_m, a, b) =>
      [Math.round(Number(a) * 10), Math.round(Number(b) * 10)].join("-") + "k",
    )
    .replace(/(\d+(?:\.\d+)?)\s*[kK千]?\s*[-~到]\s*(\d+(?:\.\d+)?)\s*[kK千]?/g, (_m, a, b) => `${a}-${b}k`)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}\-]/gu, "");
}

/** 公司名归一：去法律后缀与集团字样后做内容规范化 */
export function normalizeCompanyName(name: string): string {
  const stripped = name
    .trim()
    .replace(/\s+/g, "")
    .replace(/股份有限公司$/, "")
    .replace(/有限责任公司$/, "")
    .replace(/有限公司$/, "")
    .replace(/（集团）$/i, "")
    .replace(/\(集团\)$/i, "")
    .replace(/集团$/, "");
  return normalizeJobContentForFingerprint(stripped);
}

/** 城市归一到规范名（含区县前缀回退），未识别返回空串 */
export function canonicalCity(city?: string | null): string {
  if (!city) return "";
  return scanCity(city) ?? "";
}

/** 从 URL 提取来源职位 ID：BOSS job_detail/<id>.html，或通用 jobId 查询参数 */
export function extractSourceJobId(url: string | undefined, _source: string): string | undefined {
  if (!url) return undefined;
  const detail = url.match(/job_detail\/([0-9a-zA-Z]+)\.html/i);
  if (detail) return detail[1];
  const query = url.match(/[?&](?:jobId|job_id)=([^&]+)/i);
  if (query) return decodeURIComponent(query[1]);
  return undefined;
}

// ———————————————————— UnifiedJob 标准化 ————————————————————

export interface NormalizeInput {
  source: string;
  url?: string;
  text: string;
  sourceJobId?: string;
  rawData?: Record<string, unknown>;
}

/**
 * RawJobInput → UnifiedJob。规则解析优先（确定性、零成本），
 * AI 富化由既有 parse_jd 任务在导入后按需触发，不在本函数内。
 */
export function normalizeToUnified(input: NormalizeInput): UnifiedJob {
  const structured = ruleParseJd(input.text);
  const companyName =
    (typeof input.rawData?.companyName === "string" && input.rawData.companyName.trim()) ||
    input.text.match(/公司[:：]\s*(\S{2,30})/)?.[1] ||
    "未知公司";
  const postedAt =
    typeof input.rawData?.postedAt === "string" ? input.rawData.postedAt : undefined;

  return {
    source: input.source,
    sourceJobId: input.sourceJobId ?? extractSourceJobId(input.url, input.source),
    sourceUrl: input.url,
    companyName: companyName.trim(),
    title: structured.title ?? "未知岗位",
    description: input.text,
    city: structured.city,
    district: undefined,
    salaryMin: structured.salaryMin,
    salaryMax: structured.salaryMax,
    education: structured.education,
    experienceYearsMin: structured.experienceYearsMin,
    skills: structured.skills,
    tags: [],
    postedAt,
    rawData: input.rawData,
  };
}

// ———————————————————— 指纹 ————————————————————

function possibleKeyParts(companyName: string, title: string, city?: string): string {
  return [
    normalizeCompanyName(companyName),
    normalizeJobContentForFingerprint(title),
    canonicalCity(city),
  ].join("|");
}

/** 疑似重复键：公司+职位+城市（不含描述，用于跨平台改写场景的低置信提示） */
export function possibleDuplicateKey(job: {
  companyName: string;
  title: string;
  city?: string;
}): string {
  return possibleKeyParts(job.companyName, job.title, job.city);
}

/**
 * 内容指纹：规范化后的 公司|职位|城市|JD核心内容 做 SHA-256。
 * 同一职位的不同呈现（HTML/空白/薪资格式差异）得到相同指纹；
 * 措辞被改写时指纹不同 → 由 possibleDuplicateKey 兜底给出低置信提示。
 */
export function computeFingerprint(job: {
  companyName: string;
  title: string;
  city?: string;
  description: string;
}): string {
  const norm = [
    possibleKeyParts(job.companyName, job.title, job.city),
    normalizeJobContentForFingerprint(job.description),
  ].join("||");
  return createHash("sha256").update(norm).digest("hex").slice(0, 40);
}
