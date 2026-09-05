import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiUsageLogs, aiTasks } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { runAI } from "@/server/ai/gateway";
import { enqueueTask, executeTask, getTask } from "@/server/ai/runner";
import { MockProvider, scanSalary, scanYears } from "@/server/ai/providers/mock";
import { createTestUser, resetDb } from "@/testing/helpers";

const SAMPLE_JD = `招聘：高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
3、了解 Docker 者优先
岗位职责：
- 负责核心业务前端开发与性能优化`;

beforeEach(resetDb);

describe("mock provider scanners", () => {
  it("薪资/年限/学历扫描", () => {
    expect(scanSalary("薪资 15-25K")).toEqual({ min: 15, max: 25 });
    expect(scanYears("3年以上前端开发经验")).toBe(3);
    expect(scanYears("5年经验")).toBe(5);
  });
});

describe("AI gateway", () => {
  it("parse_jd：结构化解析并落用量日志", async () => {
    const { user } = await createTestUser();
    const { result, meta } = await runAI<Record<string, unknown>>(
      "parse_jd",
      { text: SAMPLE_JD },
      { userId: user.id },
    );

    const s = result as Record<string, unknown>;
    expect(s.city).toBe("上海");
    expect(s.salaryMin).toBe(15);
    expect(s.salaryMax).toBe(25);
    expect(s.experienceYearsMin).toBe(3);
    expect(s.education).toBe("本科");
    const skills = s.skills as { name: string }[];
    expect(skills.map((k) => k.name)).toContain("React");
    expect(meta.provider).toBe("mock");
    expect(meta.promptTokens).toBeGreaterThan(0);

    const logs = await getDb().select().from(aiUsageLogs).where(eq(aiUsageLogs.userId, user.id));
    expect(logs).toHaveLength(1);
    expect(logs[0].scene).toBe("parse_jd");
  });

  it("超出日限额抛 9003", async () => {
    const { user } = await createTestUser();
    const db = getDb();
    const limit = Number(process.env.AI_DAILY_LIMIT ?? 50);
    await db.insert(aiUsageLogs).values(
      Array.from({ length: limit }, () => ({
        userId: user.id,
        scene: "x",
        provider: "mock",
        model: "mock-1",
      })),
    );
    const err = (await runAI("parse_jd", { text: SAMPLE_JD }, { userId: user.id }).catch(
      (e) => e,
    )) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.AI_LIMIT_EXCEEDED);
    expect(err.httpStatus).toBe(429);
  });

  it("optimize_resume：评分在 0-100 且给出建议", async () => {
    const { user } = await createTestUser();
    const { result } = await runAI<{ score: number; issues: string[]; suggestions: unknown[] }>(
      "optimize_resume",
      {
        content: {
          basics: { name: "张三" },
          summary: "",
          skills: ["React", "Vue"],
          experience: [
            { company: "A 公司", title: "前端", start: "2021-01", end: "至今", highlights: ["负责页面开发"] },
          ],
          education: [{ school: "某大学", major: "计算机", degree: "本科", start: "2017", end: "2021" }],
          projects: [],
        },
      },
      { userId: user.id },
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

describe("AI task runner", () => {
  it("enqueue → execute → succeeded，输出结构化结果；任务归属校验", async () => {
    const { user } = await createTestUser();
    const task = await enqueueTask(user.id, "parse_jd", { text: SAMPLE_JD });
    expect(task.status).toBe("queued");

    const done = await executeTask(task.id);
    expect(done.status).toBe("succeeded");
    const output = done.output as { structured: { city: string } };
    expect(output.structured.city).toBe("上海");

    const fetched = await getTask(user.id, task.id, { requireOwner: true });
    expect(fetched.id).toBe(task.id);

    // 其他用户不可见（requireOwner 时查询条件过滤）
    const { user: other } = await createTestUser();
    await expect(getTask(other.id, task.id, { requireOwner: true })).rejects.toMatchObject({
      code: ErrorCode.TASK_NOT_FOUND,
    });
  });

  it("未知任务类型执行后任务标记为 failed", async () => {
    const { user } = await createTestUser();
    const task = await enqueueTask(user.id, "parse_jd", { text: SAMPLE_JD });
    const db = getDb();
    await db.update(aiTasks).set({ type: "unknown_type" }).where(eq(aiTasks.id, task.id));

    const done = await executeTask(task.id);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("未知任务类型");
  });

  it("mock embed 向量确定性且归一化", async () => {
    const p = new MockProvider();
    const a = await p.embed("React 工程师 上海");
    const b = await p.embed("React 工程师 上海");
    expect(a.vector).toEqual(b.vector);
    expect(a.vector).toHaveLength(64);
    const norm = Math.sqrt(a.vector.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});
