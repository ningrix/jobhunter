import { DEGREE_RANK } from "@/shared/types";
import type { DeliveryPolicyRules, PolicyDecision, PolicyEvaluation } from "@/shared/types";

export interface PolicyContext {
  /** manual：用户手动投递（软性不满足 → 需确认）；auto：Agent 自动投递（软性不满足 → 拒绝） */
  mode: "manual" | "auto";
  /** 该职位与用户简历的最佳匹配分（无匹配记录为 null） */
  matchScore?: number | null;
  /** 今日已投递数量 */
  appliedToday: number;
  job: {
    companyName: string;
    title: string;
    city?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    employmentType?: string | null;
    jobType?: string | null;
    tags?: string[] | null;
    structured?: {
      education?: string;
      experienceYearsMin?: number;
    } | null;
  };
}

function contains(haystack: string, needle: string): boolean {
  return haystack.includes(needle) || needle.includes(haystack);
}

function degreeRankOf(degree?: string | null): number {
  if (!degree) return 0;
  return DEGREE_RANK[degree] ?? 0;
}

/**
 * 投递策略引擎（纯函数、可解释）。
 * 白名单直接放行；硬性规则不满足 → REJECT；
 * 软性规则（匹配分不足/达每日上限/信息缺失）→ 手动投递转为 REQUIRE_USER_CONFIRMATION，自动投递 REJECT。
 */
export function evaluatePolicy(rules: DeliveryPolicyRules, ctx: PolicyContext): PolicyEvaluation {
  const reject: string[] = [];
  const confirm: string[] = [];
  const company = ctx.job.companyName.trim();
  const jobTopSalary = ctx.job.salaryMax ?? ctx.job.salaryMin ?? null;
  const hasSalaryInfo = ctx.job.salaryMax != null || ctx.job.salaryMin != null;
  const titleLower = ctx.job.title.toLowerCase();
  const tagText = (ctx.job.tags ?? []).join(" ");

  // 白名单优先：用户明确想去的公司直接放行
  if (rules.companyWhitelist?.some((w) => w.trim() && contains(company, w.trim()))) {
    return { decision: "ALLOW", reasons: [`公司「${company}」在白名单中`] };
  }

  if (rules.companyBlacklist?.some((b) => b.trim() && contains(company, b.trim()))) {
    reject.push(`公司「${company}」在黑名单中`);
  }

  if (rules.cities?.length) {
    const jobCity = ctx.job.city ?? "";
    const hit = rules.cities.some((c) => c.trim() && contains(jobCity, c.trim()));
    if (!hit) reject.push(`工作城市「${jobCity || "未知"}」不在目标城市（${rules.cities.join("、")}）`);
  }

  if (rules.positions?.length) {
    const hit = rules.positions.some((p) => p.trim() && titleLower.includes(p.trim().toLowerCase()));
    if (!hit) reject.push(`岗位「${ctx.job.title}」不在目标岗位（${rules.positions.join("、")}）`);
  }

  if (rules.minSalary != null) {
    if (!hasSalaryInfo) {
      confirm.push("职位未标明薪资，无法核对最低薪资要求");
    } else if (jobTopSalary != null && jobTopSalary < rules.minSalary) {
      reject.push(`薪资上限 ${jobTopSalary}K 低于最低要求 ${rules.minSalary}K`);
    }
  }

  if (rules.education) {
    const need = ctx.job.structured?.education;
    if (need && need !== "不限" && degreeRankOf(need) > degreeRankOf(rules.education)) {
      reject.push(`职位要求${need}，高于你的学历（${rules.education}）`);
    }
  }

  if (rules.maxExperienceYears != null) {
    const needYears = ctx.job.structured?.experienceYearsMin ?? 0;
    if (needYears > rules.maxExperienceYears) {
      reject.push(`职位要求 ${needYears} 年经验，超过可接受的 ${rules.maxExperienceYears} 年`);
    }
  }

  const isInternship =
    ctx.job.employmentType === "实习" || titleLower.includes("实习") || tagText.includes("实习");
  if (isInternship && rules.acceptInternship === false) {
    reject.push("实习岗位不在你的接受范围");
  }

  const isCampus =
    ctx.job.jobType === "校招" || titleLower.includes("校招") || titleLower.includes("应届");
  if (isCampus && rules.acceptCampus === false) {
    reject.push("校招岗位不在你的接受范围");
  }

  if (rules.minMatchScore != null) {
    const score = ctx.matchScore;
    if (score == null || score < rules.minMatchScore) {
      const detail =
        score == null
          ? `尚无匹配评分（要求 ≥ ${rules.minMatchScore}）`
          : `匹配分 ${Math.round(score)} 低于要求 ${rules.minMatchScore}`;
      if (ctx.mode === "auto") reject.push(detail);
      else confirm.push(detail + "，需要你确认后再投递");
    }
  }

  if (rules.dailyMaxApplications != null && ctx.appliedToday >= rules.dailyMaxApplications) {
    const detail = `今日已投递 ${ctx.appliedToday} 份，达到上限 ${rules.dailyMaxApplications}`;
    if (ctx.mode === "auto") reject.push(detail);
    else confirm.push(detail + "，需要你确认后再投递");
  }

  if (reject.length > 0) return { decision: "REJECT" satisfies PolicyDecision, reasons: reject };
  if (confirm.length > 0) {
    return { decision: "REQUIRE_USER_CONFIRMATION" satisfies PolicyDecision, reasons: confirm };
  }
  return { decision: "ALLOW" satisfies PolicyDecision, reasons: [] };
}
