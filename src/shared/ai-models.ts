import { AppError, ErrorCode } from "@/shared/errors";

/**
 * 国产大模型目录（OpenAI 兼容端点）：前后端共用的单一事实源。
 * 用户只需选模型名，baseUrl 由目录自动派生，前端不出现任何 URL 输入。
 * 新增模型 = 在此加一行。型号更新于 2026-09（以各官方文档为准，测试连接可即时验证）。
 */
export interface AiModelOption {
  id: string; // 传给 API 的 model 名
  label: string; // 下拉展示名
  group: string; // 服务商分组
  baseUrl: string; // 自动派生的 OpenAI 兼容端点
}

export const AI_MODELS: AiModelOption[] = [
  // 智谱 GLM — https://docs.bigmodel.cn（2026-08 起 GLM-5.3 为旗舰，旧型号调用自动迁移）
  { id: "glm-5.3", label: "GLM-5.3（旗舰·编程/Agent 最强）", group: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "glm-5.3-flash", label: "GLM-5.3-Flash（多模态·低成本）", group: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "glm-4-flash", label: "GLM-4-Flash（经典低价档）", group: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  // DeepSeek — https://api-docs.deepseek.com（2026-07-31 V4-Flash 正式版；V4 起不再用 chat/reasoner 双轨命名）
  { id: "deepseek-v4-flash", label: "DeepSeek-V4-Flash（最新·快）", group: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "deepseek-v4-pro", label: "DeepSeek-V4-Pro（旗舰）", group: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  // Kimi · 月之暗面 — https://platform.moonshot.cn（K2.6 为 2026-04 旗舰）
  { id: "kimi-k2.6", label: "Kimi-K2.6（旗舰·多模态 Agentic）", group: "Kimi · 月之暗面", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "moonshot-v1-8k", label: "moonshot-v1-8k（稳定低价档）", group: "Kimi · 月之暗面", baseUrl: "https://api.moonshot.cn/v1" },
  // 通义千问 — 阿里云百炼（2026-09 在售：3.8 系列为最新一代）
  { id: "qwen3.8-max", label: "Qwen3.8-Max（旗舰）", group: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "qwen3.7-plus", label: "Qwen3.7-Plus（均衡）", group: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "qwen3.8-flash", label: "Qwen3.8-Flash（快速·低成本）", group: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
];

/** 按模型名解析 baseUrl；未知模型抛校验错误（提示可选清单） */
export function modelBaseUrl(model: string): string {
  const hit = AI_MODELS.find((m) => m.id === model);
  if (!hit) {
    throw new AppError(
      ErrorCode.VALIDATION,
      `暂不支持模型「${model}」，可选：${AI_MODELS.map((m) => m.id).join("、")}`,
    );
  }
  return hit.baseUrl;
}

export const AI_MODEL_GROUPS: string[] = [...new Set(AI_MODELS.map((m) => m.group))];
