import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { tailorResumeSchema } from "@/shared/schemas";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";
import { getJob } from "@/server/core/job-service";
import { getLatestVersion, getVersion } from "@/server/core/resume-service";

type Params = { params: Promise<{ id: string }> };

/** JD → 简历定制分析：AI 只输出覆盖/差距/建议，不改写用户简历数据 */
export const POST = defineRoute({ auth: true, body: tailorResumeSchema }, async ({ user, params, body }) => {
  const { id } = params as unknown as { id: string };
  const { version } = body.versionId
    ? { version: await getVersion(user!.id, id, body.versionId) }
    : await getLatestVersion(user!.id, id);
  const { job } = await getJob(user!.id, body.jobId);

  const task = await enqueueTask(user!.id, "tailor_resume", {
    resumeId: id,
    versionId: version.id,
    content: version.content,
    job: {
      title: job.title,
      companyName: job.companyName,
      structured: job.structured,
    },
  });
  runTaskAsync(task.id);
  return ok({ taskId: task.id }, 202);
});
