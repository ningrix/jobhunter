#!/usr/bin/env node
/**
 * JobHunter 规则评分器（CLI 版）
 *
 * 与 src/server/core/match-scorer.ts 保持逐行为同步的移植：五维加权点积
 * （默认 技能 40% / 经验 25% / 学历 15% / 城市 10% / 薪资 10%），
 * 支持用户自定义权重向量（内部归一化，全 0 回落默认）。
 *
 * 零依赖、零 DB，专为 skill 形态自包含运行。两份实现的一致性由
 * src/server/core/__tests__/match-scorer-parity.test.ts 对拍测试守住——
 * 修改本文件或 TS 版任一方，必须跑对拍并双向同步。
 *
 * 用法：echo '<输入 JSON>' | node match-scorer.mjs
 * 输入：{ "resume": ResumeContent, "profile": { expectedCity?, salaryMin?, salaryMax? } | null,
 *        "job": { city?, salaryMin?, salaryMax?, structured? }, "weights"?: 五维权重 }
 * 输出：MatchRuleResult JSON（totalScore / dimensionScores / gaps / reasons）
 */

const DEGREE_RANK = { 不限: 0, 大专: 1, 本科: 2, 硕士: 3, 博士: 4 };

const WEIGHTS = { skills: 0.4, experience: 0.25, education: 0.15, city: 0.1, salary: 0.1 };

/** 归一化用户权重：缺省/非法维度回落系统默认；全 0 时整体回落默认，保证输出确定性 */
export function normalizeWeights(custom) {
  const merged = { ...WEIGHTS };
  if (custom) {
    for (const dim of Object.keys(WEIGHTS)) {
      const v = custom[dim];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) merged[dim] = v;
    }
  }
  const dims = Object.keys(merged);
  const sum = dims.reduce((s, d) => s + merged[d], 0);
  if (sum <= 0) return { ...WEIGHTS };
  const out = {};
  for (const d of dims) out[d] = merged[d] / sum;
  return out;
}

function normSkill(s) {
  return s.trim().toLowerCase();
}

function parseYearMonth(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})(?:[./-](\d{1,2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1);
}

/** 简历经历总年限（年，1 位小数） */
export function totalExperienceYears(resume) {
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

function highestDegree(resume) {
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
 * 规则评分器：与 TS 版行为逐字段一致（对拍测试守门），评分是唯一事实源，
 * AI 解读（优势/差距/风险）只解释、不重打分。
 */
export function scoreMatch(input) {
  const { resume, profile, job } = input;
  const structured = job.structured ?? null;
  const dimensionScores = { skills: 0, experience: 0, education: 0, city: 0, salary: 0 };
  const gaps = [];
  const reasons = [];

  // —— 技能 ——
  const jobSkills = structured?.skills ?? [];
  const resumeSkillSet = new Set((resume.skills ?? []).map(normSkill));
  const totalWeight = jobSkills.reduce((s, j) => s + (j.weight || 1), 0);
  const matched = [];
  const missing = [];
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
  if (needRank <= 0 || needDegree === "不限") {
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
      Object.keys(weights).reduce((sum, dim) => sum + dimensionScores[dim] * weights[dim], 0) * 10,
    ) / 10;

  return { totalScore: Math.min(100, Math.max(0, totalScore)), dimensionScores, gaps, reasons };
}

// —— CLI 入口：stdin 读 JSON，stdout 写结果 ——

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    console.error('用法：echo \'{"resume":...,"job":...}\' | node match-scorer.mjs');
    process.exit(1);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("输入不是合法 JSON");
    process.exit(1);
  }
  if (!input || typeof input !== "object" || !input.resume) {
    console.error('输入缺少 "resume" 字段（ResumeContent 结构）');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(scoreMatch(input)));
}

import { pathToFileURL } from "node:url";

// 仅在直接执行（node match-scorer.mjs）时进入 CLI；被 import 时不消费 stdin
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  await main();
}
