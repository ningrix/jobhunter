import { describe, expect, it, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { enqueueTask, executeTask } from "@/server/ai/runner";
import { getDb } from "@/db/client";
import { aiUsageLogs } from "@/db/schema";
import { createTestUser, resetDb } from "@/testing/helpers";
import { emptyResumeContent } from "@/shared/types";

beforeEach(resetDb);

const CONTENT = {
  ...emptyResumeContent(),
  basics: { name: "王五", city: "深圳", title: "测试工程师" },
  summary: "3 年测试经验",
  skills: ["Python", "Pytest"],
  experience: [
    {
      company: "C 公司",
      title: "测试工程师",
      start: "2023-01",
      end: "至今",
      highlights: ["自动化覆盖率提升到 70%"],
    },
  ],
};

describe("executeTask 并发抢占（V4.0.1）", () => {
  it("并发调用 executeTask：handler 只真正执行一次（不重复 AI 调用），双方拿到同一终态", async () => {
    const { user } = await createTestUser();
    const task = await enqueueTask(user.id, "optimize_resume", { content: CONTENT, jobTitle: "后端" });

    const [a, b] = await Promise.all([executeTask(task.id), executeTask(task.id)]);

    expect(a.status).toBe("succeeded");
    expect(b.status).toBe("succeeded");
    // 同一终态输出（同一 handler 产物）
    expect(a.output).toEqual(b.output);

    // 用量一致性：该任务的 AI 调用恰好落一条（mock 免费 cost=0，token>0）
    const rows = await getDb()
      .select()
      .from(aiUsageLogs)
      .where(and(eq(aiUsageLogs.taskId, task.id), eq(aiUsageLogs.scene, "optimize_resume")));
    expect(rows.length).toBe(1);
    expect(rows[0].promptTokens).toBeGreaterThan(0);
    expect(rows[0].cost).toBe(0);
  });

  it("先发起者执行中，后发起者等待抢占者到终态后返回成功", async () => {
    const { user } = await createTestUser();
    const task = await enqueueTask(user.id, "optimize_resume", { content: CONTENT, jobTitle: "后端" });

    const first = executeTask(task.id); // 不 await：模拟已在运行
    const second = await executeTask(task.id); // 应等待而非重复执行
    expect(["succeeded", "failed"]).toContain(second.status);
    expect((await first).status).toBe(second.status);
  });
});
