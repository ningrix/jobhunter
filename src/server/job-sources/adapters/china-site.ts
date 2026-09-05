import { AppError, ErrorCode } from "@/shared/errors";
import type { UnifiedJob } from "@/shared/types";
import type { JobSource, RawJobInput } from "../core/types";
import type { ChinaSiteInfo } from "../core/site-catalog";
import { extractWithPatterns } from "../core/site-catalog";
import { extractSourceJobId, normalizeToUnified } from "../core/normalizer";

const MIN_JD_LENGTH = 30;

/**
 * 国内招聘站点适配器工厂：与 BossAdapter 同策略——
 * 仅辅助导入（无公开 API），不自动登录/不绕过安全校验/不自动投递。
 * URL → sourceJobId 提取失败不阻塞导入（去重回退内容指纹）。
 */
export function createChinaSiteAdapter(site: ChinaSiteInfo, urlPatterns: RegExp[]): JobSource {
  const verificationNote = site.needsVerification
    ? "（URL 职位 ID 提取规则 NEEDS_VERIFICATION：提取不到不阻塞导入）"
    : "";
  return {
    id: site.id,
    meta: () => ({
      id: site.id,
      name: site.name,
      status: "available",
      capabilities: {
        search: false,
        assistedImport: true,
        autoApply: "none",
        requiresLogin: true,
        notes: `无公开 API。仅支持辅助导入：复制职位 URL + JD 粘贴导入${verificationNote}；登录在用户自己的浏览器完成，凭证不进入本系统`,
      },
    }),
    capabilities: () => ({
      search: false,
      assistedImport: true,
      autoApply: "none",
      requiresLogin: true,
      notes: `无公开 API。仅支持辅助导入${verificationNote}`,
    }),
    healthCheck: async () => ({ ok: true, detail: "辅助导入模式可用（未连接平台账号）" }),
    async importAssisted(input: RawJobInput): Promise<UnifiedJob> {
      const cleanLength = (input.text ?? "").replace(/<[^>]+>/g, "").trim().length;
      if (cleanLength < MIN_JD_LENGTH) {
        throw new AppError(
          ErrorCode.IMPORT_INVALID,
          `${site.name}导入需要粘贴完整 JD 文本：网站无公开接口，仅凭 URL 无法获取职位详情。请在职位页复制 JD 描述后重试`,
          { url: input.url, receivedLength: cleanLength, requiredLength: MIN_JD_LENGTH },
        );
      }
      const sourceJobId =
        input.sourceJobId ??
        extractWithPatterns(input.url, urlPatterns) ??
        extractSourceJobId(input.url, site.id); // 通用兜底（job_detail/<id>、jobId= 参数）
      return normalizeToUnified({
        source: site.id,
        url: input.url,
        text: input.text!,
        sourceJobId,
        rawData: input.rawData,
      });
    },
  };
}
