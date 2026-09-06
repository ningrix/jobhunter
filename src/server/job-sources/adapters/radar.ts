import { createHash } from "node:crypto";
import type { UnifiedJob } from "@/shared/types";
import type { JobSource, RawJobInput } from "../core/types";
import type { RadarSiteInfo } from "../core/site-catalog";

/**
 * V3.3 职位雷达来源：search 由 radar-service 编排（safeFetch + AI 结构化抽取），
 * 本适配器提供统一入口与 importAssisted 归一（复用三级去重/审计闭环）。
 * 红线：只读公开页面、不登录、不自动投递。
 */
export function createRadarAdapter(site: RadarSiteInfo): JobSource {
  return {
    id: "radar",
    meta: () => ({
      id: "radar",
      name: `职位雷达（${site.name}）`,
      status: "available",
      capabilities: {
        search: true,
        assistedImport: true,
        autoApply: "none",
        requiresLogin: false,
        notes: "按「设置→求职条件」自动扫描公开招聘页，AI 结构化抽取后去重入库；只入库不投递",
      },
    }),
    capabilities: () => ({
      search: true,
      assistedImport: true,
      autoApply: "none",
      requiresLogin: false,
      notes: "在「职位来源」页点击「立即扫描」运行雷达；需要先配置自备大模型",
    }),
    healthCheck: async () => ({
      ok: true,
      detail: `雷达就绪（源：${site.name}）；需配置自备模型后扫描`,
    }),
    async importAssisted(input: RawJobInput): Promise<UnifiedJob> {
      const raw = (input.rawData ?? {}) as Record<string, unknown>;
      const companyName = String(raw.companyName ?? "").trim();
      const title = String(raw.title ?? "").trim();
      if (!companyName || !title) {
        throw new Error("雷达候选缺少公司名或职位名");
      }
      const city = String(raw.city ?? "").trim();
      const salaryMin = typeof raw.salaryMin === "number" ? raw.salaryMin : undefined;
      const salaryMax = typeof raw.salaryMax === "number" ? raw.salaryMax : undefined;
      const jobType = String(raw.jobType ?? "校招");
      const employmentType = String(raw.employmentType ?? "全职");
      const postedNote = String(raw.postedNote ?? "").trim();
      const salaryText =
        salaryMin || salaryMax ? `${salaryMin ?? "?"}-${salaryMax ?? "?"}K` : "薪资面议";

      // 稳定 sourceJobId：优先 URL 哈希，保证同一条目重复扫描时精确去重
      const sourceJobId =
        input.sourceJobId ??
        (input.url
          ? createHash("sha256").update(input.url).digest("hex").slice(0, 16)
          : undefined);

      return {
        source: "radar",
        sourceJobId,
        sourceUrl: input.url,
        companyName,
        title,
        description: input.text ?? "",
        city: city || undefined,
        salaryMin,
        salaryMax,
        employmentType,
        jobType,
        skills: [],
        tags: ["雷达"],
        rawData: { ...raw, radarSite: site.id },
      };
    },
  };
}
