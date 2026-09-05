import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { updateJobSchema } from "@/shared/schemas";
import { getJob, softDeleteJob, updateJob } from "@/server/core/job-service";

type Params = { params: Promise<{ id: string }> };

export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  return ok(await getJob(user!.id, id));
});

export const PATCH = defineRoute(
  { auth: true, body: updateJobSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    return ok(await updateJob(user!.id, id, body));
  },
);

export const DELETE = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  await softDeleteJob(user!.id, id);
  return ok({ success: true });
});
