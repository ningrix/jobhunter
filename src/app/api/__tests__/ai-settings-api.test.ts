import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import { modelBaseUrl } from "@/shared/ai-models";
import { resetDb, callRoute, createTestUser, expectOk } from "@/testing/helpers";
import { GET, PUT, DELETE } from "@/app/api/v1/settings/ai/route";
import { POST as TEST_POST } from "@/app/api/v1/settings/ai/test/route";

/** Stage A-3：用户自带 AI 凭据配置 API —— key 只写不读、掩码回显、URL 由模型名派生 */
describe("AI settings API", () => {
  let token: string;
  let userId: string;
  const KEY = "sk-user-key-123456789";
  const MODEL = "glm-4-flash";
  const DERIVED_BASE = modelBaseUrl(MODEL); // https://open.bigmodel.cn/api/paas/v4

  beforeEach(async () => {
    await resetDb();
    const u = await createTestUser();
    token = u.token;
    userId = u.user.id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("未配置时 GET 返回 configured:false 且 enabled 默认 true（防首次保存即停用）", async () => {
    const res = await callRoute(GET, { method: "GET", url: "/api/v1/settings/ai", token });
    const data = expectOk(res.json);
    expect(data.configured).toBe(false);
    expect(data.apiKeyMasked).toBeNull();
    expect(data.enabled).toBe(true);
  });

  it("首次 PUT 不带 apiKey 返回校验错误", async () => {
    const res = await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: MODEL },
    });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe(1001);
  });

  it("PUT 未知模型返回校验错误并列出可选清单", async () => {
    const res = await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: "unknown-model-x", apiKey: KEY },
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("暂不支持模型");
  });

  it("PUT 保存后 GET 只返回掩码，库里密文可解密还原，baseUrl 由模型派生", async () => {
    const res = await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: MODEL, apiKey: KEY },
    });
    const data = expectOk(res.json);
    expect(data.configured).toBe(true);
    expect(data.apiKeyMasked).toBe(maskSecret(KEY));
    expect(data.baseUrl).toBe(DERIVED_BASE);
    expect(JSON.stringify(data)).not.toContain(KEY);

    const [row] = await getDb()
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId));
    expect(row.baseUrl).toBe(DERIVED_BASE);
    expect(row.apiKeyEnc).not.toContain(KEY);
    expect(decryptSecret(row.apiKeyEnc)).toBe(KEY);
  });

  it("二次 PUT 只换模型不重发 key，密文保持不变", async () => {
    await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: MODEL, apiKey: KEY },
    });
    const [before] = await getDb()
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId));

    const res = await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: "glm-5.3" },
    });
    expectOk(res.json);
    const [after] = await getDb()
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId));
    expect(after.model).toBe("glm-5.3");
    expect(after.baseUrl).toBe(modelBaseUrl("glm-5.3"));
    expect(after.apiKeyEnc).toBe(before.apiKeyEnc);
  });

  it("用户间配置隔离", async () => {
    await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: MODEL, apiKey: KEY },
    });
    const other = await createTestUser();
    const res = await callRoute(GET, {
      method: "GET",
      url: "/api/v1/settings/ai",
      token: other.token,
    });
    expect(expectOk(res.json).configured).toBe(false);
  });

  it("DELETE 清除配置", async () => {
    await callRoute(PUT, {
      method: "PUT",
      url: "/api/v1/settings/ai",
      token,
      body: { model: MODEL, apiKey: KEY },
    });
    await callRoute(DELETE, { method: "DELETE", url: "/api/v1/settings/ai", token });
    const res = await callRoute(GET, { method: "GET", url: "/api/v1/settings/ai", token });
    expect(expectOk(res.json).configured).toBe(false);
  });

  describe("POST /settings/ai/test 连接测试", () => {
    const okPayload = {
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };

    it("保存前直接用表单值测试（stub fetch 成功）", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => okPayload,
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await callRoute(TEST_POST, {
        method: "POST",
        url: "/api/v1/settings/ai/test",
        token,
        body: { model: MODEL, apiKey: KEY },
      });
      const data = expectOk(res.json);
      expect(data.ok).toBe(true);
      expect(data.model).toBe(MODEL);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${DERIVED_BASE}/chat/completions`);
      expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    });

    it("上游报错时返回 ok:false，错误信息不泄漏完整 key", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({}),
          text: async () => `Unauthorized: invalid key ${KEY}`,
        }),
      );

      const res = await callRoute(TEST_POST, {
        method: "POST",
        url: "/api/v1/settings/ai/test",
        token,
        body: { model: MODEL, apiKey: KEY },
      });
      const data = expectOk(res.json);
      expect(data.ok).toBe(false);
      expect(String(data.error)).not.toContain(KEY);
    });

    it("已保存配置时可省略 apiKey（沿用已存模型与密钥）", async () => {
      await callRoute(PUT, {
        method: "PUT",
        url: "/api/v1/settings/ai",
        token,
        body: { model: MODEL, apiKey: KEY },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => okPayload,
          text: async () => "",
        }),
      );
      const res = await callRoute(TEST_POST, {
        method: "POST",
        url: "/api/v1/settings/ai/test",
        token,
        body: {},
      });
      expect(expectOk(res.json).ok).toBe(true);
    });

    it("无存量且缺 apiKey 返回校验错误", async () => {
      const res = await callRoute(TEST_POST, {
        method: "POST",
        url: "/api/v1/settings/ai/test",
        token,
        body: { model: MODEL },
      });
      expect(res.status).toBe(400);
    });
  });
});
