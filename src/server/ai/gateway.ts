import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiUsageLogs } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { PROMPTS } from "./prompts";
import { MockProvider, type AIProvider, type ChatResult } from "./providers/mock";
import { OpenAICompatProvider } from "./providers/openai-compat";
import { resolveUserProvider } from "./settings";

/**
 * Provider 解析：用户配置了自带 AI 凭据（ai_settings 且 enabled）时优先使用用户专属 Provider，
 * 否则回落 env 全局默认（mock / openai）。业务与限额逻辑不受影响。
 */
export async function getProvider(userId?: string | null): Promise<AIProvider> {
  if (userId) {
    const userProvider = await resolveUserProvider(userId);
    if (userProvider) return userProvider;
  }
  const name = process.env.AI_PROVIDER ?? "mock";
  if (name === "openai") return new OpenAICompatProvider();
  return new MockProvider();
}

export function stripCodeFence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

export interface RunAIMeta extends ChatResult {
  durationMs: number;
}

/**
 * AI 网关统一入口：限额 → Provider 调用（真实 Provider 带重试）→ JSON 解析 → 用量计量落库。
 * 前端与业务代码永远不直接接触 Provider。
 */
export async function runAI<T>(
  scene: string,
  input: unknown,
  opts: { userId?: string | null; taskId?: string | null } = {},
): Promise<{ result: T; meta: RunAIMeta }> {
  const userId = opts.userId ?? null;

  // 限额：按用户按自然日统计
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 200);
  if (userId && limit > 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [row] = await getDb()
      .select({ n: count() })
      .from(aiUsageLogs)
      .where(and(eq(aiUsageLogs.userId, userId), gte(aiUsageLogs.createdAt, start)));
    if (Number(row.n) >= limit) {
      throw new AppError(ErrorCode.AI_LIMIT_EXCEEDED, "今日 AI 调用次数已达上限，请明天再试");
    }
  }

  const promptFn = PROMPTS[scene];
  if (!promptFn) throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `未知 AI 场景: ${scene}`);
  const prompt = promptFn(input);

  const provider = await getProvider(userId);
  const started = Date.now();
  const maxAttempts = provider.name === "mock" ? 1 : 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const chat = await provider.chat({ scene, prompt, input, json: true });
      const parsed = JSON.parse(stripCodeFence(chat.content)) as T;
      const meta: RunAIMeta = { ...chat, durationMs: Date.now() - started };
      await logUsage({ userId, taskId: opts.taskId ?? null, meta, scene, error: null });
      return { result: parsed, meta };
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }

  // 全部重试失败：记录失败用量便于成本核算与排障
  const meta: RunAIMeta = {
    content: "",
    provider: provider.name,
    model: provider.model,
    promptTokens: 0,
    completionTokens: 0,
    durationMs: Date.now() - started,
  };
  await logUsage({
    userId,
    taskId: opts.taskId ?? null,
    meta,
    scene,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }).catch(() => undefined);

  const message =
    lastError instanceof AppError
      ? lastError.message
      : `AI 调用失败（场景 ${scene}）: ${lastError instanceof Error ? lastError.message : String(lastError)}`;
  throw new AppError(ErrorCode.AI_PROVIDER_ERROR, message);
}

async function logUsage(args: {
  userId: string | null;
  taskId: string | null;
  meta: RunAIMeta;
  scene: string;
  error: string | null;
}): Promise<void> {
  await getDb().insert(aiUsageLogs).values({
    userId: args.userId,
    taskId: args.taskId,
    scene: args.error ? `${args.scene}:error` : args.scene,
    provider: args.meta.provider,
    model: args.meta.model,
    promptTokens: args.meta.promptTokens,
    completionTokens: args.meta.completionTokens,
    cost: 0, // 接入真实 Provider 后按价格表折算
  });
}
