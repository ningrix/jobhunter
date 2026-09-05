import { describe, expect, it, beforeEach } from "vitest";
import { GET as listSourcesRoute } from "@/app/api/v1/job-sources/route";
import { POST as importRoute } from "@/app/api/v1/job-sources/[source]/import/route";
import { GET as listJobsRoute } from "@/app/api/v1/jobs/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

const BOSS_JD = `高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
岗位职责：
- 负责核心业务前端开发与性能优化`;

const BOSS_URL = "https://www.zhipin.com/job_detail/9f8e7d.html";

describe("job-sources API", () => {
  it("GET /job-sources 返回内置来源、能力模型与健康状态", async () => {
    const { token } = await createTestUser();
    const res = await callRoute(listSourcesRoute, { token });
    expect(res.status).toBe(200);
    const data = expectOk(res.json) as {
      sources: { id: string; name: string; capabilities: { assistedImport: boolean } }[];
      health: { id: string; ok: boolean }[];
    };
    const ids = data.sources.map((s) => s.id);
    expect(ids).toContain("boss");
    expect(ids).toContain("mock");
    const boss = data.sources.find((s) => s.id === "boss")!;
    expect(boss.name).toBe("BOSS直聘");
    expect(boss.capabilities.assistedImport).toBe(true);
    expect(data.health.find((h) => h.id === "boss")?.ok).toBe(true);
  });

  it("POST /job-sources/boss/import → 201 NEW；重复导入 → EXACT_DUPLICATE 幂等", async () => {
    const { token } = await createTestUser();
    const body = {
      url: BOSS_URL,
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    };
    const first = await callRoute(importRoute, { method: "POST", token, params: { source: "boss" }, body });
    expect(first.status).toBe(201);
    const r1 = expectOk(first.json) as {
      job: { id: string; source: string; sourceUrl: string; sourceJobId: string; fingerprint: string };
      dedupe: string;
    };
    expect(r1.dedupe).toBe("NEW");
    expect(r1.job.source).toBe("boss");
    expect(r1.job.sourceUrl).toBe(BOSS_URL);
    expect(r1.job.sourceJobId).toBe("9f8e7d");
    expect(r1.job.fingerprint).toBeTruthy();

    const again = await callRoute(importRoute, { method: "POST", token, params: { source: "boss" }, body });
    const r2 = expectOk(again.json) as { job: { id: string }; dedupe: string };
    expect(r2.dedupe).toBe("EXACT_DUPLICATE");
    expect(r2.job.id).toBe(r1.job.id);
  });

  it("jobs 列表支持 source 筛选（与旧筛选并存）", async () => {
    const { token } = await createTestUser();
    await callRoute(importRoute, {
      method: "POST",
      token,
      params: { source: "boss" },
      body: { url: BOSS_URL, text: BOSS_JD, rawData: { companyName: "未来科技" } },
    });
    const bossOnly = await callRoute(listJobsRoute, { token, url: "/?source=boss" });
    expect(expectOk(bossOnly.json)).toHaveLength(1);

    const pasteOnly = await callRoute(listJobsRoute, { token, url: "/?source=paste" });
    expect(expectOk(pasteOnly.json)).toHaveLength(0);

    const unfiltered = await callRoute(listJobsRoute, { token });
    expect(expectOk(unfiltered.json)).toHaveLength(1);
  });

  it("错误路径：未知来源 404/7001；JD 缺失 400/7003；未登录 401", async () => {
    const { token } = await createTestUser();
    const missing = await callRoute(importRoute, {
      method: "POST",
      token,
      params: { source: "nope" },
      body: { text: BOSS_JD },
    });
    expect(missing.status).toBe(404);
    expect(missing.json.code).toBe(7001);

    const noJd = await callRoute(importRoute, {
      method: "POST",
      token,
      params: { source: "boss" },
      body: { url: BOSS_URL },
    });
    expect(noJd.status).toBe(400);
    expect(noJd.json.code).toBe(7003);

    const noAuth = await callRoute(importRoute, {
      method: "POST",
      params: { source: "boss" },
      body: { text: BOSS_JD },
    });
    expect(noAuth.status).toBe(401);
  });
});
