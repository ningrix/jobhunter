import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { optimizeResumeSchema } from "@/shared/schemas";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";
import { getLatestVersion, getVersion } from "@/server/core/resume-service";

export const POST = defineRoute(
  { auth: true, body: optimizeResumeSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    const { version } = body.versionId
      ? { version: await getVersion(user!.id, id, body.versionId) }
      : await getLatestVersion(user!.id, id);

    const task = await enqueueTask(user!.id, "optimize_resume", {
      resumeId: id,
      versionId: version.id,
      content: version.content,
      jobTitle: body.jobTitle,
    });
    runTaskAsync(task.id);
    return ok({ taskId: task.id, versionId: version.id }, 202);
  },
);
