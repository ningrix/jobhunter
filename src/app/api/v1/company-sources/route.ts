import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { COMPANY_CATEGORIES, COMPANY_SOURCES, listCompanySources } from "@/server/core/company-sources";

/** 大厂官方招聘入口目录（静态数据，无用户态；登录即可见） */
export const GET = defineRoute({ auth: true }, async () => {
  return ok({
    categories: COMPANY_CATEGORIES,
    total: COMPANY_SOURCES.length,
    verifiedCount: COMPANY_SOURCES.filter((c) => c.verified).length,
    items: listCompanySources(),
  });
});
