import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { latestAnalysis } from "@/server/core/resume-service";

export const GET = defineRoute({ auth: true }, async ({ user, params, query }) => {
  const { id } = params as unknown as { id: string };
  const versionId = (query as unknown as { versionId?: string } | undefined)?.versionId;
  return ok(await latestAnalysis(id, versionId || undefined));
});
