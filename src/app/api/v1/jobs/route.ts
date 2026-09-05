import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { createJobSchema, listJobsQuerySchema } from "@/shared/schemas";
import { createJob, listJobs } from "@/server/core/job-service";

export const GET = defineRoute({ auth: true, query: listJobsQuerySchema }, async ({ user, query }) => {
  return ok(await listJobs(user!.id, query));
});

export const POST = defineRoute({ auth: true, body: createJobSchema }, async ({ user, body }) => {
  const { job, taskId } = await createJob(user!.id, body);
  return ok({ job, taskId }, 201);
});
