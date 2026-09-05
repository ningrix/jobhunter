import { describe, expect, it } from "vitest";
import { scoreMatch, totalExperienceYears } from "@/server/core/match-scorer";
import type { ResumeContent, JobStructured } from "@/shared/types";

const resume: ResumeContent = {
  basics: { name: "张三", city: "上海" },
  summary: "",
  skills: ["React", "TypeScript", "Node.js"],
  experience: [{ company: "A科技", title: "前端", start: "2020-01", end: "至今", highlights: [] }],
  education: [{ school: "某某大学", major: "计算机", degree: "本科", start: "2016", end: "2020" }],
  projects: [],
};

const structured: JobStructured = {
  title: "高级前端工程师",
  city: "上海",
  salaryMin: 15,
  salaryMax: 25,
  experienceYearsMin: 3,
  education: "本科",
  skills: [
    { name: "React", weight: 5 },
    { name: "TypeScript", weight: 4 },
    { name: "Node.js", weight: 3 },
  ],
  responsibilities: [],
  requirements: [],
};

const profile = { expectedCity: "上海", salaryMin: 15, salaryMax: 25 };

describe("match-scorer", () => {
  it("完全匹配时总分应很高（≥85）且无差距项", () => {
    const r = scoreMatch({ resume, profile, job: { city: "上海", salaryMin: 15, salaryMax: 25, structured } });
    expect(r.totalScore).toBeGreaterThanOrEqual(85);
    expect(r.gaps).toHaveLength(0);
    expect(r.dimensionScores.skills).toBe(100);
    expect(r.dimensionScores.experience).toBe(100);
    expect(r.dimensionScores.education).toBe(100);
    expect(r.dimensionScores.city).toBe(100);
    expect(r.dimensionScores.salary).toBe(100);
  });

  it("缺少技能会降低技能分并出现在差距清单", () => {
    const r = scoreMatch({
      resume: { ...resume, skills: ["React"] },
      profile,
      job: { city: "上海", salaryMin: 15, salaryMax: 25, structured },
    });
    expect(r.dimensionScores.skills).toBeLessThan(100);
    expect(r.gaps.find((g) => g.dimension === "skills")?.detail).toContain("TypeScript");
  });

  it("经验不足按比例给分", () => {
    const lowExp = {
      ...resume,
      experience: [{ company: "A", title: "FE", start: "2025-06", end: "至今", highlights: [] }],
    };
    const r = scoreMatch({
      resume: lowExp,
      profile,
      job: { city: "上海", salaryMin: 15, salaryMax: 25, structured },
    });
    expect(r.dimensionScores.experience).toBeLessThan(60);
    expect(r.gaps.find((g) => g.dimension === "experience")).toBeTruthy();
  });

  it("学历低一级得 60 分", () => {
    const dazhuan = {
      ...resume,
      education: [{ school: "X 学院", major: "软件", degree: "大专", start: "2016", end: "2019" }],
    };
    const r = scoreMatch({
      resume: dazhuan,
      profile,
      job: { city: "上海", salaryMin: 15, salaryMax: 25, structured },
    });
    expect(r.dimensionScores.education).toBe(60);
    expect(r.gaps.find((g) => g.dimension === "education")).toBeTruthy();
  });

  it("城市不一致得 30 分", () => {
    const r = scoreMatch({
      resume: { ...resume, basics: { ...resume.basics, city: "成都" } },
      profile,
      job: { city: "上海", salaryMin: 15, salaryMax: 25, structured },
    });
    expect(r.dimensionScores.city).toBe(30);
    expect(r.gaps.find((g) => g.dimension === "city")).toBeTruthy();
  });

  it("职位薪资低于期望下限得 40 分", () => {
    const r = scoreMatch({
      resume,
      profile: { ...profile, salaryMin: 30, salaryMax: 40 },
      job: { city: "上海", salaryMin: 15, salaryMax: 25, structured },
    });
    expect(r.dimensionScores.salary).toBe(40);
    expect(r.gaps.find((g) => g.dimension === "salary")).toBeTruthy();
  });

  it("总分在 0-100 且介于各维度之间", () => {
    const r = scoreMatch({
      resume: { ...resume, skills: [] },
      profile: { ...profile, salaryMin: 30, salaryMax: 40 },
      job: { city: "北京", salaryMin: 5, salaryMax: 8, structured },
    });
    expect(r.totalScore).toBeGreaterThanOrEqual(0);
    expect(r.totalScore).toBeLessThanOrEqual(100);
    expect(r.totalScore).toBeLessThan(60);
  });

  it("经历年限计算：2020-01 至今 ≈ 6 年以上", () => {
    expect(totalExperienceYears(resume)).toBeGreaterThanOrEqual(6);
  });
});

describe("match-scorer 权重向量（用户可调）", () => {
  const baseInput = {
    resume,
    profile,
    job: { city: "上海", salaryMin: 15, salaryMax: 25, structured },
  };

  it("不传 weights 时与默认行为完全一致（向后兼容）", () => {
    const legacy = scoreMatch(baseInput);
    const explicit = scoreMatch({ ...baseInput, weights: undefined });
    expect(explicit.totalScore).toBe(legacy.totalScore);
    expect(explicit.gaps).toEqual(legacy.gaps);
  });

  it("提高技能权重会放大技能差距：缺技能时总分更低", () => {
    const lack = { ...baseInput, resume: { ...resume, skills: ["React"] } };
    const def = scoreMatch(lack);
    const skillHeavy = scoreMatch({
      ...lack,
      weights: { skills: 8, experience: 1, education: 1, city: 1, salary: 1 },
    });
    expect(skillHeavy.totalScore).toBeLessThan(def.totalScore);
  });

  it("权重归一化：整体等比放大权重不改变总分", () => {
    const lack = { ...baseInput, resume: { ...resume, skills: ["React"] } };
    const w1 = scoreMatch({
      ...lack,
      weights: { skills: 4, experience: 2, education: 1, city: 1, salary: 1 },
    });
    const w2 = scoreMatch({
      ...lack,
      weights: { skills: 8, experience: 4, education: 2, city: 2, salary: 2 },
    });
    expect(w2.totalScore).toBe(w1.totalScore);
  });

  it("城市权重拉满且城市不一致：总分等于城市维度分", () => {
    const mismatch = { ...baseInput, resume: { ...resume, basics: { ...resume.basics, city: "成都" } } };
    const cityMax = scoreMatch({
      ...mismatch,
      weights: { skills: 0, experience: 0, education: 0, city: 10, salary: 0 },
    });
    expect(cityMax.totalScore).toBe(30);
  });

  it("全部权重为 0 时回落默认权重", () => {
    const r = scoreMatch({
      ...baseInput,
      weights: { skills: 0, experience: 0, education: 0, city: 0, salary: 0 },
    });
    const def = scoreMatch(baseInput);
    expect(r.totalScore).toBe(def.totalScore);
  });

  it("缺省维度回落默认值：只调 skills，其余沿用系统默认", () => {
    const lack = { ...baseInput, resume: { ...resume, skills: ["React"] } };
    const partial = scoreMatch({ ...lack, weights: { skills: 10 } });
    const def = scoreMatch(lack);
    expect(partial.totalScore).toBeLessThan(def.totalScore);
  });
});
