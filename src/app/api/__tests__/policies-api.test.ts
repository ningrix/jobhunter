import { describe, expect, it, beforeEach } from "vitest";
import { GET as getPolicyRoute, PUT as putPolicyRoute } from "@/app/api/v1/policies/me/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

describe("policy API（求职条件中心）", () => {
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
});
