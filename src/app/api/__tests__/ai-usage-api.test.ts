import { describe, expect, it, beforeEach } from "vitest";
import { POST as createResumeRoute } from "@/app/api/v1/resumes/route";
import { POST as optimizeRoute } from "@/app/api/v1/resumes/[id]/optimize/route";
import { GET as aiUsageRoute } from "@/app/api/v1/ai-usage/route";
import { executeTask } from "@/server/ai/runner";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import { emptyResumeContent } from "@/shared/types";

beforeEach(resetDb);

const CONTENT = {
  ...emptyResumeContent(),
  basics: { name: "张三", city: "上海", title: "前端工程师" },
  summary: "5 年前端经验",
  skills: ["React", "TypeScript", "Node.js"],
  experience: [
    {
      company: "A科技",
      title: "高级前端",
      start: "2021-06",
      end: "至今",
      highlights: ["首屏加载提升 40%"],
    },
  ],
};

async function runOptimizeTask(token: string) {
  const createRes = await callRoute(createResumeRoute, {
    method: "POST",
    token,
    body: { title: "主简历", content: CONTENT },
  });
  const resumeId = (expectOk(createRes.json) as { resume: { id: string } }).resume.id;
  const optRes = await callRoute(optimizeRoute, {
    method: "POST",
    token,
    params: { id: resumeId },
    body: { jobTitle: "资深前端工程师" },
  });
  const { taskId } = expectOk(optRes.json) as { taskId: string };
  await executeTask(taskId);
  return { resumeId, taskId };
}

describe("GET /api/v1/ai-usage（V4.0 成本汇总）", () => {
  it("跑完 optimize 任务后可汇总调用次数、token 与成本", async () => {
    const { token } = await createTestUser();
    await runOptimizeTask(token);

    const res = await callRoute(aiUsageRoute, { token });
    const data = expectOk(res.json) as {
      today: { calls: number; promptTokens: number; completionTokens: number; cost: number };
      total: { calls: number; cost: number };
      byScene: { scene: string; calls: number; cost: number }[];
    };

    expect(data.today.calls).toBeGreaterThanOrEqual(1);
    expect(data.today.promptTokens).toBeGreaterThan(0);
    // mock 模型免费：成本应为 0，但 token 与次数必须有值
    expect(data.today.cost).toBe(0);
    expect(data.total.calls).toBe(data.today.calls);
    const optimize = data.byScene.find((s) => s.scene === "optimize_resume");
    expect(optimize).toBeDefined();
    expect(optimize!.calls).toBeGreaterThanOrEqual(1);
  });

  it("未登录返回 401；用户隔离：看不到别人的用量", async () => {
    const anon = await callRoute(aiUsageRoute, {});
    expect(anon.status).toBe(401);

    const { token: tokenA } = await createTestUser();
    const { token: tokenB } = await createTestUser();
    await runOptimizeTask(tokenA);

    const resB = await callRoute(aiUsageRoute, { token: tokenB });
    const dataB = expectOk(resB.json) as { total: { calls: number } };
    expect(dataB.total.calls).toBe(0);
  });
});
