import { describe, expect, it, beforeEach } from "vitest";
import { POST as tailorRoute } from "@/app/api/v1/resumes/[id]/tailor/route";
import { PATCH as patchResumeRoute } from "@/app/api/v1/resumes/[id]/route";
import { GET as taskRoute } from "@/app/api/v1/ai-tasks/[id]/route";
import { POST as createResumeRoute } from "@/app/api/v1/resumes/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { executeTask } from "@/server/ai/runner";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import type { JobStructured, ResumeContent, ResumeTailorResult } from "@/shared/types";

beforeEach(resetDb);

const CONTENT: ResumeContent = {
  basics: { name: "张三", city: "上海", title: "Java 后端工程师" },
  summary: "3 年 Java 后端开发经验",
  skills: ["Java", "Spring Boot", "MySQL"],
  experience: [
    {
      company: "A 科技",
      title: "Java 工程师",
      start: "2022-01",
      end: "至今",
      highlights: ["负责订单系统后端开发，接口 P99 延迟下降 40%"],
    },
  ],
  education: [{ school: "某大学", major: "软件工程", degree: "本科", start: "2018", end: "2022" }],
  projects: [],
};

const JOB: JobStructured = {
  title: "高级 Java 后端工程师",
  city: "上海",
  salaryMin: 25,
  salaryMax: 40,
  experienceYearsMin: 5,
  education: "本科",
  skills: [
    { name: "Java", weight: 5 },
    { name: "Redis", weight: 4 },
    { name: "Spring Boot", weight: 4 },
    { name: "Docker", weight: 3 },
  ],
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
      title: "高级 Java 后端工程师",
      city: "上海",
      description: "JD",
      structured: JOB,
    },
  });
  const jobId = (expectOk(jobRes.json) as { job: { id: string } }).job.id;
  return { resumeId, jobId };
}

describe("resume style 持久化（V3.1 B2）", () => {
  it("PATCH style 保存并在详情中返回；非法 template → 400", async () => {
    const { token } = await createTestUser();
    const { resumeId } = await setup(token);

    const style = { template: "modern", font: "serif", accentColor: "#7c3aed", spacing: "relaxed" };
    const patched = await callRoute(patchResumeRoute, {
      method: "PATCH",
      token,
      params: { id: resumeId },
      body: { style },
    });
    expect((expectOk(patched.json) as { style: typeof style }).style).toEqual(style);

    const invalid = await callRoute(patchResumeRoute, {
      method: "PATCH",
      token,
      params: { id: resumeId },
      body: { style: { template: "rainbow", font: "sans", accentColor: "#123456", spacing: "normal" } },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json.code).toBe(1001);
  });
});

describe("JD → 简历定制（V3.1 B5）", () => {
  it("tailor 任务全链路：覆盖状态正确、missing 只进 gapAnalysis、无编造", async () => {
    const { token } = await createTestUser();
    const { resumeId, jobId } = await setup(token);

    const res = await callRoute(tailorRoute, {
      method: "POST",
      token,
      params: { id: resumeId },
      body: { jobId },
    });
    expect(res.status).toBe(202);
    const { taskId } = expectOk(res.json) as { taskId: string };

    const done = await executeTask(taskId);
    expect(done.status).toBe("succeeded");
    const tailor = (done.output as { tailor: ResumeTailorResult }).tailor;

    // 关键词覆盖：Java/Spring Boot 命中，Redis/Docker 缺失
    const byKeyword = Object.fromEntries(tailor.keywordCoverage.map((c) => [c.keyword, c.status]));
    expect(byKeyword["Java"]).toBe("matched");
    expect(byKeyword["Spring Boot"]).toBe("matched");
    expect(byKeyword["Redis"]).toBe("missing");
    expect(byKeyword["Docker"]).toBe("missing");

    // missing 只出现在 gapAnalysis（true_gap），绝不进入措辞建议（禁编造）
    const gapKeywords = tailor.gapAnalysis.filter((g) => g.category === "true_gap").map((g) => g.keyword);
    expect(gapKeywords).toEqual(expect.arrayContaining(["Redis", "Docker"]));
    for (const w of tailor.wordingSuggestions) {
      for (const kw of ["Redis", "Docker"]) {
        expect(w.after).not.toContain(kw);
        expect(w.before).not.toContain(kw);
      }
    }

    // 任务轮询接口可读
    const taskRes = await callRoute(taskRoute, { token, params: { id: taskId } });
    expect((expectOk(taskRes.json) as { status: string }).status).toBe("succeeded");
  });

  it("命中但未在亮点中提及的技能 → presentation 类缺口", async () => {
    const { token } = await createTestUser();
    const { resumeId, jobId } = await setup(token);
    // summary 只提 Java，不提 Spring Boot/MySQL → 后两者应为 presentation
    const res = await callRoute(tailorRoute, {
      method: "POST",
      token,
      params: { id: resumeId },
      body: { jobId },
    });
    const { taskId } = expectOk(res.json) as { taskId: string };
    const done = await executeTask(taskId);
    const tailor = (done.output as { tailor: ResumeTailorResult }).tailor;


    const categories = Object.fromEntries(tailor.gapAnalysis.map((g) => [g.keyword, g.category]));
    expect(categories["Spring Boot"]).toBe("presentation");
  });

  it("职位不存在 → 404/4001", async () => {
    const { token } = await createTestUser();
    const resumeRes = await callRoute(createResumeRoute, {
      method: "POST",
      token,
      body: { title: "R", content: CONTENT },
    });
    const resumeId = (expectOk(resumeRes.json) as { resume: { id: string } }).resume.id;
    const res = await callRoute(tailorRoute, {
      method: "POST",
      token,
      params: { id: resumeId },
      body: { jobId: "missing" },
    });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe(4001);
  });
});
