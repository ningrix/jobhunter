import { createChinaSiteAdapter } from "./china-site";
import { getChinaSite } from "../core/site-catalog";

/**
 * 猎聘适配器（仅辅助导入）。
 * URL 提取规则 NEEDS_VERIFICATION：/job/<id>（.shtml/.html 均尝试），未命中回退通用规则。
 */
export const liepinAdapter = createChinaSiteAdapter(getChinaSite("liepin")!, [
  /liepin\.com\/job\/([0-9a-zA-Z]+)/i,
]);
