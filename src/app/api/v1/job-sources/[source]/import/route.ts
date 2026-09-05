import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { importJobSchema } from "@/shared/schemas";
import { importJobFromSource } from "@/server/job-sources/import-service";

type Params = { params: Promise<{ source: string }> };

/** 用户辅助导入：来源 + URL + 粘贴 JD → 归一 → 去重 → 建职位 */
export const POST = defineRoute(
  { auth: true, body: importJobSchema },
  async ({ user, params, body }) => {
    const { source } = params as unknown as { source: string };
    const result = await importJobFromSource(user!.id, {
      source,
      url: body.url,
      text: body.text,
      sourceJobId: body.sourceJobId,
      rawData: body.rawData as Record<string, unknown> | undefined,
    });
    return ok(result, 201);
  },
);
