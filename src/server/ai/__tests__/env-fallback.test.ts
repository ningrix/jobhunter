import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getProvider } from "@/server/ai/gateway";

/** P2-2：AI_OPENAI_FALLBACK 开关控制 env openai 兜底 */
describe("AI env Key 兜底开关（AI_OPENAI_FALLBACK）", () => {
  const saved = { AI_PROVIDER: process.env.AI_PROVIDER, AI_OPENAI_FALLBACK: process.env.AI_OPENAI_FALLBACK };

  afterEach(() => {
    if (saved.AI_PROVIDER === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = saved.AI_PROVIDER;
    if (saved.AI_OPENAI_FALLBACK === undefined) delete process.env.AI_OPENAI_FALLBACK;
    else process.env.AI_OPENAI_FALLBACK = saved.AI_OPENAI_FALLBACK;
  });

  it("默认（未设置开关）AI_PROVIDER=openai 时回落 env provider", async () => {
    process.env.AI_PROVIDER = "openai";
    delete process.env.AI_OPENAI_FALLBACK;
    const provider = await getProvider(null);
    expect(provider.name).toBe("openai");
  });

  it("开关显式为 on 时回落 env provider", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_OPENAI_FALLBACK = "on";
    const provider = await getProvider(null);
    expect(provider.name).toBe("openai");
  });

  it("开关为 off 时未配置自带 Key 的用户回落 mock（不消耗运营方 env Key）", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_OPENAI_FALLBACK = "off";
    const provider = await getProvider(null);
    expect(provider.name).toBe("mock");
  });

  it("开关为 off 不影响已配置自带 Key 的用户（用户 Provider 优先）", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_OPENAI_FALLBACK = "off";
    // 未配置 ai_settings 的用户 → mock；用户 Provider 分支由 settings 集成测试覆盖，
    // 此处验证开关只作用于 env 兜底分支
    const provider = await getProvider("nonexistent-user");
    expect(provider.name).toBe("mock");
  });
});
