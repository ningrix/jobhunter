import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobs } from "@/db/schema";
import { resetDb, callRoute, createTestUser, expectOk } from "@/testing/helpers";
import { upsertAiSettings } from "@/server/ai/settings";
import { runRadarSearch } from "@/server/radar/radar-service";
import type { AiTaskRow } from "@/server/ai/runner";
import { PUT as savePolicy } from "@/app/api/v1/policies/me/route";
import { POST as radarRunRoute } from "@/app/api/v1/radar/run/route";

/** Stage C：职位雷达全链路（stub 抓取 + 用户自备模型） */
describe("radar service", () => {
  let token: string;
  let userId: string;

  // 列表页：两条真实条目（其中一条城市不符），一条编造 URL 的假条目由服务端丢弃
  const LIST_HTML = `<html><body>
<ul>
<li><a href="/campus/job/abc123">保融科技 2027届运营管培生 上海 15-25K</a></li>
<li><a href="/campus/job/ghi789">北京星河科技 2027校招工程师 北京 20-30K</a></li>
</ul></body></html>`;

  const EXTRACTED = {
    jobs: [
      {
        companyName: "保融科技",
        title: "2027届运营管培生",
        city: "上海",
        salaryMin: 15,
        salaryMax: 25,
        jobType: "校招",
        employmentType: "全职",
        url: "/campus/job/abc123",
        postedNote: "2026-09-04发布",
      },
      {
        companyName: "编造公司",
        title: "不存在的高级岗位",
        city: "上海",
        url: "/campus/job/fake999",
      },
      {
        companyName: "北京星河科技",
        title: "2027校招工程师",
        city: "北京",
        url: "/campus/job/ghi789",
      },
    ],
  };

  beforeEach(async () => {
    await resetDb();
    const u = await createTestUser();
    token = u.token;
    userId = u.user.id;
    // 雷达依赖自备模型：配置后 provider=openai，runAI 走 stub fetch
    await upsertAiSettings(userId, { model: "glm-5.3", apiKey: "sk-radar-test-key-123" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("liepin.com")) {
          return new Response(LIST_HTML, { status: 200 });
        }
        if (url.includes("chat/completions")) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(EXTRACTED) } }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }) as unknown as typeof fetch,
    );
  }

  async function task(): Promise<AiTaskRow> {
    return {
      id: `task-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: "radar_search",
      status: "running",
    } as AiTaskRow;
  }

  it("全链路：抓取→抽取→编造URL丢弃→城市过滤→入库（带条件）", async () => {
    await callRoute(savePolicy, {
      method: "PUT",
      url: "/api/v1/policies/me",
      token,
      body: { cities: ["上海"], maxExperienceYears: 0 },
    });
    stubFetch();

    const summary = await runRadarSearch(userId, await task());
    expect(summary.importedTotal).toBe(1);
    expect(summary.sites[0].extracted).toBe(3);
    expect(summary.sites[0].filtered).toBe(2); // 编造 URL 1 条 + 城市不符 1 条

    const rows = await getDb().select().from(jobs).where(eq(jobs.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].companyName).toBe("保融科技");
    expect(rows[0].source).toBe("radar");
    expect(rows[0].city).toBe("上海");
    expect(rows[0].sourceUrl).toContain("/campus/job/abc123");
  });

  it("重复扫描：三级去重生效，不重复入库", async () => {
    stubFetch();
    await runRadarSearch(userId, await task());
    const second = await runRadarSearch(userId, await task());
    expect(second.importedTotal).toBe(0);
    // 首轮入库的 2 条（上海+北京均入，本用例未设城市条件）二扫全部命中去重
    expect(second.duplicatesTotal).toBe(2);
  });

  it("POST /radar/run 未配置自备模型时被拒绝", async () => {
    const u2 = await createTestUser();
    const res = await callRoute(radarRunRoute, {
      method: "POST",
      url: "/api/v1/radar/run",
      token: u2.token,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("自备模型");
  });
});
