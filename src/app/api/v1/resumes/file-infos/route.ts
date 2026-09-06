import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { listResumeFileInfos } from "@/server/core/resume-service";

/** Stage B：列表页解析状态与文件信息，按 resumeId 索引 */
export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await listResumeFileInfos(user!.id));
});
