/**
 * 国内招聘站点目录：来源元数据的唯一维护处（Phase 7 Company Intelligence 的地基）。
 *
 * ⚠️ NEEDS_VERIFICATION：以下站点的「职位 URL → sourceJobId」提取规则均未在真实站点逐一实证，
 * 适配器对提取失败采取宽松策略（sourceJobId 置空，不阻塞导入；去重回退内容指纹）。
 * 在真实站点 Smoke 验证前，不得将任何规则当作事实写入文档。
 */

export interface ChinaSiteInfo {
  id: string;
  name: string;
  homepage: string;
  /** 求职入口提示（辅助导入页展示给用户的操作指引） */
  careersHint: string;
  needsVerification: boolean;
}

export const CHINA_SITES: ChinaSiteInfo[] = [
  {
    id: "liepin",
    name: "猎聘",
    homepage: "https://www.liepin.com",
    careersHint: "在猎聘职位详情页复制 URL 与 JD 全文后粘贴导入",
    needsVerification: true,
  },
  {
    id: "zhilian",
    name: "智联招聘",
    homepage: "https://www.zhaopin.com",
    careersHint: "在智联职位详情页复制 URL 与 JD 全文后粘贴导入",
    needsVerification: true,
  },
  {
    id: "lagou",
    name: "拉勾招聘",
    homepage: "https://www.lagou.com",
    careersHint: "在拉勾职位详情页复制 URL 与 JD 全文后粘贴导入",
    needsVerification: true,
  },
  {
    id: "job51",
    name: "前程无忧",
    homepage: "https://www.51job.com",
    careersHint: "在前程无忧职位详情页复制 URL 与 JD 全文后粘贴导入",
    needsVerification: true,
  },
];

export function getChinaSite(id: string): ChinaSiteInfo | undefined {
  return CHINA_SITES.find((s) => s.id === id);
}

/** 按站点模式宽松提取 sourceJobId；全部未命中返回 undefined（不阻塞导入） */
export function extractWithPatterns(url: string | undefined, patterns: RegExp[]): string | undefined {
  if (!url) return undefined;
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

// ———— V3.3：职位雷达站点目录（服务端抓取公开列表页 → AI 结构化抽取 → 去重入库） ————

export interface RadarSiteInfo {
  id: string;
  name: string;
  /** 公开列表页 URL（服务端 safeFetch 抓取，不登录、不碰验证码） */
  listUrl: string;
  note: string;
  needsVerification: boolean;
}

/**
 * ⚠️ NEEDS_VERIFICATION：站点可抓性随反爬策略波动。
 * v1 仅收录已验证服务端可抓的猎聘 m 站校招企业列表；后续加源 = 追加一行。
 */
export const RADAR_SITES: RadarSiteInfo[] = [
  {
    id: "liepin-campus",
    name: "猎聘 · 校园招聘企业列表",
    listUrl: "https://m.liepin.com/campus/comp-list/",
    note: "公开校招企业列表页，无需登录；曾于 2026-09 实测服务端可抓取",
    needsVerification: true,
  },
];
