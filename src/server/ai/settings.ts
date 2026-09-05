import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { modelBaseUrl } from "@/shared/ai-models";
import { decryptSecret, encryptSecret, maskSecret, sanitizeSecretMessage } from "@/lib/crypto";
import { OpenAICompatProvider } from "./providers/openai-compat";
import type { AIProvider } from "./providers/mock";

export interface AiSettingsView {
  configured: boolean;
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  updatedAt: string | null;
}

export async function getAiSettingsView(userId: string): Promise<AiSettingsView> {
  const [row] = await getDb()
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1);
  if (!row) {
    return {
      configured: false,
      enabled: false,
      provider: "openai-compat",
      baseUrl: "",
      model: "",
      apiKeyMasked: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    enabled: row.enabled,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKeyMasked: maskSecret(decryptSecret(row.apiKeyEnc)),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 保存用户 AI 配置：baseUrl 由所选模型自动派生（目录注册表），首次必须带 apiKey；更新时缺省保留已存密文 */
export async function upsertAiSettings(
  userId: string,
  input: { model: string; apiKey?: string; enabled?: boolean },
): Promise<AiSettingsView> {
  const baseUrl = modelBaseUrl(input.model);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1);
  if (!existing && !input.apiKey) {
    throw new AppError(ErrorCode.VALIDATION, "首次配置需要提供 API Key");
  }
  const values = {
    userId,
    provider: "openai-compat" as const,
    baseUrl,
    model: input.model,
    enabled: input.enabled ?? existing?.enabled ?? true,
    apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : existing!.apiKeyEnc,
  };
  if (existing) {
    await db.update(aiSettings).set(values).where(eq(aiSettings.userId, userId));
  } else {
    await db.insert(aiSettings).values(values);
  }
  return getAiSettingsView(userId);
}

export async function clearAiSettings(userId: string): Promise<void> {
  await getDb().delete(aiSettings).where(eq(aiSettings.userId, userId));
}

/** gateway 取 provider 用：有启用的用户配置 → 用户专属 Provider；否则 null（回落 env 默认） */
export async function resolveUserProvider(userId: string): Promise<AIProvider | null> {
  const [row] = await getDb()
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1);
  if (!row || !row.enabled) return null;
  return new OpenAICompatProvider({
    baseUrl: row.baseUrl,
    apiKey: decryptSecret(row.apiKeyEnc),
    model: row.model,
  });
}

export interface AiConnectionTestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  error?: string;
}

/** 连接测试：优先用表单值（保存前即可测），缺省项回落已存配置；baseUrl 由模型名派生；错误消息脱敏 */
export async function testAiConnection(
  userId: string,
  input?: { model?: string; apiKey?: string },
): Promise<AiConnectionTestResult> {
  const [saved] = await getDb()
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1);
  const model = input?.model ?? saved?.model;
  const apiKey = input?.apiKey ?? (saved ? decryptSecret(saved.apiKeyEnc) : undefined);
  if (!model || !apiKey) {
    throw new AppError(ErrorCode.VALIDATION, "测试连接需要选择模型并填写 API Key（或先保存配置）");
  }
  const provider = new OpenAICompatProvider({ baseUrl: modelBaseUrl(model), apiKey, model });
  try {
    await provider.chat({
      scene: "connection-test",
      prompt: "连接测试：请原样回复 ok",
      input: {},
      json: false,
    });
    return { ok: true, provider: provider.name, model };
  } catch (e) {
    const msg =
      e instanceof AppError
        ? e.message
        : `连接失败: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, error: sanitizeSecretMessage(msg, apiKey) };
  }
}
