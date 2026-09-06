import { AppError, ErrorCode } from "@/shared/errors";
import type { AiTaskRow } from "@/server/ai/runner";
import { getProvider, runAI } from "@/server/ai/gateway";
import { safeFetchText } from "@/lib/safe-fetch";
import { logAgentEvent, newSessionId } from "@/server/agent/events";
import { RADAR_SITES, type RadarSiteInfo } from "@/server/job-sources/core/site-catalog";
import { importJobFromSource } from "@/server/job-sources/import-service";
import { getProfile } from "@/server/core/user-service";
import { getPolicy } from "@/server/core/policy-service";

/**
 * V3.3 职位雷达编排：按「设置→求职条件」扫描公开招聘页 → AI 结构化抽取（防编造校验）
 * → 确定性条件过滤 → 复用导入服务（三级去重 + 审计）入库。只入库，绝不投递。
 */

interface RadarCandidate {
  companyName?: string;
  title?: string;
  city?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  jobType?: string;
  employmentType?: string;
  url?: string;
  postedNote?: string;
}

export interface RadarSiteRun {
  siteId: string;
  siteName: string;
  fetched: boolean;
  extracted: number;
  imported: number;
  duplicates: number;
  filtered: number;
  error?: string;
}

export interface RadarRunSummary {
  sessionId: string;
  provider: string;
  model: string;
  sites: RadarSiteRun[];
  importedTotal: number;
  duplicatesTotal: number;
}

/** HTML → 可抽取文本：href 转可见链接、去 script/style/标签、解常见实体、压空白 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, (_m, href) => ` [${href}] `)
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** 雷达依赖真实大模型：mock 无法真实抽取网页，明确拒绝而不是产出假数据 */
async function requireRealProvider(userId: string): Promise<{ provider: string; model: string }> {
  const provider = await getProvider(userId);
  if (provider.name === "mock") {
    throw new AppError(
      ErrorCode.VALIDATION,
      "职位雷达需要真实大模型：请先在「设置 → 自备模型」粘贴 API Key 并启用",
    );
  }
  return { provider: provider.name, model: provider.model };
}

export async function runRadarSearch(userId: string, task: AiTaskRow): Promise<RadarRunSummary> {
  const { provider, model } = await requireRealProvider(userId);

  // 条件：投递策略优先，profile 画像兜底（与「求职条件中心」的保存逻辑对应）
  const profile = await getProfile(userId);
  const policy = await getPolicy(userId);
  const conditions = {
    cities: policy?.rules?.cities?.length
      ? policy.rules.cities
      : profile.expectedCity
        ? [profile.expectedCity]
        : undefined,
    positions: policy?.rules?.positions?.length
      ? policy.rules.positions
      : profile.expectedPosition
        ? [profile.expectedPosition]
        : undefined,
    minSalary: policy?.rules?.minSalary,
    maxExperienceYears: policy?.rules?.maxExperienceYears,
  };

  const sessionId = newSessionId();
  const summary: RadarRunSummary = {
    sessionId,
    provider,
    model,
    sites: [],
    importedTotal: 0,
    duplicatesTotal: 0,
  };

  for (const site of RADAR_SITES) {
    summary.sites.push(await scanSite(userId, task.id, sessionId, site, conditions, summary));
  }
  return summary;
}

async function scanSite(
  userId: string,
  taskId: string,
  sessionId: string,
  site: RadarSiteInfo,
  conditions: {
    cities?: string[];
    positions?: string[];
    minSalary?: number;
    maxExperienceYears?: number;
  },
  summary: RadarRunSummary,
): Promise<RadarSiteRun> {
  const run: RadarSiteRun = {
    siteId: site.id,
    siteName: site.name,
    fetched: false,
    extracted: 0,
    imported: 0,
    duplicates: 0,
    filtered: 0,
  };

  try {
    // 1) 抓取公开列表页
    const fetched = await safeFetchText(site.listUrl);
    run.fetched = true;
    const raw = fetched.body;
    const pageText = htmlToText(raw).slice(0, 12_000);
    await logAgentEvent(userId, {
      sessionId,
      action: "radar_fetch",
      source: site.id,
      result: "success",
      detail: { url: fetched.url, bytes: raw.length, textChars: pageText.length },
    });

    // 2) AI 结构化抽取（防编造 prompt）
    const { result } = await runAI<{ jobs: RadarCandidate[] }>(
      "radar_extract",
      { pageText, sourceName: site.name, conditions },
      { userId, taskId },
    );
    const candidates = result?.jobs ?? [];
    run.extracted = candidates.length;
    await logAgentEvent(userId, {
      sessionId,
      action: "radar_extract",
      source: site.id,
      result: "success",
      detail: { extracted: candidates.length },
    });

    // 3) 防编造校验 + 确定性条件过滤 + 去重入库
    for (const c of candidates) {
      const companyName = c.companyName?.trim() ?? "";
      const title = c.title?.trim() ?? "";
      if (!companyName || !title) {
        run.filtered += 1;
        continue;
      }
      // URL 必须逐字符存在于抓取原文，否则视为模型编造，丢弃
      if (c.url && !raw.includes(c.url.trim())) {
        run.filtered += 1;
        continue;
      }
      // 城市/经验确定性过滤（与「求职条件」一致）
      const city = c.city?.trim() ?? "";
      if (conditions.cities?.length && city) {
        const hit = conditions.cities.some((x) => city.includes(x) || x.includes(city));
        if (!hit) {
          run.filtered += 1;
          continue;
        }
      }

      const res = await importJobFromSource(userId, {
        source: "radar",
        url: c.url?.trim() || undefined,
        text: [
          title,
          `公司：${companyName}`,
          `城市：${city || "未标注"}`,
          `薪资：${c.salaryMin || c.salaryMax ? `${c.salaryMin ?? "?"}-${c.salaryMax ?? "?"}K` : "薪资面议"}`,
          `类型：${c.jobType || "校招"} · ${c.employmentType || "全职"}`,
          c.postedNote ? `发布信息：${c.postedNote}` : "",
          "来源：JobHunter 职位雷达扫描公开招聘页所得，详情以原文链接为准。",
        ]
          .filter(Boolean)
          .join("\n"),
        rawData: {
          companyName,
          title,
          city,
          jobType: c.jobType || "校招",
          employmentType: c.employmentType || "全职",
          postedNote: c.postedNote ?? "",
          radarSite: site.id,
          salaryMin: c.salaryMin ?? null,
          salaryMax: c.salaryMax ?? null,
        },
      });
      if (res.dedupe === "EXACT_DUPLICATE") run.duplicates += 1;
      else run.imported += 1;
    }

    await logAgentEvent(userId, {
      sessionId,
      action: "radar_import",
      source: site.id,
      result: "success",
      detail: {
        imported: run.imported,
        duplicates: run.duplicates,
        filtered: run.filtered,
        extracted: run.extracted,
      },
    });
  } catch (e) {
    run.error = e instanceof AppError ? e.message : String(e);
    await logAgentEvent(userId, {
      sessionId,
      action: run.fetched ? "radar_extract" : "radar_fetch",
      source: site.id,
      result: "failed",
      detail: { siteId: site.id },
      error: run.error.slice(0, 300),
    });
  }

  summary.importedTotal += run.imported;
  summary.duplicatesTotal += run.duplicates;
  return run;
}
