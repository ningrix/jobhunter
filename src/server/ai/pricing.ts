/**
 * V4.0 AI 成本核算：按模型把 token 折算为人民币成本。
 *
 * 单价为 ¥ / 1M tokens。大模型价格随官方调整频繁，表内默认值仅用于成本核算口径，
 * 全部标注 NEEDS_VERIFICATION；可用环境变量覆盖：
 *   AI_PRICING_OVERRIDES={"deepseek-chat":{"input":2,"output":8},"*":{"input":2,"output":8}}
 * 其中 "*" 为未知模型兜底价（宁高勿低，防止成本黑洞）。
 */

interface ModelPrice {
  input: number; // ¥ / 1M input tokens
  output: number; // ¥ / 1M output tokens
}

/** 最长前缀命中；mock 与 glm-4-flash 免费 */
const PRICE_TABLE: { prefix: string; price: ModelPrice }[] = [
  { prefix: "mock", price: { input: 0, output: 0 } },
  { prefix: "glm-4-flash", price: { input: 0, output: 0 } },
  { prefix: "glm-4", price: { input: 5, output: 5 } }, // NEEDS_VERIFICATION
  { prefix: "deepseek-reasoner", price: { input: 4, output: 16 } }, // NEEDS_VERIFICATION
  { prefix: "deepseek-chat", price: { input: 2, output: 8 } }, // NEEDS_VERIFICATION
  { prefix: "moonshot-v1", price: { input: 12, output: 12 } }, // NEEDS_VERIFICATION
  { prefix: "qwen-max", price: { input: 2.4, output: 9.6 } }, // NEEDS_VERIFICATION
  { prefix: "qwen-plus", price: { input: 0.8, output: 2 } }, // NEEDS_VERIFICATION
  { prefix: "qwen-turbo", price: { input: 0.3, output: 0.6 } }, // NEEDS_VERIFICATION
  { prefix: "text-embedding", price: { input: 0.07, output: 0 } },
];

const FALLBACK_PRICE: ModelPrice = { input: 2, output: 8 };

function parseOverrides(raw: string | undefined): Map<string, ModelPrice> {
  const map = new Map<string, ModelPrice>();
  if (!raw) return map;
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ModelPrice>>;
    for (const [prefix, p] of Object.entries(parsed)) {
      if (typeof p?.input === "number" && typeof p?.output === "number") {
        map.set(prefix, { input: p.input, output: p.output });
      }
    }
  } catch {
    // 配置格式错误时忽略覆盖，走默认价格表（不因坏配置中断调用链）
  }
  return map;
}

export function getPrice(model: string): ModelPrice {
  const overrides = parseOverrides(process.env.AI_PRICING_OVERRIDES);
  // 候选前缀 = 内置表 ∪ 覆盖表（"*" 是兜底不是前缀）；按长度降序做全局最长匹配。
  // 同一前缀同时出现在内置表与覆盖表时，覆盖优先。
  const builtins = new Map(PRICE_TABLE.map((e) => [e.prefix, e.price]));
  const prefixes = new Set<string>([...builtins.keys(), ...overrides.keys()]);
  prefixes.delete("*");
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (model.startsWith(prefix)) {
      const override = overrides.get(prefix);
      if (override) return override;
      const builtin = builtins.get(prefix);
      if (builtin) return builtin;
    }
  }
  return overrides.get("*") ?? FALLBACK_PRICE;
}

/** token → 人民币成本（元，保留 6 位小数） */
export function computeCost(model: string, promptTokens: number, completionTokens: number): number {
  const { input, output } = getPrice(model);
  const cost = (promptTokens / 1_000_000) * input + (completionTokens / 1_000_000) * output;
  return Math.round(cost * 1e6) / 1e6;
}
