import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentEvents } from "@/db/schema";
import { GET as getPolicyRoute, PUT as putPolicyRoute } from "@/app/api/v1/policies/me/route";
import { POST as createAppRoute } from "@/app/api/v1/applications/route";
import { POST as stageRoute } from "@/app/api/v1/applications/[id]/stage/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

async function seedJob(token: string, companyName: string) {
  const res = await callRoute(createJobRoute, {
    method: "POST",
    token,
    body: {
      companyName,
      title: "Java 后端工程师",
      city: "深圳",
      salaryMin: 20,
      salaryMax: 35,
      description: "Java 后端 JD",
    },
  });
  return (expectOk(res.json) as { job: { id: string } }).job.id;
}

describe("policy API 与投递门禁", () => {
  it("PUT 保存策略 → GET 读取一致", async () => {
    const { token } = await createTestUser();
    const rules = {
      cities: ["深圳"],
      positions: ["后端"],
      minSalary: 15,
      education: "本科",
      minMatchScore: 60,
      companyBlacklist: ["骗子公司"],
      dailyMaxApplications: 20,
    };
    const put = await callRoute(putPolicyRoute, { method: "PUT", token, body: rules });
    expect(put.status).toBe(200);
    const saved = expectOk(put.json) as { rules: typeof rules; isActive: boolean };
    expect(saved.rules).toMatchObject(rules);
    expect(saved.isActive).toBe(true);

    const got = await callRoute(getPolicyRoute, { token });
    const policy = expectOk(got.json) as { rules: typeof rules };
    expect(policy.rules.minSalary).toBe(15);
  });

  it("非法规则 → 400/1001；未配置时 GET 返回 null", async () => {
    const { token } = await createTestUser();
    const none = await callRoute(getPolicyRoute, { token });
    expect(expectOk(none.json)).toBeNull();

    const invalid = await callRoute(putPolicyRoute, {
      method: "PUT",
      token,
      body: { minSalary: 9999 },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json.code).toBe(1001);
  });

  it("黑名单公司：wishlist→applied 被 6030 拦截并给出原因，且记录 policy_check 审计", async () => {
    const { token, user } = await createTestUser();
    await callRoute(putPolicyRoute, {
      method: "PUT",
      token,
      body: { companyBlacklist: ["黑心"], cities: ["深圳"] },
    });
    const jobId = await seedJob(token, "黑心科技有限公司");

    const app = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId } })).json,
    ) as { id: string }).id;

    const moved = await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app },
      body: { toStage: "applied" },
    });
    expect(moved.status).toBe(403);
    expect(moved.json.code).toBe(6030);
    const reasons = (moved.json.details as { reasons: string[] })?.reasons ?? [];
    expect(reasons.join("")).toContain("黑名单");

    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.userId, user.id));
    expect(events.some((e) => e.action === "policy_check" && e.result === "blocked")).toBe(true);
  });

  it("黑名单之外的公司正常进入 applied（wishlist 不受策略影响）", async () => {
    const { token } = await createTestUser();
    await callRoute(putPolicyRoute, {
      method: "PUT",
      token,
      body: { companyBlacklist: ["黑心"], cities: ["深圳"], positions: ["后端"] },
    });
    const jobId = await seedJob(token, "正规公司");
    const app = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId } })).json,
    ) as { id: string }).id;
    const moved = await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app },
      body: { toStage: "applied" },
    });
    expect(moved.status).toBe(200);
    expect((expectOk(moved.json) as { stage: string }).stage).toBe("applied");
  });

  it("白名单公司绕过其他软硬条件直接放行", async () => {
    const { token } = await createTestUser();
    await callRoute(putPolicyRoute, {
      method: "PUT",
      token,
      body: { companyWhitelist: ["梦想"], cities: ["上海"], minMatchScore: 99 },
    });
    // 职位在深圳（不在目标城市）、无匹配分 → 会被硬拒，但白名单放行
    const res = await callRoute(createJobRoute, {
      method: "POST",
      token,
      body: {
        companyName: "梦想科技",
        title: "神秘岗位",
        city: "深圳",
        description: "神秘岗位 JD",
      },
    });
    const jobId = (expectOk(res.json) as { job: { id: string } }).job.id;
    const app = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId } })).json,
    ) as { id: string }).id;
    const moved = await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app },
      body: { toStage: "applied" },
    });
    expect(moved.status).toBe(200);
  });

  it("直接以 applied 阶段创建投递同样受策略拦截", async () => {
    const { token } = await createTestUser();
    await callRoute(putPolicyRoute, { method: "PUT", token, body: { cities: ["上海"] } });
    const jobId = await seedJob(token, "深圳公司");
    const created = await callRoute(createAppRoute, {
      method: "POST",
      token,
      body: { jobId, stage: "applied" },
    });
    expect(created.status).toBe(403);
    expect(created.json.code).toBe(6030);
  });
});
