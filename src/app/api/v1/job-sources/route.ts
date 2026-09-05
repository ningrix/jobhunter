import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { healthCheckAll, listJobSources } from "@/server/job-sources/core/registry";
import { CHINA_SITES } from "@/server/job-sources/core/site-catalog";
import { registerBuiltinJobSources } from "@/server/job-sources/builtin";

/** 来源官网（站内目录没有的在这里补齐） */
const OFFICIAL_URLS: Record<string, string> = {
  boss: "https://www.zhipin.com",
};

/** 来源列表 + 能力模型 + 健康状态 + 国内站点目录（供 Job Sources 页面渲染连接状态） */
export const GET = defineRoute({ auth: true }, async () => {
  registerBuiltinJobSources();
  const [sources, health] = await Promise.all([listJobSources(), healthCheckAll()]);
  // 增量富化：sourceType / officialUrl / directLink（V3.1 来源交互）
  const enriched = sources.map((s) => {
    const site = CHINA_SITES.find((c) => c.id === s.id);
    const officialUrl = site?.homepage ?? OFFICIAL_URLS[s.id] ?? null;
    return {
      ...s,
      sourceType: site ? "china_portal" : s.id === "mock" ? "mock" : "custom",
      officialUrl,
      directLink: officialUrl != null,
      site: site ?? null,
    };
  });
  return ok({ sources: enriched, health, sites: CHINA_SITES });
});
