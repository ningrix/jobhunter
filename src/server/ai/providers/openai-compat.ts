import { AppError, ErrorCode } from "@/shared/errors";
import { sanitizeSecretMessage } from "@/lib/crypto";
import type { AIProvider, ChatRequest, ChatResult } from "./mock";

interface OpenAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  embedModel: string;
}

/** 用户级覆盖配置（来自 ai_settings，key 已解密），缺省回落 env */
export interface OpenAICompatOverride {
  baseUrl: string;
  apiKey: string;
  model?: string;
  embedModel?: string;
}

function envConfig(): OpenAIConfig {
  const baseUrl = process.env.AI_OPENAI_BASE_URL;
  const apiKey = process.env.AI_OPENAI_API_KEY;
  const model = process.env.AI_OPENAI_MODEL ?? "gpt-4o-mini";
  const embedModel = process.env.AI_OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
  if (!baseUrl || !apiKey) {
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      "OpenAI 兼容 Provider 未配置：请设置 AI_OPENAI_BASE_URL 与 AI_OPENAI_API_KEY",
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model, embedModel };
}

/** OpenAI 兼容 Chat Completions Provider（GLM / DeepSeek / Qwen 等） */
export class OpenAICompatProvider implements AIProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly override?: OpenAICompatOverride;

  constructor(override?: OpenAICompatOverride) {
    this.override = override;
    this.model =
      override?.model ?? process.env.AI_OPENAI_MODEL ?? "gpt-4o-mini";
  }

  private config(): OpenAIConfig {
    if (this.override) {
      return {
        baseUrl: this.override.baseUrl.replace(/\/$/, ""),
        apiKey: this.override.apiKey,
        model: this.override.model ?? process.env.AI_OPENAI_MODEL ?? "gpt-4o-mini",
        embedModel:
          this.override.embedModel ??
          process.env.AI_OPENAI_EMBED_MODEL ??
          "text-embedding-3-small",
      };
    }
    return envConfig();
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const cfg = this.config();
    const messages: { role: string; content: string }[] = [
      {
        role: "system",
        content:
          "你是一个严格的 JSON 输出引擎，只输出合法 JSON，不要输出 markdown 代码块或任何解释文字。",
      },
      { role: "user", content: req.prompt },
    ];
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: 0.2,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new AppError(
        ErrorCode.AI_PROVIDER_ERROR,
        sanitizeSecretMessage(
          `模型请求失败: ${e instanceof Error ? e.message : String(e)}`,
          cfg.apiKey,
        ),
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AppError(
        ErrorCode.AI_PROVIDER_ERROR,
        sanitizeSecretMessage(`模型返回 ${res.status}: ${body.slice(0, 300)}`, cfg.apiKey),
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AppError(ErrorCode.AI_PROVIDER_ERROR, "模型响应缺少 content");
    }
    return {
      content,
      provider: this.name,
      model: cfg.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  async embed(text: string): Promise<{ vector: number[]; model: string }> {
    const cfg = this.config();
    const res = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.embedModel, input: text }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `embedding 请求返回 ${res.status}`);
    }
    const data = (await res.json()) as { data?: { embedding: number[] }[] };
    const vector = data.data?.[0]?.embedding;
    if (!vector) throw new AppError(ErrorCode.AI_PROVIDER_ERROR, "embedding 响应缺少向量");
    return { vector, model: cfg.embedModel };
  }
}
