import { beforeEach, describe, expect, it } from "vitest";
import { GET as overviewRoute } from "@/app/api/v1/dashboard/overview/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { DELETE as deleteJobRoute } from "@/app/api/v1/jobs/[id]/route";
import { POST as createResumeRoute } from "@/app/api/v1/resumes/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

async function createJob(token: string, title: string): Promise<{ id: string }> {
  const res = await callRoute(createJobRoute, {
    method: "POST",
    token,
    body: {
      companyName: "未来科技",
      title,
      description: "负责核心业务前端开发与性能优化，熟悉 React / TypeScript",
    },
  });
  return (expectOk(res.json) as { job: { id: string } }).job;
}

describe("GET /api/v1/dashboard/overview", () => {
  it("未登录 401", async () => {
    const res = await callRoute(overviewRoute, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("职位计数与职位中心列表同口径：软删除的职位不再计入", async () => {
    const { token } = await createTestUser();
    await createJob(token, "前端工程师");
    const removed = await createJob(token, "后端工程师");

    const before = await callRoute(overviewRoute, { method: "GET", token });
    expect((expectOk(before.json) as { jobCount: number }).jobCount).toBe(2);

    await callRoute(deleteJobRoute, { method: "DELETE", token, params: { id: removed.id } });

    const after = await callRoute(overviewRoute, { method: "GET", token });
    expect((expectOk(after.json) as { jobCount: number }).jobCount).toBe(1);
  });

  it("简历计数只统计未删除简历", async () => {
    const { token } = await createTestUser();
    await callRoute(createResumeRoute, {
      method: "POST",
      token,
      body: { title: "主简历" },
    });
    const res = await callRoute(overviewRoute, { method: "GET", token });
    expect((expectOk(res.json) as { resumeCount: number }).resumeCount).toBe(1);
  });
});
