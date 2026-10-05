import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { computeCost, getPrice } from "../pricing";

beforeEach(() => {
  delete process.env.AI_PRICING_OVERRIDES;
});
afterEach(() => {
  delete process.env.AI_PRICING_OVERRIDES;
});

describe("getPrice 前缀匹配", () => {
  it("mock 与 glm-4-flash 免费", () => {
    expect(getPrice("mock")).toEqual({ input: 0, output: 0 });
    expect(getPrice("glm-4-flash-250414")).toEqual({ input: 0, output: 0 });
  });

  it("最长前缀优先：glm-4-flash 命中免费而非 glm-4 通用价", () => {
    expect(getPrice("glm-4-flash").input).toBeLessThan(getPrice("glm-4-plus").input);
  });

  it("已知国产模型命中价格表", () => {
    expect(getPrice("deepseek-chat").output).toBe(8);
    expect(getPrice("moonshot-v1-8k").input).toBe(12);
  });

  it("未知模型走兜底价（宁高勿低）", () => {
    expect(getPrice("some-new-model").input).toBeGreaterThan(0);
  });

  it("AI_PRICING_OVERRIDES 可覆盖前缀价与兜底价", () => {
    process.env.AI_PRICING_OVERRIDES = JSON.stringify({
      "deepseek-chat": { input: 1, output: 2 },
      "*": { input: 10, output: 10 },
    });
    expect(getPrice("deepseek-chat")).toEqual({ input: 1, output: 2 });
    expect(getPrice("unknown-model")).toEqual({ input: 10, output: 10 });
  });

  it("坏配置不抛错，回落默认表", () => {
    process.env.AI_PRICING_OVERRIDES = "not-json{";
    expect(getPrice("deepseek-chat").output).toBe(8);
  });

  it("V4.0.1 任意自定义前缀可覆盖（不限于内置表前缀）", () => {
    process.env.AI_PRICING_OVERRIDES = JSON.stringify({
      "my-model": { input: 3, output: 3 },
      "*": { input: 5, output: 5 },
    });
    expect(getPrice("my-model-x")).toEqual({ input: 3, output: 3 });
    expect(getPrice("my-model")).toEqual({ input: 3, output: 3 });
    expect(getPrice("totally-unknown")).toEqual({ input: 5, output: 5 });
  });

  it("V4.0.1 全局最长前缀优先：短覆盖不遮蔽长内置，长覆盖遮蔽短内置", () => {
    process.env.AI_PRICING_OVERRIDES = JSON.stringify({ deepseek: { input: 9, output: 9 } });
    // "deepseek-chat"(13) 比 "deepseek"(8) 长 → 内置价胜出
    expect(getPrice("deepseek-chat")).toEqual({ input: 2, output: 8 });
    // 内置表没有 "deepseek-new" 的更长前缀 → 命中覆盖
    expect(getPrice("deepseek-new")).toEqual({ input: 9, output: 9 });
    // 覆盖更长前缀时反过来了："glm-4-flash" 若被覆盖，则它(11)长于内置 "glm-4"(5) → 覆盖胜出
    process.env.AI_PRICING_OVERRIDES = JSON.stringify({ "glm-4-flash": { input: 1, output: 1 } });
    expect(getPrice("glm-4-flash")).toEqual({ input: 1, output: 1 });
    expect(getPrice("glm-4-plus").input).not.toBe(1);
  });
});

describe("computeCost 折算", () => {
  it("按 ¥/1M tokens 线性折算", () => {
    // deepseek-chat: in 2 / out 8 → 1M in + 0.5M out = 2 + 4 = 6 元
    expect(computeCost("deepseek-chat", 1_000_000, 500_000)).toBe(6);
  });

  it("小额调用保留 6 位小数", () => {
    // 1000 in + 200 out → (1000/1e6)*2 + (200/1e6)*8 = 0.002 + 0.0016 = 0.0036
    expect(computeCost("deepseek-chat", 1000, 200)).toBe(0.0036);
  });

  it("免费模型成本为 0", () => {
    expect(computeCost("mock", 10000, 10000)).toBe(0);
    expect(computeCost("glm-4-flash", 10000, 10000)).toBe(0);
  });
});
