import { createChinaSiteAdapter } from "./china-site";
import { getChinaSite } from "../core/site-catalog";

/**
 * 拉勾适配器（仅辅助导入）。
 * URL 提取规则 NEEDS_VERIFICATION：/wn/jobs/<id>.html 与 /job/<id>.html 两种形态，未命中回退通用规则。
 */
export const lagouAdapter = createChinaSiteAdapter(getChinaSite("lagou")!, [
  /lagou\.com\/wn\/jobs\/(\d+)/i,
  /lagou\.com\/job\/(\d+)/i,
]);
