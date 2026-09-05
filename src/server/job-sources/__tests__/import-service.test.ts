import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentEvents, jobs } from "@/db/schema";
import { importJobFromSource } from "../import-service";
import { registerJobSource } from "../core/registry";
import { ErrorCode } from "@/shared/errors";
import { createTestUser, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

const BOSS_JD = `高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
岗位职责：
- 负责核心业务前端开发与性能优化`;

const BOSS_URL = "https://www.zhipin.com/job_detail/1a2b3c.html?lid=1";

describe("import-service 来源导入闭环", () => {
  it("BOSS 辅助导入：职位落库且 source/sourceUrl/sourceJobId/fingerprint/structured 正确，并写 Agent 审计", async () => {
    const { user } = await createTestUser();
    const { job, dedupe, warnings } = await importJobFromSource(user.id, {
      source: "boss",
      url: BOSS_URL,
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });

    expect(dedupe).toBe("NEW");
    expect(warnings).toHaveLength(0);
    expect(job.source).toBe("boss");
    expect(job.sourceJobId).toBe("1a2b3c");
    expect(job.sourceUrl).toBe(BOSS_URL);
    expect(job.fingerprint).toBeTruthy();
    expect(job.city).toBe("上海");
    expect(job.salaryMax).toBe(25);
    expect(job.structured?.skills.map((s) => s.name)).toContain("React");
    expect(job.companyName).toBe("未来科技");

    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.jobId, job.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("import");
    expect(events[0].result).toBe("success");
    expect((events[0].detail as { dedupe?: string }).dedupe).toBe("NEW");
  });

  it("重复导入同一职位 → EXACT_DUPLICATE，不创建第二条", async () => {
    const { user } = await createTestUser();
    const first = await importJobFromSource(user.id, {
      source: "boss",
      url: BOSS_URL,
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    const again = await importJobFromSource(user.id, {
      source: "boss",
      url: BOSS_URL,
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    expect(again.dedupe).toBe("EXACT_DUPLICATE");
    expect(again.job.id).toBe(first.job.id);
    expect(again.warnings[0]).toContain("未重复创建");

    const all = await getDb().select().from(jobs).where(eq(jobs.userId, user.id));
    expect(all).toHaveLength(1);
  });

  it("跨平台相同内容（BOSS → mock）→ 指纹命中 EXACT_DUPLICATE", async () => {
    const { user } = await createTestUser();
    await importJobFromSource(user.id, {
      source: "boss",
      url: BOSS_URL,
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    const r = await importJobFromSource(user.id, {
      source: "mock",
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    expect(r.dedupe).toBe("EXACT_DUPLICATE");
  });

  it("同公司同职位同城但 JD 改写 → POSSIBLE_DUPLICATE 并标记 possibleDuplicateOf", async () => {
    const { user } = await createTestUser();
    const first = await importJobFromSource(user.id, {
      source: "boss",
      url: BOSS_URL,
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    const rewritten = await importJobFromSource(user.id, {
      source: "boss",
      url: "https://www.zhipin.com/job_detail/ffff99.html",
      text: `${BOSS_JD}\n福利：下午茶、年度旅游、股票期权、弹性工作（改写版本）`,
      rawData: { companyName: "未来科技" },
    });
    expect(rewritten.dedupe).toBe("POSSIBLE_DUPLICATE");
    expect(rewritten.warnings[0]).toContain("疑似");
    expect(rewritten.job.id).not.toBe(first.job.id);
    expect((rewritten.job.rawData as { possibleDuplicateOf?: string }).possibleDuplicateOf).toBe(
      first.job.id,
    );
  });

  it("未知来源 → 7001/404；不支持导入的来源 → 7002/503", async () => {
    const { user } = await createTestUser();
    const missing = await importJobFromSource(user.id, { source: "nope", text: BOSS_JD }).catch(
      (e) => e,
    );
    expect(missing).toMatchObject({ code: ErrorCode.SOURCE_NOT_FOUND, httpStatus: 404 });

    registerJobSource({
      id: "search-only",
      meta: () => ({
        id: "search-only",
        name: "仅搜索",
        status: "available",
        capabilities: { search: true, assistedImport: false, autoApply: "none", requiresLogin: false },
      }),
      capabilities: () => ({
        search: true,
        assistedImport: false,
        autoApply: "none",
        requiresLogin: false,
      }),
      healthCheck: async () => ({ ok: true, detail: "ok" }),
    });
    const unsupported = await importJobFromSource(user.id, { source: "search-only", text: BOSS_JD }).catch(
      (e) => e,
    );
    expect(unsupported).toMatchObject({ code: ErrorCode.SOURCE_UNAVAILABLE, httpStatus: 503 });
  });

  it("用户隔离：A 导入的职位不影响 B 的去重判定", async () => {
    const { user: u1 } = await createTestUser("i1@t.cn");
    const { user: u2 } = await createTestUser("i2@t.cn");
    await importJobFromSource(u1.id, { source: "boss", url: BOSS_URL, text: BOSS_JD, rawData: { companyName: "未来科技" } });
    const r = await importJobFromSource(u2.id, { source: "boss", url: BOSS_URL, text: BOSS_JD, rawData: { companyName: "未来科技" } });
    expect(r.dedupe).toBe("NEW");
  });
});
