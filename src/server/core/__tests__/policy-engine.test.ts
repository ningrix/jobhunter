import { describe, expect, it } from "vitest";
import { evaluatePolicy, type PolicyContext } from "../policy-engine";
import type { DeliveryPolicyRules } from "@/shared/types";

const BASE_JOB: PolicyContext["job"] = {
  companyName: "字节跳动",
  title: "Java 后端工程师",
  city: "深圳",
  salaryMin: 20,
  salaryMax: 35,
  employmentType: "全职",
  jobType: "社招",
  structured: { education: "本科", experienceYearsMin: 3 },
};

const BASE_CTX: PolicyContext = {
  mode: "manual",
  matchScore: 88,
  appliedToday: 0,
  job: BASE_JOB,
};

const CLEAN_RULES: DeliveryPolicyRules = {
  cities: ["深圳", "广州"],
  positions: ["后端", "Java"],
  minSalary: 15,
  education: "本科",
  maxExperienceYears: 5,
  companyBlacklist: ["某骗子公司"],
  companyWhitelist: [],
  minMatchScore: 80,
  acceptInternship: false,
  acceptCampus: false,
  dailyMaxApplications: 10,
};

describe("evaluatePolicy", () => {
  it("全部条件满足 → ALLOW", () => {
    const r = evaluatePolicy(CLEAN_RULES, BASE_CTX);
    expect(r.decision).toBe("ALLOW");
    expect(r.reasons).toHaveLength(0);
  });

  it("未配置任何规则 → ALLOW", () => {
    const r = evaluatePolicy({}, BASE_CTX);
    expect(r.decision).toBe("ALLOW");
  });

  it("白名单公司直接 ALLOW（且优先于黑名单）", () => {
    const r = evaluatePolicy(
      { ...CLEAN_RULES, companyWhitelist: ["字节"] },
      { ...BASE_CTX, matchScore: 10, appliedToday: 999 },
    );
    expect(r.decision).toBe("ALLOW");
    expect(r.reasons.join("")).toContain("白名单");
  });

  it("黑名单公司 → REJECT", () => {
    const r = evaluatePolicy({ companyBlacklist: ["字节"] }, BASE_CTX);
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("黑名单");
  });

  it("城市不匹配 → REJECT", () => {
    const r = evaluatePolicy({ cities: ["上海"] }, BASE_CTX);
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("城市");
  });

  it("岗位关键词全不命中 → REJECT", () => {
    const r = evaluatePolicy({ positions: ["前端"] }, BASE_CTX);
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("岗位");
  });

  it("薪资上限低于最低要求 → REJECT", () => {
    const r = evaluatePolicy({ minSalary: 40 }, BASE_CTX);
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("薪资");
  });

  it("职位未标薪资 → REQUIRE_USER_CONFIRMATION（不猜）", () => {
    const r = evaluatePolicy(
      { minSalary: 15 },
      { ...BASE_CTX, job: { ...BASE_JOB, salaryMin: null, salaryMax: null } },
    );
    expect(r.decision).toBe("REQUIRE_USER_CONFIRMATION");
    expect(r.reasons.join("")).toContain("薪资");
  });

  it("职位学历要求高于我的学历 → REJECT", () => {
    const r = evaluatePolicy(
      { education: "本科" },
      { ...BASE_CTX, job: { ...BASE_JOB, structured: { education: "硕士" } } },
    );
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("学历");
  });

  it("经验要求超过可接受上限 → REJECT", () => {
    const r = evaluatePolicy(
      { maxExperienceYears: 2 },
      { ...BASE_CTX, job: { ...BASE_JOB, structured: { experienceYearsMin: 5 } } },
    );
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("经验");
  });

  it("不接受实习而职位是实习 → REJECT", () => {
    const r = evaluatePolicy(
      { acceptInternship: false },
      { ...BASE_CTX, job: { ...BASE_JOB, employmentType: "实习" } },
    );
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("实习");
  });

  it("不接受校招而职位是校招 → REJECT", () => {
    const r = evaluatePolicy(
      { acceptCampus: false },
      { ...BASE_CTX, job: { ...BASE_JOB, jobType: "校招" } },
    );
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.join("")).toContain("校招");
  });

  it("匹配分低于阈值：手动 → 需确认；自动 → 拒绝", () => {
    const rules: DeliveryPolicyRules = { minMatchScore: 90 };
    const manual = evaluatePolicy(rules, { ...BASE_CTX, matchScore: 82, mode: "manual" });
    expect(manual.decision).toBe("REQUIRE_USER_CONFIRMATION");
    const auto = evaluatePolicy(rules, { ...BASE_CTX, matchScore: 82, mode: "auto" });
    expect(auto.decision).toBe("REJECT");
  });

  it("无匹配分且设置了阈值：手动 → 需确认", () => {
    const r = evaluatePolicy({ minMatchScore: 80 }, { ...BASE_CTX, matchScore: null });
    expect(r.decision).toBe("REQUIRE_USER_CONFIRMATION");
  });

  it("达到每日上限：手动 → 需确认；自动 → 拒绝", () => {
    const rules: DeliveryPolicyRules = { dailyMaxApplications: 10 };
    const manual = evaluatePolicy(rules, { ...BASE_CTX, appliedToday: 10, mode: "manual" });
    expect(manual.decision).toBe("REQUIRE_USER_CONFIRMATION");
    const auto = evaluatePolicy(rules, { ...BASE_CTX, appliedToday: 10, mode: "auto" });
    expect(auto.decision).toBe("REJECT");
  });

  it("多个软性条件不满足 → 一次性给出全部确认原因", () => {
    const r = evaluatePolicy(
      { minMatchScore: 95, dailyMaxApplications: 1 },
      { ...BASE_CTX, matchScore: 60, appliedToday: 1 },
    );
    expect(r.decision).toBe("REQUIRE_USER_CONFIRMATION");
    expect(r.reasons).toHaveLength(2);
  });

  it("硬性拒绝优先于软性确认", () => {
    const r = evaluatePolicy(
      { cities: ["上海"], minMatchScore: 99 },
      { ...BASE_CTX, matchScore: 10 },
    );
    expect(r.decision).toBe("REJECT");
  });
});
