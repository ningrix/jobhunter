import {
  DEGREE_RANK,
  type DimensionScores,
  type JobStructured,
  type MatchDimension,
  type MatchGap,
  type MatchReason,
  type MatchWeights,
  type ResumeContent,
} from "@/shared/types";

export interface MatchRuleInput {
  resume: ResumeContent;
  profile: {
    expectedCity?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
  } | null;
  job: {
    city?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    structured?: JobStructured | null;
  };
  /** 用户可调权重向量：不传时与默认权重行为完全一致（向后兼容） */
  weights?: MatchWeights;
}

export interface MatchRuleResult {
  totalScore: number;
  dimensionScores: DimensionScores;
  gaps: MatchGap[];
  reasons: MatchReason[];
}

const WEIGHTS: Record<MatchDimension, number> = {
  skills: 0.4,
  experience: 0.25,
  education: 0.15,
  city: 0.1,
  salary: 0.1,
};

/** 归一化用户权重：缺省/非法维度回落系统默认；全 0 时整体回落默认，保证输出确定性 */
export function normalizeWeights(custom?: MatchWeights): Record<MatchDimension, number> {
  const merged: Record<MatchDimension, number> = { ...WEIGHTS };
  if (custom) {
    for (const dim of Object.keys(WEIGHTS) as MatchDimension[]) {
      const v = custom[dim];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) merged[dim] = v;
    }
  }
  const dims = Object.keys(merged) as MatchDimension[];
  const sum = dims.reduce((s, d) => s + merged[d], 0);
  if (sum <= 0) return { ...WEIGHTS };
  const out = {} as Record<MatchDimension, number>;
  for (const d of dims) out[d] = merged[d] / sum;
  return out;
}

function normSkill(s: string): string {
  return s.trim().toLowerCase();
}

/** 简历经历总年限（年，1 位小数） */
export function totalExperienceYears(resume: ResumeContent): number {
  const now = new Date();
  let months = 0;
  for (const exp of resume.experience ?? []) {
    const start = parseYearMonth(exp.start);
    const end = /至今|now|present/i.test(exp.end ?? "") ? now : parseYearMonth(exp.end);
    if (!start || !end) continue;
    const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (diff > 0) months += diff;
  }
  return Math.min(50, Math.round((months / 12) * 10) / 10);
}

function parseYearMonth(s?: string): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})(?:[./-](\d{1,2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1);
}

function highestDegree(resume: ResumeContent): string {
  let best = "";
  let bestRank = -1;
  for (const edu of resume.education ?? []) {
    const rank = DEGREE_RANK[edu.degree] ?? -1;
    if (rank > bestRank) {
      bestRank = rank;
      best = edu.degree;
    }
  }
  return best;
}

/**
 * 规则评分器：默认 技能 40% / 经验 25% / 学历 15% / 城市 10% / 薪资 10%。
 * 纯函数、确定性，便于单测与后续调参；支持用户自定义权重向量（加权点积，内部归一化）。
 */
export function scoreMatch(input: MatchRuleInput): MatchRuleResult {
  const { resume, profile, job } = input;
  const structured = job.structured ?? null;
  const dimensionScores: DimensionScores = {
    skills: 0,
    experience: 0,
    education: 0,
    city: 0,
    salary: 0,
  };
  const gaps: MatchGap[] = [];
  const reasons: MatchReason[] = [];

  // —— 技能 ——
  const jobSkills = structured?.skills ?? [];
  const resumeSkillSet = new Set((resume.skills ?? []).map(normSkill));
  const totalWeight = jobSkills.reduce((s, j) => s + (j.weight || 1), 0);
  const matched: string[] = [];
  const missing: string[] = [];
  let hitWeight = 0;
  for (const js of jobSkills) {
    if (resumeSkillSet.has(normSkill(js.name))) {
      hitWeight += js.weight || 1;
      matched.push(js.name);
    } else {
      missing.push(js.name);
    }
  }
  if (jobSkills.length === 0) {
    dimensionScores.skills = 60; // JD 未解析出技能要求时给中性分
    reasons.push({ dimension: "skills", detail: "职位未提供明确技能要求，按中性评估" });
  } else {
    const score = Math.round((hitWeight / totalWeight) * 100);
    dimensionScores.skills = score;
    reasons.push({
      dimension: "skills",
      detail: `命中 ${matched.length}/${jobSkills.length} 项技能要求（加权）`,
    });
    if (missing.length > 0) {
      gaps.push({ dimension: "skills", detail: `缺少技能：${missing.slice(0, 8).join("、")}` });
    }
  }

  // —— 经验 ——
  const years = totalExperienceYears(resume);
  const needYears = structured?.experienceYearsMin ?? 0;
  if (needYears <= 0) {
    dimensionScores.experience = years > 0 ? 90 : 70;
    reasons.push({ dimension: "experience", detail: `职位未设年限门槛，你的经验 ${years} 年` });
  } else if (years >= needYears) {
    dimensionScores.experience = 100;
    reasons.push({ dimension: "experience", detail: `经验 ${years} 年，满足 ${needYears} 年要求` });
  } else {
    const ratio = years / needYears;
    dimensionScores.experience = Math.round(Math.max(10, ratio * 100));
    gaps.push({
      dimension: "experience",
      detail: `经验 ${years} 年，低于要求的 ${needYears} 年`,
    });
  }

  // —— 学历 ——
  const resumeDegree = highestDegree(resume);
  const needDegree = structured?.education ?? "不限";
  const resumeRank = DEGREE_RANK[resumeDegree] ?? -1;
  const needRank = DEGREE_RANK[needDegree] ?? 0;
  if (needRank <= 0 || (needDegree === "不限")) {
    dimensionScores.education = 90;
  } else if (resumeRank >= needRank) {
    dimensionScores.education = resumeRank === needRank ? 100 : 95;
  } else {
    const drop = needRank - resumeRank;
    dimensionScores.education = drop === 1 ? 60 : 30;
    gaps.push({
      dimension: "education",
      detail: `学历 ${resumeDegree || "未知"} 低于要求 ${needDegree}`,
    });
  }
  reasons.push({ dimension: "education", detail: `要求 ${needDegree}，简历 ${resumeDegree || "未知"}` });

  // —— 城市 ——
  const myCity = resume.basics?.city || profile?.expectedCity || "";
  const jobCity = job.city || structured?.city || "";
  if (!jobCity || !myCity) {
    dimensionScores.city = 50;
    reasons.push({ dimension: "city", detail: "城市信息不完整，无法精确判断" });
  } else if (myCity === jobCity || jobCity.includes(myCity) || myCity.includes(jobCity)) {
    dimensionScores.city = 100;
    reasons.push({ dimension: "city", detail: `工作地 ${jobCity} 与你的城市一致` });
  } else {
    dimensionScores.city = 30;
    gaps.push({ dimension: "city", detail: `职位在 ${jobCity}，你在 ${myCity}` });
  }

  // —— 薪资 ——
  const pMin = profile?.salaryMin ?? null;
  const pMax = profile?.salaryMax ?? null;
  const jMin = job.salaryMin ?? structured?.salaryMin ?? null;
  const jMax = job.salaryMax ?? structured?.salaryMax ?? null;
  if (pMin == null && pMax == null) {
    dimensionScores.salary = 60;
    reasons.push({ dimension: "salary", detail: "未设置期望薪资，按中性评估" });
  } else if (jMin == null && jMax == null) {
    dimensionScores.salary = 60;
    reasons.push({ dimension: "salary", detail: "职位未标明薪资范围" });
  } else {
    const jobLo = jMin ?? jMax ?? 0;
    const jobHi = jMax ?? jMin ?? 0;
    const expLo = pMin ?? pMax ?? jobLo;
    const expHi = pMax ?? pMin ?? jobHi;
    if (jobHi >= expLo && jobLo <= expHi) {
      dimensionScores.salary = 100;
      reasons.push({ dimension: "salary", detail: `薪资区间与期望（${expLo}-${expHi}K）有重合` });
    } else if (jobHi < expLo) {
      dimensionScores.salary = 40;
      gaps.push({
        dimension: "salary",
        detail: `职位薪资上限 ${jobHi}K 低于期望下限 ${expLo}K`,
      });
    } else {
      dimensionScores.salary = 90; // 职位高于期望，几乎不构成障碍
      reasons.push({ dimension: "salary", detail: "职位薪资高于你的期望" });
    }
  }

  const weights = input.weights ? normalizeWeights(input.weights) : WEIGHTS;
  const totalScore =
    Math.round(
      (Object.keys(weights) as MatchDimension[]).reduce(
        (sum, dim) => sum + dimensionScores[dim] * weights[dim],
        0,
      ) * 10,
    ) / 10;

  return { totalScore: Math.min(100, Math.max(0, totalScore)), dimensionScores, gaps, reasons };
}
