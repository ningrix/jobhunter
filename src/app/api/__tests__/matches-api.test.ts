import { describe, expect, it, beforeEach } from "vitest";
import { POST as matchRoute, GET as matchListRoute } from "@/app/api/v1/matches/route";
import { GET as matchDetailRoute } from "@/app/api/v1/matches/[id]/route";
import { POST as createResumeRoute } from "@/app/api/v1/resumes/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { executeTask } from "@/server/ai/runner";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import type { JobStructured, ResumeContent } from "@/shared/types";

beforeEach(resetDb);

const CONTENT: ResumeContent = {
  basics: { name: "张三", city: "上海" },
  summary: "5 年前端经验",
  skills: ["React", "TypeScript", "Node.js"],
  experience: [{ company: "A科技", title: "前端", start: "2020-01", end: "至今", highlights: ["性能优化 40%"] }],
  education: [{ school: "某某大学", major: "计算机", degree: "本科", start: "2016", end: "2020" }],
  projects: [],
};

const GOOD_JOB: JobStructured = {
  title: "高级前端工程师",
  city: "上海",
  salaryMin: 15,
  salaryMax: 25,
  experienceYearsMin: 3,
  education: "本科",
  skills: [{ name: "React", weight: 5 }, { name: "TypeScript", weight: 4 }],
  responsibilities: [],
  requirements: [],
};

async function setup(token: string) {
  const resumeRes = await callRoute(createResumeRoute, {
    method: "POST",
    token,
    body: { title: "主简历", content: CONTENT },
  });
  const resumeId = (expectOk(resumeRes.json) as { resume: { id: string } }).resume.id;

  const jobRes = await callRoute(createJobRoute, {
    method: "POST",
    token,
    body: {
      companyName: "未来科技",
      title: "高级前端工程师",
      city: "上海",
      salaryMin: 15,
      salaryMax: 25,
      description: "高级前端工程师 JD",
      structured: GOOD_JOB,
    },
  });
  const jobId = (expectOk(jobRes.json) as { job: { id: string } }).job.id;
  return { resumeId, jobId };
}

describe("match API", () => {
  it("计算匹配：规则结果落库，重复计算幂等更新", async () => {
    const { token } = await createTestUser();
    const { resumeId, jobId } = await setup(token);

    const res = await callRoute(matchRoute, {
      method: "POST",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    expect(res.status).toBe(201);
    const first = expectOk(res.json) as { match: { id: string; totalScore: number; dimensionScores: Record<string, number> }; taskId: string | null };
    expect(first.taskId).toBeNull();
    expect(first.match.totalScore).toBeGreaterThan(70);
    expect(first.match.dimensionScores.skills).toBe(100);

    // 再算一次：同一条记录被更新（幂等）
    const again = await callRoute(matchRoute, {
      method: "POST",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const second = expectOk(again.json) as { match: { id: string } };
    expect(second.match.id).toBe(first.match.id);

    // 详情可查
    const detail = await callRoute(matchDetailRoute, { token, params: { id: first.match.id } });
    expect((expectOk(detail.json) as { id: string }).id).toBe(first.match.id);
  });

  it("AI 解读：useAI=true → 任务回写 summary 与结构化解读（优势/差距/风险）", async () => {
    const { token } = await createTestUser();
    const { resumeId, jobId } = await setup(token);

    const res = await callRoute(matchRoute, {
      method: "POST",
      token,
      body: { jobId, resumeId, useAI: true },
    });
    const { taskId, match } = expectOk(res.json) as {
      taskId: string;
      match: { id: string; summary: null };
    };
    expect(taskId).toBeTruthy();
    await executeTask(taskId);

    const detail = await callRoute(matchDetailRoute, { token, params: { id: match.id } });
    const d = expectOk(detail.json) as {
      summary: string;
      reasons: unknown[];
      aiExplanation: {
        summary: string;
        strengths: string[];
        gaps: string[];
        risks: string[];
      } | null;
    };
    expect(d.summary).toContain("匹配");
    expect(d.reasons.length).toBeGreaterThan(0); // 规则原因保留（AI 不覆盖规则结果）
    expect(d.aiExplanation).toBeTruthy();
    expect(d.aiExplanation!.summary).toContain("匹配");
    expect(d.aiExplanation!.strengths.length).toBeGreaterThan(0);
    expect(Array.isArray(d.aiExplanation!.gaps)).toBe(true);
    expect(Array.isArray(d.aiExplanation!.risks)).toBe(true);
  });

  it("列表按分数倒序，支持 jobId 过滤", async () => {
    const { token } = await createTestUser();
    const { resumeId, jobId } = await setup(token);

    // 第二个职位：异地低薪 → 分数更低
    const job2Res = await callRoute(createJobRoute, {
      method: "POST",
      token,
      body: {
        companyName: "北方公司",
        title: "前端工程师",
        city: "北京",
        salaryMin: 5,
        salaryMax: 8,
        description: "JD2",
        structured: { ...GOOD_JOB, city: "北京", salaryMin: 5, salaryMax: 8 },
      },
    });
    const jobId2 = (expectOk(job2Res.json) as { job: { id: string } }).job.id;

    await callRoute(matchRoute, { method: "POST", token, body: { jobId, resumeId, useAI: false } });
    await callRoute(matchRoute, { method: "POST", token, body: { jobId: jobId2, resumeId, useAI: false } });

    const all = await callRoute(matchListRoute, { token });
    const list = expectOk(all.json) as { totalScore: number; jobTitle: string }[];
    expect(list).toHaveLength(2);
    expect(list[0].totalScore).toBeGreaterThanOrEqual(list[1].totalScore);
    expect(list[0].jobTitle).toBe("高级前端工程师");

    const only1 = await callRoute(matchListRoute, { token, url: `/?jobId=${jobId}` });
    expect(expectOk(only1.json)).toHaveLength(1);
  });

  it("职位不存在返回 404/4001", async () => {
    const { token } = await createTestUser();
    const resumeRes = await callRoute(createResumeRoute, {
      method: "POST",
      token,
      body: { title: "R", content: CONTENT },
    });
    const resumeId = (expectOk(resumeRes.json) as { resume: { id: string } }).resume.id;
    const res = await callRoute(matchRoute, {
      method: "POST",
      token,
      body: { jobId: "not-exist", resumeId, useAI: false },
    });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe(4001);
  });
});
