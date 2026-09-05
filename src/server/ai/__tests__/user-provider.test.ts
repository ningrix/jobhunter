import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, createTestUser } from "@/testing/helpers";
import { modelBaseUrl } from "@/shared/ai-models";
import { runAI } from "../gateway";
import { upsertAiSettings } from "../settings";

/** Stage A-4：网关用户级 Provider —— 用户配置优先、无配置回落 env、限额照常、key 不泄漏 */
describe("gateway user-level provider", () => {
  const KEY = "sk-user-provider-test-key-777";

  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("无用户配置时回落 env 默认（mock）", async () => {
    const { user } = await createTestUser();
    const { meta } = await runAI("parse_jd", { text: "运营专员 电商运营 上海" }, { userId: user.id });
    expect(meta.provider).toBe("mock");
  });

  it("有启用的用户配置时走用户专属 provider，优先于 env mock", async () => {
    const { user } = await createTestUser();
    await upsertAiSettings(user.id, { model: "glm-5.3", apiKey: KEY });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ title: "运营专员", skills: [] }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, meta } = await runAI(
      "parse_jd",
      { text: "运营专员，负责电商店铺运营，上海" },
      { userId: user.id },
    );
    expect(meta.provider).toBe("openai");
    expect(meta.model).toBe("glm-5.3");
    expect(result).toEqual({ title: "运营专员", skills: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${modelBaseUrl("glm-5.3")}/chat/completions`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(init.body as string).toContain("glm-5.3");
  });

  it("用户 provider 失败时抛 9004，错误消息不泄漏 key", async () => {
    const { user } = await createTestUser();
    await upsertAiSettings(user.id, { model: "glm-5.3", apiKey: KEY });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => `Unauthorized: invalid key ${KEY}`,
      }),
    );
    const err = await runAI("parse_jd", { text: "x" }, { userId: user.id }).catch(
      (e: unknown) => e,
    );
    expect((err as { code: number }).code).toBe(9004);
    expect((err as Error).message).not.toContain(KEY);
  });

  it("enabled=false 的用户配置回落 env mock", async () => {
    const { user } = await createTestUser();
    await upsertAiSettings(user.id, {
      model: "glm-5.3",
      apiKey: KEY,
      enabled: false,
    });
    const { meta } = await runAI("parse_jd", { text: "x" }, { userId: user.id });
    expect(meta.provider).toBe("mock");
  });

  it("日限额对用户 provider 仍然生效", async () => {
    const prev = process.env.AI_DAILY_LIMIT;
    process.env.AI_DAILY_LIMIT = "1";
    try {
      const { user } = await createTestUser();
      await upsertAiSettings(user.id, { model: "glm-5.3", apiKey: KEY });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ title: "x", skills: [] }) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          text: async () => "",
        }),
      );
      await runAI("parse_jd", { text: "第一条 JD 内容" }, { userId: user.id });
      await expect(
        runAI("parse_jd", { text: "第二条 JD 内容" }, { userId: user.id }),
      ).rejects.toMatchObject({ code: 9003 });
    } finally {
      if (prev === undefined) delete process.env.AI_DAILY_LIMIT;
      else process.env.AI_DAILY_LIMIT = prev;
    }
  });
});
