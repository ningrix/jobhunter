import { AppError, ErrorCode } from "@/shared/errors";
import type { UnifiedJob } from "@/shared/types";
import type { JobSource } from "../core/types";
import { extractSourceJobId, normalizeToUnified } from "../core/normalizer";

const MIN_JD_LENGTH = 30;

/**
 * BOSS直聘适配器（第一期：仅辅助导入）。
 *
 * 明确不做（安全与合规边界）：
 * - 不自动登录、不获取/存储 Cookie 与凭证
 * - 不绕过验证码 / 风控 / 反爬
 * - 不做批量自动搜索与自动投递
 *
 * 工作方式：用户在自己浏览器打开职位页（已登录自己的账号），复制 URL 与 JD 文本
 * 粘贴到 Job Hunter；本适配器只负责提取 sourceJobId 与解析归一。
 */
export const bossJobSource: JobSource = {
  id: "boss",
  meta: () => ({
    id: "boss",
    name: "BOSS直聘",
    status: "available",
    capabilities: {
      search: false,
      assistedImport: true,
      autoApply: "none",
      requiresLogin: true,
      notes:
        "无公开 API。第一期仅支持辅助导入：用户复制职位 URL + JD 粘贴导入；登录在用户自己的浏览器完成，凭证不进入本系统",
    },
  }),
  capabilities: () => bossJobSource.meta().capabilities,
  healthCheck: async () => ({ ok: true, detail: "辅助导入模式可用（未连接平台账号）" }),
  async importAssisted(input) {
    const cleanLength = (input.text ?? "").replace(/<[^>]+>/g, "").trim().length;
    if (cleanLength < MIN_JD_LENGTH) {
      throw new AppError(
        ErrorCode.IMPORT_INVALID,
        "BOSS 导入需要粘贴完整 JD 文本：网站无公开接口，仅凭 URL 无法获取职位详情。请在职位页复制 JD 描述后重试",
        { url: input.url, receivedLength: cleanLength, requiredLength: MIN_JD_LENGTH },
      );
    }
    const sourceJobId = input.sourceJobId ?? extractSourceJobId(input.url, "boss");
    return normalizeToUnified({
      source: "boss",
      url: input.url,
      text: input.text!,
      sourceJobId,
      rawData: input.rawData,
    });
  },
};
