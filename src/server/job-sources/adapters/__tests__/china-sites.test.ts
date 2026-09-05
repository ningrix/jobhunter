import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentEvents, jobs } from "@/db/schema";
import { listJobSources, hasJobSource } from "../../core/registry";
import { CHINA_SITES, extractWithPatterns } from "../../core/site-catalog";
import { registerBuiltinJobSources } from "../../builtin";
import { liepinAdapter } from "../liepin";
import { zhilianAdapter } from "../zhilian";
import { lagouAdapter } from "../lagou";
import { job51Adapter } from "../job51";
import type { JobSource } from "../../core/types";
import { ErrorCode } from "@/shared/errors";
import { importJobFromSource } from "../../import-service";
import { createTestUser, resetDb } from "@/testing/helpers";

beforeEach(resetDb);
registerBuiltinJobSources();

const JD = `高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
岗位职责：
- 负责核心业务前端开发与性能优化`;

// 四个国内站点的适配器与 URL 提取 fixtures（URL 规则 NEEDS_VERIFICATION，提取失败不阻塞导入）
const SITES: {
  id: string;
  adapter: JobSource;
  name: string;
  url: string;
  expectedId?: string;
}[] = [
  {
    id: "liepin",
    adapter: liepinAdapter,
    name: "猎聘",
    url: "https://www.liepin.com/job/19abcdef.shtml?dq=shanghai",
    expectedId: "19abcdef",
  },
  {
    id: "zhilian",
    adapter: zhilianAdapter,
    name: "智联招聘",
    url: "https://jobs.zhaopin.com/shanghai/CC123456789J00123456701.htm",
    expectedId: "CC123456789J00123456701",
  },
  {
    id: "lagou",
    adapter: lagouAdapter,
    name: "拉勾招聘",
    url: "https://www.lagou.com/wn/jobs/9876543.html",
    expectedId: "9876543",
  },
  {
    id: "job51",
    adapter: job51Adapter,
    name: "前程无忧",
    url: "https://jobs.51job.com/shanghai/123456789.html",
    expectedId: "123456789",
  },
];

describe("国内站点适配器（V3 Phase 1）", () => {
  it("全部内置来源已注册（boss/mock + 四个国内站）", () => {
    const ids = listJobSources().map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(["boss", "mock", "liepin", "zhilian", "lagou", "job51"]),
    );
    for (const s of CHINA_SITES) expect(hasJobSource(s.id)).toBe(true);
  });

  it.each(SITES)("能力声明统一为：仅辅助导入（$id）", ({ adapter }) => {
    const caps = adapter.capabilities();
    expect(caps.search).toBe(false);
    expect(caps.assistedImport).toBe(true);
    expect(caps.autoApply).toBe("none");
    expect(caps.requiresLogin).toBe(true);
    expect(adapter.search).toBeUndefined(); // 接口层面不支持自动搜索
    expect(adapter.capabilities().notes).toContain("无公开 API");
  });

  it.each(SITES)("URL 提取 sourceJobId（NEEDS_VERIFICATION 规则按 fixtures 验证）", async ({ adapter, url, expectedId, id }) => {
    const u = await adapter.importAssisted!({ url, text: JD });
    expect(u.source).toBe(id);
    if (expectedId) expect(u.sourceJobId).toBe(expectedId);
  });

  it.each(SITES)("URL 无法提取时不阻塞导入（宽松降级，$id）", async ({ adapter, id }) => {
    const u = await adapter.importAssisted!({ url: `https://www.${id}.example.com/unknown/path`, text: JD });
    expect(u.sourceJobId).toBeUndefined();
  });

  it.each(SITES)("缺 JD → IMPORT_INVALID 且提示语含站名（$id）", async ({ adapter, name }) => {
    const err = (await adapter.importAssisted!({ url: "https://x.example.com/1" }).catch((e: unknown) => e)) as Error & { code?: number };
    expect(err.code).toBe(ErrorCode.IMPORT_INVALID);
    expect(err.message).toContain(name);
  });

  it("导入全链路（liepin）：落库 source/sourceJobId/fingerprint + 审计；重复导入幂等", async () => {
    const { user } = await createTestUser();
    const site = SITES[0];
    const first = await importJobFromSource(user.id, {
      source: site.id,
      url: site.url,
      text: JD,
      rawData: { companyName: "示例网络" },
    });
    expect(first.dedupe).toBe("NEW");
    expect(first.job.source).toBe("liepin");
    expect(first.job.sourceJobId).toBe(site.expectedId);
    expect(first.job.fingerprint).toBeTruthy();

    const again = await importJobFromSource(user.id, {
      source: site.id,
      url: site.url,
      text: JD,
      rawData: { companyName: "示例网络" },
    });
    expect(again.dedupe).toBe("EXACT_DUPLICATE");
    expect(again.job.id).toBe(first.job.id);

    const dbJobs = await getDb().select().from(jobs).where(eq(jobs.source, "liepin"));
    expect(dbJobs).toHaveLength(1);
    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.jobId, first.job.id));
    expect(events.length).toBeGreaterThanOrEqual(2); // NEW + EXACT_DUPLICATE 各一条
  });

  it("站点目录元数据完整且全部标记 NEEDS_VERIFICATION", () => {
    for (const s of CHINA_SITES) {
      expect(s.name).toBeTruthy();
      expect(s.homepage).toMatch(/^https:\/\//);
      expect(s.needsVerification).toBe(true);
    }
    expect(extractWithPatterns(undefined, [/a(\d+)/])).toBeUndefined();
    expect(extractWithPatterns("https://x.com/a42", [/a(\d+)/])).toBe("42");
  });
});
