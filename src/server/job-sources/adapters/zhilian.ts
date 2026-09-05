import { createChinaSiteAdapter } from "./china-site";
import { getChinaSite } from "../core/site-catalog";

/**
 * 智联招聘适配器（仅辅助导入）。
 * URL 提取规则 NEEDS_VERIFICATION：公开页面曾见 CC<digits>J<digits> 形态与 /job_detail/<id>，
 * 未命中回退通用规则（jobId= 参数）。
 */
export const zhilianAdapter = createChinaSiteAdapter(getChinaSite("zhilian")!, [
  /zhaopin\.com\/[^\s]*\/([A-Z]{2}\d+J\d+)/i,
  /zhaopin\.com\/job_detail\/([0-9a-zA-Z]+)/i,
]);
