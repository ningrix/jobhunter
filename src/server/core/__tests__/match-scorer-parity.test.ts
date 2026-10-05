import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { scoreMatch } from "../match-scorer";
import type { ResumeContent, JobStructured, MatchWeights } from "@/shared/types";

/**
 * S1 skill 分发层：skills/job-match/scripts/match-scorer.mjs 是 TS 评分器的
 * 零依赖移植（skill 必须脱离 node_modules 自包含）。本测试用同一批种子输入
 * 对拍两份实现，逐字段一致才算通过——任一侧改动都必须双向同步。
 */

const mjsPath = path.resolve(process.cwd(), "skills/job-match/scripts/match-scorer.mjs");

const resume: ResumeContent = {
  basics: { name: "张三", city: "上海", title: "Java 后端" },
  summary: "5 年 Java 后端",
  skills: ["Java", "MySQL", "Kafka", "Redis"],
  experience: [
    {
      company: "A 科技",
      title: "后端工程师",
      start: "2020-03",
      end: "2023-08",
      highlights: ["订单查询 P95 从 1.2s 降至 180ms"],
    },
  ],
  education: [{ school: "X 大学", major: "计算机", degree: "本科", start: "2016-09", end: "2020-06" }],
  projects: [],
};

const jd: JobStructured = {
  title: "资深 Java 工程师",
  city: "上海",
  salaryMin: 25,
  salaryMax: 40,
  experienceYearsMin: 5,
  education: "本科",
  skills: [
    { name: "Java", weight: 5 },
    { name: "MySQL", weight: 4 },
    { name: "Kafka", weight: 3 },
    { name: "Kubernetes", weight: 2 },
  ],
  responsibilities: [],
  requirements: [],
};

interface CaseInput {
  resume: ResumeContent;
  profile: { expectedCity?: string | null; salaryMin?: number | null; salaryMax?: number | null } | null;
  job: { city?: string | null; salaryMin?: number | null; salaryMax?: number | null; structured?: JobStructured | null };
  weights?: MatchWeights;
}

const cases: Array<[string, CaseInput]> = [
  ["标准命中（部分技能 + 满经验 + 薪资重合）", { resume, profile: { expectedCity: "上海", salaryMin: 15, salaryMax: 25 }, job: { city: "上海", structured: jd } }],
  [
    "全缺口（学历降两级 + 城市不一致 + 薪资不足 + 多技能缺失）",
    {
      resume: { ...resume, skills: ["PHP"], education: [{ school: "X", major: "CS", degree: "大专", start: "2016-09", end: "2020-06" }], experience: [{ ...resume.experience[0], start: "2024-01", end: "2024-06" }] },
      profile: { expectedCity: "北京", salaryMin: 30, salaryMax: 50 },
      job: { city: "深圳", structured: { ...jd, education: "硕士" } },
    },
  ],
  ["自定义权重向量（城市拉满）", { resume, profile: null, job: { city: "上海", structured: jd }, weights: { skills: 4, experience: 2, education: 1, city: 10, salary: 1 } }],
  ["全 0 权重回落默认", { resume, profile: null, job: { city: "上海", structured: jd }, weights: { skills: 0, experience: 0, education: 0, city: 0, salary: 0 } }],
  ["非法权重（负数/NaN/非数值）被忽略", { resume, profile: null, job: { city: "上海", structured: jd }, weights: { skills: -3, experience: Number.NaN, education: 1 } as unknown as MatchWeights }],
  ["无 structured（技能中性分 + 缺省学历）", { resume, profile: null, job: { city: "上海" } }],
  ["仅年份日期 + 经验不足", { resume: { ...resume, experience: [{ ...resume.experience[0], start: "2025", end: "2025-06" }] }, profile: null, job: { structured: { ...jd, experienceYearsMin: 3 } } }],
  ["双方薪资均缺（中性分）+ 城市信息不完整", { resume: { ...resume, basics: {} }, profile: null, job: { structured: { ...jd, city: undefined, salaryMin: undefined, salaryMax: undefined } } }],
  ["薪资高于期望（90 分支）", { resume, profile: { salaryMin: 5, salaryMax: 8 }, job: { structured: jd } }],
  ["null profile + 空权重键", { resume, profile: null, job: { city: "上海", structured: jd }, weights: {} }],
];

function runMjs(input: CaseInput): unknown {
  const res = spawnSync("node", [mjsPath], { input: JSON.stringify(input), encoding: "utf8" });
  if (res.status !== 0 || res.stderr) {
    throw new Error(`mjs 执行失败: status=${res.status} stderr=${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

describe("match-scorer.mjs 与 TS 版对拍（skill 分发层防漂移）", () => {
  it.each(cases.map(([name]) => name))("种子：%s", (name) => {
    const input = cases.find(([n]) => n === name)![1];
    const ts = scoreMatch(input);
    const mjs = runMjs(input);
    expect(mjs).toEqual({
      totalScore: ts.totalScore,
      dimensionScores: ts.dimensionScores,
      gaps: ts.gaps,
      reasons: ts.reasons,
    });
  });

  it("mjs 优先级：job.salary 覆盖 structured.salary", () => {
    const input: CaseInput = {
      resume,
      profile: { salaryMin: 30, salaryMax: 50 },
      job: { structured: jd, salaryMin: 5, salaryMax: 8 },
    };
    const ts = scoreMatch(input);
    expect(runMjs(input)).toEqual({
      totalScore: ts.totalScore,
      dimensionScores: ts.dimensionScores,
      gaps: ts.gaps,
      reasons: ts.reasons,
    });
  });
});
