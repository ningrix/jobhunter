// —— 领域类型（数据库 JSON 列与前后端共享） ——

export interface ResumeBasics {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  title?: string; // 求职意向岗位
  summary?: string;
}

export interface ResumeExperience {
  company: string;
  title: string;
  start: string; // YYYY-MM 或 YYYY
  end: string;
  highlights: string[];
}

export interface ResumeEducation {
  school: string;
  major: string;
  degree: string; // 大专 | 本科 | 硕士 | 博士
  start: string;
  end: string;
}

export interface ResumeProject {
  name: string;
  role?: string;
  start?: string;
  end?: string;
  description: string;
  highlights?: string[];
}

export interface ResumeContent {
  basics: ResumeBasics;
  summary?: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
}

export function emptyResumeContent(): ResumeContent {
  return { basics: {}, summary: "", skills: [], experience: [], education: [], projects: [] };
}

// —— 职位 ——

export interface JobSkill {
  name: string;
  weight: number; // 1-5，5 为核心要求
}

export interface JobStructured {
  title?: string;
  city?: string;
  salaryMin?: number; // 单位：K/月
  salaryMax?: number;
  experienceYearsMin?: number;
  education?: string;
  skills: JobSkill[];
  responsibilities: string[];
  requirements: string[];
}

// —— 匹配 ——

export interface DimensionScores {
  skills: number; // 0-100
  experience: number;
  education: number;
  city: number;
  salary: number;
}

export type MatchDimension = keyof DimensionScores;

/** 用户可调的匹配维度权重（0-10 任意数值，评分器内部归一化；缺省维度回落系统默认） */
export type MatchWeights = Partial<Record<MatchDimension, number>>;

export interface MatchGap {
  dimension: MatchDimension;
  detail: string;
}

export interface MatchReason {
  dimension: string;
  detail: string;
}

/** AI 匹配解读（AI 只解释和补充，评分完全来自规则评分器） */
export interface MatchExplanation {
  summary: string;
  strengths: string[];
  gaps: string[];
  risks: string[];
}

// —— 简历 AI 优化 ——

export interface ResumeSuggestion {
  section: string; // basics | summary | skills | experience | education | projects
  before: string;
  after: string;
  reason: string;
}

export interface ResumeAnalysisResult {
  score: number; // 0-100
  issues: string[];
  suggestions: ResumeSuggestion[];
}

// —— 投递阶段 ——

export const APPLICATION_STAGES = [
  "wishlist",
  "applied",
  "written_test",
  "interview",
  "offer",
  "rejected",
  "closed",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  wishlist: "想投",
  applied: "已投递",
  written_test: "笔试",
  interview: "面试",
  offer: "Offer",
  rejected: "已挂",
  closed: "关闭",
};

export const STAGE_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  wishlist: ["applied", "closed"],
  applied: ["written_test", "interview", "rejected", "closed"],
  written_test: ["interview", "rejected", "closed"],
  interview: ["offer", "rejected", "closed"],
  offer: ["closed", "rejected"],
  rejected: ["closed"],
  closed: [],
};

// 看板展示顺序（closed 不上板，通过筛选查看）
export const BOARD_STAGES: ApplicationStage[] = [
  "wishlist",
  "applied",
  "written_test",
  "interview",
  "offer",
  "rejected",
];

// —— AI 任务 ——

export type TaskType =
  | "parse_resume"
  | "parse_jd"
  | "optimize_resume"
  | "match_analysis"
  | "tailor_resume";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed";

export const DEGREE_RANK: Record<string, number> = {
  不限: 0,
  大专: 1,
  本科: 2,
  硕士: 3,
  博士: 4,
};

// ———— V3.1：简历样式（模板/字体/主色/间距） ————

export const RESUME_TEMPLATE_IDS = [
  "classic",
  "modern",
  "minimal",
  "professional",
  "student",
] as const;

export type ResumeTemplateId = (typeof RESUME_TEMPLATE_IDS)[number];

export interface ResumeStyle {
  template: ResumeTemplateId;
  font: "sans" | "serif";
  accentColor: string; // hex，如 #1e40af
  spacing: "compact" | "normal" | "relaxed";
}

export const DEFAULT_RESUME_STYLE: ResumeStyle = {
  template: "classic",
  font: "sans",
  accentColor: "#1e40af",
  spacing: "normal",
};

// ———— V3.1：JD → 简历定制（AI 只做覆盖分析与改写建议，严禁虚构） ————

export interface KeywordCoverage {
  keyword: string;
  status: "matched" | "partial" | "missing";
}

export interface TailorGap {
  category: "presentation" | "weak_evidence" | "adjacent_skill" | "true_gap";
  keyword: string;
  suggestion: string;
}

export interface ResumeTailorResult {
  keywordCoverage: KeywordCoverage[];
  gapAnalysis: TailorGap[];
  reorderSuggestions: string[];
  /** 措辞建议：after 必须是 before 的改写，不得引入原文之外的新公司/技能/数字 */
  wordingSuggestions: { section: string; before: string; after: string; reason: string }[];
}

// ———— V2：统一职位模型（仅作为外部来源 → createJob 的标准化输入，不持久化） ————

export interface UnifiedJob {
  source: string; // boss | mock | paste | ...
  sourceJobId?: string;
  sourceUrl?: string;
  companyName: string;
  title: string;
  description: string;
  city?: string;
  district?: string;
  salaryMin?: number; // K/月
  salaryMax?: number;
  education?: string;
  experienceYearsMin?: number;
  employmentType?: string; // 全职 | 实习 | 兼职
  jobType?: string; // 社招 | 校招
  skills: JobSkill[];
  tags: string[];
  postedAt?: string; // ISO
  rawData?: Record<string, unknown>;
}

/** 跨来源去重判定：不高置信不合并 */
export type DedupeKind = "NEW" | "EXACT_DUPLICATE" | "POSSIBLE_DUPLICATE";

// ———— V2：Agent 事件 ————

export type AgentAction =
  | "import" // 来源导入
  | "open_page"
  | "extract_jd"
  | "policy_check"
  | "generate_content"
  | "fill_form"
  | "wait_user_confirm"
  | "captcha_blocked" // V3P2：安全验证阻断（暂停，绝不绕过）
  | "captcha_manual_resolved" // V3P2：用户完成验证后的 Agent 复检
  | "user_handover" // V3P2：用户接管，Agent 退出
  | "blocked_reminder_created" // V3P2：阻断联动站内提醒
  | "submit"
  | "blocked";

export type AgentEventResult = "success" | "failed" | "blocked" | "waiting_user";

// ———— V2：投递策略（Level 0/1/2 共用的判定规则） ————

export interface DeliveryPolicyRules {
  /** 目标城市（空/缺省 = 不限） */
  cities?: string[];
  /** 目标岗位关键词（匹配职位标题，空 = 不限） */
  positions?: string[];
  /** 最低薪资 K/月（职位薪资上限须达到；职位未标薪资时转人工确认） */
  minSalary?: number;
  /** 我的最高学历（职位要求不得高于） */
  education?: string;
  /** 可接受的职位最大经验要求年限 */
  maxExperienceYears?: number;
  companyBlacklist?: string[];
  companyWhitelist?: string[];
  /** 最低匹配分（低于则：手动=需确认，自动=拒绝） */
  minMatchScore?: number;
  acceptInternship?: boolean;
  acceptCampus?: boolean;
  /** 每日最大投递数量（达到则：手动=需确认，自动=拒绝） */
  dailyMaxApplications?: number;
}

export type PolicyDecision = "ALLOW" | "REQUIRE_USER_CONFIRMATION" | "REJECT";

export interface PolicyEvaluation {
  decision: PolicyDecision;
  reasons: string[];
}

// ———— V2：推荐分桶（Level 0） ————

export const RECOMMEND_BUCKETS = ["all", "strong", "recommended", "confirm", "applied"] as const;
export type RecommendBucket = (typeof RECOMMEND_BUCKETS)[number];

export const STRONG_THRESHOLD = 85;
export const RECOMMENDED_THRESHOLD = 70;
