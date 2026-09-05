import { createChinaSiteAdapter } from "./china-site";
import { getChinaSite } from "../core/site-catalog";

/**
 * 前程无忧（51Job）适配器（仅辅助导入）。
 * URL 提取规则 NEEDS_VERIFICATION：公开页面曾见 /<digits>.html 数字形态，未命中回退通用规则。
 */
export const job51Adapter = createChinaSiteAdapter(getChinaSite("job51")!, [
  /51job\.com\/[^\s]*?\/(\d{6,})\.html/i,
]);
